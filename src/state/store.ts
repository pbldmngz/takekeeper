import { useEffect, useState } from 'preact/hooks';
import { analyze, segment, type Analysis } from '../audio/analyze';
import { fileKey, openAudio, type Source } from '../audio/wav';
import { Player, type Loaded } from '../audio/player';
import { saveBlob } from '../audio/export';
import { clamp, fmtTime, stem, uid } from '../util';
import {
  TRASH,
  byStart,
  derivedLines,
  finalLane,
  findProjectFor,
  idbGet,
  idbSet,
  laneClips,
  laneName,
  lastProject,
  loadProject,
  loadSettings,
  parseProjectFile,
  projectFileText,
  saveProject,
  saveSettings,
  scriptLines,
  type Clip,
  type Project,
  type Settings,
} from './project';

export type Modal = 'settings' | 'export' | 'help' | 'goto' | null;

export interface AppState {
  phase: 'empty' | 'loading' | 'ready';
  source: Source | null;
  analysis: Analysis | null;
  project: Project | null;
  settings: Settings;
  lane: number;
  cursor: string | null; // clip id
  pos: number; // playhead, absolute frames (authoritative when not playing)
  playing: boolean;
  slow: boolean;
  modal: Modal;
  progress: number | null;
  status: string;
  error: string | null;
  resumable: { key: string; name: string } | null;
  toast: { text: string; n: number } | null;
  scriptEditing: boolean;
  unsaved: number; // edits since the project was last saved to a file
}

const MAX_UNDO = 300;

class Store {
  state: AppState = {
    phase: 'empty',
    source: null,
    analysis: null,
    project: null,
    settings: loadSettings(),
    lane: 0,
    cursor: null,
    pos: 0,
    playing: false,
    slow: false,
    modal: null,
    progress: null,
    status: '',
    error: null,
    resumable: lastProject(),
    toast: null,
    scriptEditing: false,
    unsaved: 0,
  };

  player = new Player();

  private listeners = new Set<() => void>();
  private undoStack: Clip[][] = [];
  private redoStack: Clip[][] = [];
  private bufs = new Map<string, Loaded>();
  private pending = new Set<string>();
  private laneMemory = new Map<number, string>();
  private saveTimer: number | undefined;
  private toastN = 0;
  private playToken = 0;
  private handle: FileSystemFileHandle | null = null;

  constructor() {
    this.player.onEnded = () => this.onPlaybackEnded();
    this.player.setGainDb(this.state.settings.gainDb);
    this.applyTheme();
    document.body.dataset.phase = this.state.phase;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    document.body.dataset.phase = this.state.phase;
    for (const l of this.listeners) l();
  }

  /** Monitoring gain in dB - for hearing quiet takes, never applied to exports. */
  setGain(db: number) {
    db = clamp(Math.round(db), -12, 24);
    this.state.settings.gainDb = db;
    saveSettings(this.state.settings);
    this.player.setGainDb(db);
    this.toast(`monitor ${db >= 0 ? '+' : ''}${db} db`);
  }

  // ---------- derived ----------

  get project() {
    return this.state.project;
  }

  clip(): Clip | null {
    const p = this.state.project;
    if (!p || !this.state.cursor) return null;
    return p.clips.find((c) => c.id === this.state.cursor) ?? null;
  }

  laneList(lane = this.state.lane): Clip[] {
    return this.state.project ? laneClips(this.state.project, lane) : [];
  }

  laneIndexOf(clip: Clip): number {
    return this.laneList(clip.lane).findIndex((c) => c.id === clip.id);
  }

  viewRange(clip: Clip): [number, number] {
    const src = this.state.source!;
    const ctx = Math.round(this.state.settings.contextSeconds * src.sampleRate);
    return [Math.max(0, clip.start - ctx), Math.min(src.frames, clip.end + ctx)];
  }

  /** Playhead in absolute frames, live while playing. */
  playhead(): number {
    return this.state.playing ? this.player.position() : this.state.pos;
  }

  lineOf(clip: Clip): number | undefined {
    return this.state.project ? derivedLines(this.state.project).get(clip.id) : undefined;
  }

  lineText(n: number | undefined): string {
    if (!n || !this.state.project) return '';
    return scriptLines(this.state.project.script)[n - 1] ?? '';
  }

  laneName(lane: number) {
    return this.state.project ? laneName(this.state.project, lane) : '';
  }

  /** Decoded audio for a clip's view range, or null while it loads. */
  bufferFor(clip: Clip): Loaded | null {
    const [vs, ve] = this.viewRange(clip);
    const key = `${vs}-${ve}`;
    const hit = this.bufs.get(key);
    if (hit) return hit;
    if (!this.pending.has(key) && this.state.source) {
      this.pending.add(key);
      this.player
        .decode(this.state.source, vs, ve)
        .then((l) => {
          this.bufs.set(key, l);
          if (this.bufs.size > 48) this.bufs.delete(this.bufs.keys().next().value!);
          this.emit();
        })
        .finally(() => this.pending.delete(key));
    }
    return null;
  }

  private async loadBuffer(clip: Clip): Promise<Loaded> {
    const [vs, ve] = this.viewRange(clip);
    const key = `${vs}-${ve}`;
    const hit = this.bufs.get(key);
    if (hit) return hit;
    const l = await this.player.decode(this.state.source!, vs, ve);
    this.bufs.set(key, l);
    return l;
  }

  // ---------- loading ----------

  async openFile(file: File, handle: FileSystemFileHandle | null = null) {
    const s = this.state;
    if (/\.json$/i.test(file.name) || file.type === 'application/json') return this.importProjectFile(file);
    this.player.stop();
    s.phase = 'loading';
    s.error = null;
    s.progress = 0;
    s.status = 'Reading file…';
    s.playing = false;
    this.emit();
    try {
      const src = await openAudio(file);
      s.source = src;
      s.status = 'Listening for takes…';
      this.emit();
      const an = await analyze(src, s.settings.frameMs, (p) => {
        s.progress = p;
        this.emit();
      });
      s.analysis = an;
      this.bufs.clear();
      this.undoStack = [];
      this.redoStack = [];
      this.laneMemory.clear();

      const exact = loadProject(src.key);
      const existing = exact ?? findProjectFor(src);
      if (existing) {
        if (!exact) {
          existing.key = src.key;
          existing.name = src.name;
        }
        s.project = existing;
        saveProject(existing);
        s.status = '';
      } else {
        s.project = this.freshProject(src, an);
        saveProject(s.project);
      }
      this.handle = handle;
      if (handle) void idbSet(`handle:${src.key}`, handle);
      s.resumable = null;
      s.unsaved = 0;
      s.lane = 0;
      s.phase = 'ready';
      s.progress = null;
      s.status = '';
      const first = this.laneList(0)[0] ?? s.project!.clips.sort(byStart)[0];
      s.cursor = first?.id ?? null;
      s.pos = first?.start ?? 0;
      if (existing) this.toast(`Resumed · ${existing.clips.length} clips`);
      else this.toast(`${s.project.clips.length} takes found`);
    } catch (e) {
      s.phase = 'empty';
      s.progress = null;
      s.error = e instanceof Error ? e.message : String(e);
      s.source = null;
    }
    this.emit();
  }

  private freshProject(src: Source, an: Analysis): Project {
    const st = this.state.settings;
    const segs = segment(an, src.frames, src.sampleRate, st);
    return {
      version: 1,
      key: src.key,
      name: src.name,
      audio: { sampleRate: src.sampleRate, channels: src.channels, bits: src.bits, float: src.float, frames: src.frames },
      clips: segs.map(([start, end]) => ({ id: uid(), start, end, lane: 0 })),
      laneNames: [...st.laneNames],
      script: '',
      detect: { threshold: st.threshold, minSilence: st.minSilence, margin: st.margin },
      savedAt: Date.now(),
    };
  }

  async pickFile() {
    if ('showOpenFilePicker' in window) {
      try {
        const [h] = await window.showOpenFilePicker({
          types: [
            { description: 'Audio', accept: { 'audio/*': ['.wav', '.flac', '.mp3', '.ogg', '.m4a', '.aiff', '.aif'] } },
            { description: 'takekeeper project', accept: { 'application/json': ['.json'] } },
          ],
        });
        await this.openFile(await h.getFile(), h);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) this.fail(e);
      }
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.wav,.flac,.mp3,.ogg,.m4a,.json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void this.openFile(f);
    };
    input.click();
  }

  async resume() {
    const r = this.state.resumable;
    if (!r) return;
    const h = await idbGet<FileSystemFileHandle>(`handle:${r.key}`);
    if (h) {
      try {
        let perm = await h.queryPermission({ mode: 'read' });
        if (perm !== 'granted') perm = await h.requestPermission({ mode: 'read' });
        if (perm === 'granted') {
          const f = await h.getFile();
          if (fileKey(f) === r.key) return this.openFile(f, h);
          this.state.error = 'That file changed on disk since last time - pick it again to start fresh.';
        }
      } catch (e) {
        this.fail(e);
      }
    } else {
      this.state.error = `Pick "${r.name}" again to resume where you left off.`;
    }
    this.emit();
  }

  /** Load a saved project file; the matching recording is picked afterwards. */
  async importProjectFile(file: File) {
    const s = this.state;
    try {
      const p = parseProjectFile(await file.text());
      saveProject(p);
      if (s.phase === 'ready' && s.source && s.source.frames === p.audio.frames && s.source.sampleRate === p.audio.sampleRate) {
        p.key = s.source.key;
        p.name = s.source.name;
        this.undoStack.push(s.project!.clips);
        this.redoStack = [];
        s.project = p;
        saveProject(p);
        this.afterHistory(`project loaded · ${p.clips.length} clips`);
        return;
      }
      s.error = null;
      s.resumable = { key: p.key, name: p.name };
      this.toast(`project loaded · now drop ${p.name}`);
    } catch (e) {
      this.fail(e);
    }
    this.emit();
  }

  /** Save lanes, cuts, line marks and script as a file next to the recording. */
  async saveProjectFile() {
    const p = this.state.project;
    if (!p) return;
    const blob = new Blob([projectFileText(p)], { type: 'application/json' });
    try {
      if (await saveBlob(blob, `${stem(p.name)}.takekeeper.json`)) {
        this.state.unsaved = 0;
        this.toast('project saved');
      }
    } catch (e) {
      this.fail(e);
    }
    this.emit();
  }

  private fail(e: unknown) {
    this.state.error = e instanceof Error ? e.message : String(e);
    this.emit();
  }

  // ---------- persistence / undo ----------

  private persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (this.state.project) saveProject(this.state.project);
    }, 250);
  }

  private commit(fn: (clips: Clip[]) => Clip[]) {
    const p = this.state.project;
    if (!p) return;
    this.undoStack.push(p.clips.map((c) => ({ ...c })));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    p.clips = fn(p.clips);
    this.state.unsaved++;
    this.persist();
    this.emit();
  }

  undo() {
    const p = this.state.project;
    const snap = this.undoStack.pop();
    if (!p || !snap) return this.toast('Nothing to undo');
    this.redoStack.push(p.clips);
    p.clips = snap;
    this.afterHistory('Undo');
  }

  redo() {
    const p = this.state.project;
    const snap = this.redoStack.pop();
    if (!p || !snap) return this.toast('Nothing to redo');
    this.undoStack.push(p.clips);
    p.clips = snap;
    this.afterHistory('Redo');
  }

  private afterHistory(label: string) {
    this.player.stop();
    this.state.playing = false;
    const c = this.clip();
    if (!c || c.lane !== this.state.lane) {
      const first = this.laneList()[0];
      this.state.cursor = first?.id ?? null;
      this.state.pos = first?.start ?? 0;
    } else {
      this.state.pos = clamp(this.state.pos, ...this.viewRange(c));
    }
    this.persist();
    this.toast(label);
  }

  // ---------- navigation ----------

  setLane(lane: number) {
    const p = this.state.project;
    if (!p) return;
    const n = p.laneNames.length + 1; // + trash
    lane = ((lane % n) + n) % n;
    if (lane === p.laneNames.length) lane = TRASH;
    this.player.stop();
    this.state.playing = false;
    this.state.lane = lane;
    const list = this.laneList(lane);
    const remembered = this.laneMemory.get(lane);
    const target = list.find((c) => c.id === remembered) ?? list[0] ?? null;
    this.state.cursor = target?.id ?? null;
    this.state.pos = target?.start ?? 0;
    this.emit();
  }

  gotoClip(id: string, opts: { play?: boolean; slow?: boolean } = {}) {
    const p = this.state.project;
    const c = p?.clips.find((x) => x.id === id);
    if (!p || !c) return;
    if (c.lane !== this.state.lane) this.state.lane = c.lane;
    this.state.cursor = id;
    this.state.pos = c.start;
    this.laneMemory.set(c.lane, id);
    if (opts.play) void this.playFrom(c.start, !!opts.slow);
    else {
      this.player.stop();
      this.state.playing = false;
      this.emit();
    }
    this.prefetchNeighbours(c);
  }

  private prefetchNeighbours(c: Clip) {
    const list = this.laneList(c.lane);
    const i = list.findIndex((x) => x.id === c.id);
    for (const n of [list[i + 1], list[i - 1]]) if (n) this.bufferFor(n);
  }

  move(dir: 1 | -1, opts: { play?: boolean; slow?: boolean } = {}) {
    const list = this.laneList();
    const c = this.clip();
    if (!list.length) return this.toast('Lane is empty');
    if (!c) return this.gotoClip(list[0].id, opts);
    const i = list.findIndex((x) => x.id === c.id);
    const next = list[i + dir];
    if (!next) return this.toast(dir > 0 ? 'End of lane' : 'Start of lane');
    this.gotoClip(next.id, opts);
  }

  step(frames: number) {
    const c = this.clip();
    if (!c) return;
    const [vs, ve] = this.viewRange(c);
    const pos = clamp(Math.round(this.playhead() + frames), vs, ve);
    if (this.state.playing) void this.playFrom(pos, this.state.slow);
    else {
      this.state.pos = pos;
      this.emit();
    }
  }

  home() {
    const c = this.clip();
    if (!c) return;
    if (this.state.playing) void this.playFrom(c.start, this.state.slow);
    else {
      this.state.pos = c.start;
      this.emit();
    }
  }

  end() {
    const c = this.clip();
    if (!c) return;
    this.player.stop();
    this.state.playing = false;
    this.state.pos = c.end;
    this.emit();
  }

  seek(pos: number) {
    const c = this.clip();
    if (!c) return;
    const [vs, ve] = this.viewRange(c);
    pos = clamp(Math.round(pos), vs, ve);
    if (this.state.playing) void this.playFrom(pos, this.state.slow);
    else {
      this.state.pos = pos;
      this.emit();
    }
  }

  // ---------- playback ----------

  togglePlay() {
    if (this.state.playing) {
      this.state.pos = this.player.position();
      this.player.stop();
      this.state.playing = false;
      this.emit();
    } else {
      const c = this.clip();
      if (!c) return;
      const pos = this.state.pos;
      if (pos < c.start) return void this.playFrom(c.start, false); // before IN: this clip from its start
      if (pos >= c.end) {
        // at or past OUT: the next clip in this lane
        const list = this.laneList();
        const next = list[list.findIndex((x) => x.id === c.id) + 1];
        if (next) return this.gotoClip(next.id, { play: true });
        return void this.playFrom(c.start, false);
      }
      void this.playFrom(pos, false);
    }
  }

  async playFrom(pos: number, slow: boolean) {
    const c = this.clip();
    if (!c) return;
    const token = ++this.playToken;
    const l = await this.loadBuffer(c);
    if (token !== this.playToken || this.clip()?.id !== c.id) return;
    const [, ve] = this.viewRange(c);
    const to = pos < c.end ? c.end : ve;
    const rate = slow ? this.state.settings.slowRate : 1;
    this.player.play(l, pos, to, rate);
    this.state.playing = true;
    this.state.slow = slow;
    this.state.pos = pos;
    this.emit();
  }

  private onPlaybackEnded() {
    const c = this.clip();
    this.state.playing = false;
    const endedAtClipEnd = c ? this.player.position() >= c.end - 1 : false;
    this.state.pos = c ? Math.min(this.player.position(), c.end) : 0;
    if (c && endedAtClipEnd && this.state.settings.autoplay && this.state.modal === null) {
      const list = this.laneList();
      const i = list.findIndex((x) => x.id === c.id);
      const next = list[i + 1];
      if (next) return this.gotoClip(next.id, { play: true });
      this.toast('End of lane');
    }
    this.emit();
  }

  toggleAutoplay() {
    this.state.settings.autoplay = !this.state.settings.autoplay;
    saveSettings(this.state.settings);
    this.toast(this.state.settings.autoplay ? 'Autoplay on' : 'Autoplay off');
  }

  // ---------- triage ----------

  private moveClip(target: number) {
    const c = this.clip();
    const p = this.state.project;
    if (!c || !p) return;
    if (c.lane === target) return this.toast(`Already in ${laneName(p, target)}`);
    const list = this.laneList();
    const i = list.findIndex((x) => x.id === c.id);
    const wasPlaying = this.state.playing;
    this.player.stop();
    this.state.playing = false;
    this.commit((clips) => clips.map((x) => (x.id === c.id ? { ...x, lane: target } : x)));
    this.toast(`→ ${laneName(p, target)}`);
    const after = this.laneList();
    const next = after[i] ?? null;
    if (next) this.gotoClip(next.id, { play: wasPlaying });
    else {
      const prev = after[i - 1] ?? null;
      if (prev) this.gotoClip(prev.id);
      else {
        this.state.cursor = null;
        this.emit();
      }
      this.toast(after.length ? 'End of lane' : `${laneName(p, this.state.lane)} is empty`);
    }
  }

  promote() {
    const c = this.clip();
    const p = this.state.project;
    if (!c || !p) return;
    if (c.lane === TRASH) return this.moveClip(0);
    if (c.lane >= finalLane(p)) return this.toast('Already in Final');
    this.moveClip(c.lane + 1);
  }

  demote() {
    const c = this.clip();
    if (!c) return;
    if (c.lane === TRASH) return this.toast('Already in Trash');
    if (c.lane === 0) return this.moveClip(TRASH);
    this.moveClip(c.lane - 1);
  }

  trash() {
    this.moveClip(TRASH);
  }

  sendToLane(n: number) {
    const p = this.state.project;
    if (!p) return;
    if (n < 0 || n >= p.laneNames.length) return this.toast('No such lane');
    this.moveClip(n);
  }

  // ---------- editing ----------

  /** Split at the playhead. `other` flips which half the cursor lands on for this one split. */
  split(other = false) {
    const c = this.clip();
    if (!c) return;
    const pos = Math.round(this.playhead());
    if (pos <= c.start || pos >= c.end) return this.toast('Move the playhead inside the clip to split');
    this.player.stop();
    this.state.playing = false;
    const b: Clip = { id: uid(), start: pos, end: c.end, lane: c.lane };
    this.commit((clips) => clips.flatMap((x) => (x.id === c.id ? [{ ...x, end: pos }, b] : [x])));
    // land on whichever half the setting says, playhead at its start so space reviews it
    const stay = this.state.settings.splitStaysOnFirst !== other;
    this.state.cursor = stay ? c.id : b.id;
    this.state.pos = stay ? c.start : pos;
    this.laneMemory.set(c.lane, this.state.cursor);
    this.toast('Split');
    this.emit();
  }

  mergeNext() {
    const c = this.clip();
    if (!c) return;
    const list = this.laneList(c.lane);
    const i = list.findIndex((x) => x.id === c.id);
    const n = list[i + 1];
    if (!n) return this.toast('No next clip in this lane');
    this.player.stop();
    this.state.playing = false;
    const seam = c.end;
    this.commit((clips) => clips.filter((x) => x.id !== n.id).map((x) => (x.id === c.id ? { ...x, end: n.end } : x)));
    this.state.pos = seam;
    this.toast('Merged with next');
    this.emit();
  }

  mergePrev() {
    const c = this.clip();
    if (!c) return;
    const list = this.laneList(c.lane);
    const i = list.findIndex((x) => x.id === c.id);
    const pv = list[i - 1];
    if (!pv) return this.toast('No previous clip in this lane');
    this.player.stop();
    this.state.playing = false;
    const seam = pv.end;
    this.commit((clips) =>
      clips.filter((x) => x.id !== pv.id).map((x) => (x.id === c.id ? { ...x, start: pv.start, line: pv.line ?? x.line } : x)),
    );
    this.state.pos = seam;
    this.toast('Merged with previous');
    this.emit();
  }

  setIn() {
    const c = this.clip();
    if (!c) return;
    const pos = Math.round(this.playhead());
    if (pos >= c.end) return this.toast('Start must be before the end');
    this.commit((clips) => clips.map((x) => (x.id === c.id ? { ...x, start: pos } : x)));
    this.toast(`Start → ${fmtTime(pos / this.state.source!.sampleRate)}`);
  }

  setOut() {
    const c = this.clip();
    if (!c) return;
    const pos = Math.round(this.playhead());
    if (pos <= c.start) return this.toast('End must be after the start');
    if (this.state.playing) {
      this.player.stop();
      this.state.playing = false;
    }
    this.state.pos = pos;
    this.commit((clips) => clips.map((x) => (x.id === c.id ? { ...x, end: pos } : x)));
    this.toast(`End → ${fmtTime(pos / this.state.source!.sampleRate)}`);
  }

  // ---------- script ----------

  markLine() {
    const c = this.clip();
    if (!c) return;
    const n = (this.lineOf(c) ?? 0) + 1;
    this.setLine(n);
  }

  setLine(n: number) {
    const c = this.clip();
    if (!c) return;
    if (n <= 0) {
      this.commit((clips) => clips.map((x) => (x.id === c.id ? { ...x, line: undefined } : x)));
      return this.toast('Line mark removed');
    }
    this.commit((clips) => clips.map((x) => (x.id === c.id ? { ...x, line: n } : x)));
    const t = this.lineText(n);
    this.toast(`Line ${n}${t ? ' · ' + t.slice(0, 48) : ''}`);
  }

  setScript(text: string) {
    if (!this.state.project) return;
    this.state.project.script = text;
    this.persist();
    this.emit();
  }

  setScriptEditing(v: boolean) {
    this.state.scriptEditing = v;
    this.emit();
  }

  // ---------- settings ----------

  updateSettings(patch: Partial<Settings>) {
    Object.assign(this.state.settings, patch);
    saveSettings(this.state.settings);
    if (patch.laneNames && this.state.project) {
      const p = this.state.project;
      p.laneNames = [...patch.laneNames];
      const max = p.laneNames.length - 1;
      p.clips = p.clips.map((c) => (c.lane > max ? { ...c, lane: max } : c));
      if (this.state.lane > max) this.state.lane = max;
      this.persist();
    }
    if (patch.contextSeconds !== undefined) this.bufs.clear();
    if (patch.gainDb !== undefined) this.player.setGainDb(patch.gainDb);
    if (patch.theme) this.applyTheme();
    this.emit();
  }

  applyTheme() {
    const t = this.state.settings.theme;
    const dark = t === 'dark' || (t === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  /** Re-run detection with current settings; clips that are unchanged keep lane and line. */
  redetect() {
    const { source, analysis, project, settings } = this.state;
    if (!source || !analysis || !project) return;
    const segs = segment(analysis, source.frames, source.sampleRate, settings);
    const old = new Map(project.clips.map((c) => [`${c.start}-${c.end}`, c]));
    this.player.stop();
    this.state.playing = false;
    this.commit(() =>
      segs.map(([start, end]) => {
        const prev = old.get(`${start}-${end}`);
        return prev ? { ...prev } : { id: uid(), start, end, lane: 0 };
      }),
    );
    project.detect = { threshold: settings.threshold, minSilence: settings.minSilence, margin: settings.margin };
    const first = this.laneList()[0];
    this.state.cursor = first?.id ?? null;
    this.state.pos = first?.start ?? 0;
    this.toast(`${segs.length} takes`);
    this.emit();
  }

  previewCount(): number {
    const { source, analysis, settings } = this.state;
    if (!source || !analysis) return 0;
    return segment(analysis, source.frames, source.sampleRate, settings).length;
  }

  // ---------- ui ----------

  openModal(m: Modal) {
    if (m && this.state.playing) {
      this.state.pos = this.player.position();
      this.player.stop();
      this.state.playing = false;
    }
    this.state.modal = m;
    this.emit();
  }

  toast(text: string) {
    this.state.toast = { text, n: ++this.toastN };
    this.emit();
    const n = this.toastN;
    setTimeout(() => {
      if (this.state.toast?.n === n) {
        this.state.toast = null;
        this.emit();
      }
    }, 1400);
  }

  setStatus(status: string, progress: number | null = null) {
    this.state.status = status;
    this.state.progress = progress;
    this.emit();
  }

  clearError() {
    this.state.error = null;
    this.emit();
  }
}

export const store = new Store();

export function useStore(): Store {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((x) => x + 1)), []);
  return store;
}
