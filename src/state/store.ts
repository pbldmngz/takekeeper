import { useEffect, useState } from 'preact/hooks';
import { analyze, segment, segmentRange, type Analysis } from '../audio/analyze';
import { fileKey, openAudio, type Source } from '../audio/wav';
import { Player, type Loaded } from '../audio/player';
import { saveBlob } from '../audio/export';
import { clipTo16k } from '../ai/audio';
import { UNCERTAIN, alignTakes, cleanTranscript, diagnose, groupWords, prepare, similarity } from '../ai/align';
import { LANGUAGES, MODELS, Transcriber, detectDevice } from '../ai/transcriber';
import { clamp, fmtTime, stem, uid } from '../util';
import {
  JUNK,
  TRASH,
  byStart,
  deleteProject,
  derivedLines,
  finalLane,
  findProjectFor,
  idbDel,
  idbGet,
  idbSet,
  laneClips,
  laneName,
  laneSlot,
  loadProject,
  loadSettings,
  migrateLegacyProjects,
  myLines,
  parseProjectFile,
  parseScript,
  projectFileText,
  saveProject,
  saveSettings,
  sessions,
  type Clip,
  type ScriptLine,
  type Project,
  type SessionInfo,
  type Settings,
} from './project';

export type Modal = 'settings' | 'export' | 'help' | 'goto' | 'transcribe' | null;

export interface AiState {
  status: 'idle' | 'loading' | 'running' | 'done' | 'cancelled' | 'error';
  progress: number; // 0..1 of the current phase
  done: number;
  total: number;
  message: string;
  eta: number | null; // seconds
  uncertain: number;
}

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
  loop: boolean; // replay the current take until turned off
  modal: Modal;
  progress: number | null;
  status: string;
  error: string | null;
  sessions: SessionInfo[]; // saved projects, newest first
  toast: { text: string; n: number } | null;
  scriptEditing: boolean;
  unsaved: number; // edits since the project was last saved to a file
  lineMode: boolean; // the lane is filtered to one script line
  lineFilter: number | null; // that line (global n)
  showContext: boolean; // script panel shows other characters and directions too
  ai: AiState;
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
    loop: false,
    modal: null,
    progress: null,
    status: '',
    error: null,
    sessions: [],
    toast: null,
    scriptEditing: false,
    unsaved: 0,
    lineMode: false,
    lineFilter: null,
    showContext: false,
    ai: { status: 'idle', progress: 0, done: 0, total: 0, message: '', eta: null, uncertain: 0 },
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
  private asr = new Transcriber();
  private linesCache: { clips: Clip[]; map: Map<string, number> } | null = null;
  private countsCache: { clips: Clip[]; counts: Map<number, number[]> } | null = null;

  constructor() {
    this.player.onEnded = () => this.onPlaybackEnded();
    this.player.setGainDb(this.state.settings.gainDb);
    this.applyTheme();
    document.body.dataset.phase = this.state.phase;
    void migrateLegacyProjects().then(() => this.refreshSessions());
  }

  async refreshSessions() {
    this.state.sessions = await sessions();
    this.emit();
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
    const p = this.state.project;
    if (!p) return [];
    const all = laneClips(p, lane);
    if (!this.state.lineMode || this.state.lineFilter === null) return all;
    const map = this.linesMap();
    return all.filter((c) => map.get(c.id) === this.state.lineFilter);
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

  private linesMap(): Map<string, number> {
    const p = this.state.project!;
    if (!this.linesCache || this.linesCache.clips !== p.clips) this.linesCache = { clips: p.clips, map: derivedLines(p) };
    return this.linesCache.map;
  }

  lineOf(clip: Clip): number | undefined {
    return this.state.project ? this.linesMap().get(clip.id) : undefined;
  }

  /** Parsed script rows. */
  script(): ScriptLine[] {
    return this.state.project ? parseScript(this.state.project.script) : [];
  }

  /** The rows that count as the user's lines. */
  mine(): ScriptLine[] {
    return this.state.project ? myLines(this.script(), this.state.project.character) : [];
  }

  /** 1-based position of a script row among the user's lines. */
  ordinal(n: number | undefined): number | undefined {
    if (!n) return undefined;
    const i = this.mine().findIndex((l) => l.n === n);
    return i < 0 ? undefined : i + 1;
  }

  globalOf(ordinal: number): number | undefined {
    return this.mine()[ordinal - 1]?.n;
  }

  lineText(n: number | undefined): string {
    if (!n) return '';
    return this.script()[n - 1]?.text ?? '';
  }

  /** Clips per lane for every script row: counts[n][laneIndex], trash last. */
  lineCounts(): Map<number, number[]> {
    const p = this.state.project!;
    if (this.countsCache && this.countsCache.clips === p.clips) return this.countsCache.counts;
    const map = this.linesMap();
    const counts = new Map<number, number[]>();
    const lanes = p.laneNames.length + 2;
    for (const c of p.clips) {
      const n = map.get(c.id);
      if (!n) continue;
      let row = counts.get(n);
      if (!row) counts.set(n, (row = new Array(lanes).fill(0)));
      row[laneSlot(p, c.lane)]++;
    }
    this.countsCache = { clips: p.clips, counts };
    return counts;
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

      const exact = await loadProject(src.key);
      const existing = exact ?? (await findProjectFor(src));
      if (existing) {
        if (!exact) {
          existing.key = src.key;
          existing.name = src.name;
        }
        s.project = existing;
        await saveProject(existing);
        s.status = '';
      } else {
        s.project = this.freshProject(src, an);
        await saveProject(s.project);
      }
      void this.refreshSessions();
      this.handle = handle;
      if (handle) void idbSet(`handle:${src.key}`, handle);
      s.unsaved = 0;
      s.lane = 0;
      s.lineMode = false;
      s.lineFilter = null;
      s.phase = 'ready';
      s.progress = null;
      s.status = '';
      const first = this.laneList(0)[0] ?? s.project!.clips.sort(byStart)[0];
      s.cursor = first?.id ?? null;
      s.pos = first?.start ?? 0;
      this.restoreCursor();
      if (existing && existing.clips.some((c) => c.text !== undefined) && !existing.clips.some((c) => c.conf !== undefined) && this.mine().length) {
        this.realign(); // transcribed earlier, but the matching never landed
      }
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

  async resume(key: string) {
    const r = this.state.sessions.find((x) => x.key === key);
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
      await saveProject(p);
      void this.refreshSessions();
      if (s.phase === 'ready' && s.source && s.source.frames === p.audio.frames && s.source.sampleRate === p.audio.sampleRate) {
        p.key = s.source.key;
        p.name = s.source.name;
        this.undoStack.push(s.project!.clips);
        this.redoStack = [];
        s.project = p;
        await saveProject(p);
        this.afterHistory(`project loaded · ${p.clips.length} clips`);
        this.restoreCursor();
        this.emit();
        return;
      }
      s.error = null;
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
    this.syncCursor();
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

  /** Forget a saved session; the recording itself is untouched. */
  async discard(key: string) {
    const r = this.state.sessions.find((x) => x.key === key);
    if (!r) return;
    await deleteProject(key);
    await idbDel(`handle:${key}`);
    await this.refreshSessions();
    this.toast(`forgot ${r.name}`);
  }

  private fail(e: unknown) {
    this.state.error = e instanceof Error ? e.message : String(e);
    this.emit();
  }

  // ---------- persistence / undo ----------

  private syncCursor() {
    const p = this.state.project;
    if (p) p.cursor = { lane: this.state.lane, clip: this.state.cursor, pos: this.state.pos };
  }

  /** Put lane, clip and playhead back where the project last saw them. */
  private restoreCursor() {
    const p = this.state.project;
    const cur = p?.cursor;
    if (!p || !cur) return;
    const clip = cur.clip ? p.clips.find((c) => c.id === cur.clip) : null;
    if (!clip) return;
    this.state.lane = clip.lane;
    this.state.cursor = clip.id;
    this.state.pos = clamp(cur.pos, ...this.viewRange(clip));
    this.laneMemory.set(clip.lane, clip.id);
  }

  private persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (!this.state.project) return;
      this.syncCursor();
      void saveProject(this.state.project);
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
    const n = p.laneNames.length + 2; // + junk + trash
    lane = ((lane % n) + n) % n;
    if (lane === p.laneNames.length) lane = JUNK;
    else if (lane === p.laneNames.length + 1) lane = TRASH;
    this.player.stop();
    this.state.playing = false;
    this.state.lane = lane;
    // a lane is the top-level filter: changing it drops any line filter
    this.state.lineMode = false;
    this.state.lineFilter = null;
    const list = this.laneList(lane);
    const remembered = this.laneMemory.get(lane);
    const target = list.find((c) => c.id === remembered) ?? list[0] ?? null;
    this.state.cursor = target?.id ?? null;
    this.state.pos = target?.start ?? 0;
    this.persist();
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
    this.persist();
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
      this.persist();
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
    if (c && endedAtClipEnd && this.state.loop && this.state.modal === null) {
      return void this.playFrom(c.start, this.state.slow);
    }
    if (c && endedAtClipEnd && this.state.settings.autoplay && this.state.modal === null) {
      const list = this.laneList();
      const i = list.findIndex((x) => x.id === c.id);
      const next = list[i + 1];
      if (next) return this.gotoClip(next.id, { play: true });
      this.toast('End of lane');
    }
    this.emit();
  }

  toggleLoop() {
    const s = this.state;
    s.loop = !s.loop;
    this.toast(s.loop ? 'loop on · this take repeats' : 'loop off');
    if (s.loop && !s.playing) {
      const c = this.clip();
      if (c) void this.playFrom(c.start, false);
    }
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
    if (c.lane === TRASH || c.lane === JUNK) return this.moveClip(0); // rescue
    if (c.lane >= finalLane(p)) return this.toast('Already in Final');
    this.moveClip(c.lane + 1);
  }

  demote() {
    const c = this.clip();
    if (!c) return;
    if (c.lane === TRASH) return this.toast('Already in Trash');
    if (c.lane === JUNK) return this.moveClip(TRASH);
    if (c.lane === 0) return this.moveClip(JUNK);
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

  /** L: this clip starts the line after the furthest line reached before it. */
  continueScript() {
    const c = this.clip();
    const p = this.state.project;
    if (!c || !p) return;
    const mine = this.mine();
    if (!mine.length) return this.toast('no script yet · press t to paste one');
    const map = this.linesMap();
    let furthest = 0;
    for (const x of p.clips) if (x.start < c.start) furthest = Math.max(furthest, map.get(x.id) ?? 0);
    const next = mine.find((l) => l.n > furthest) ?? mine[mine.length - 1];
    this.setLine(next.n);
  }

  /** [ and ]: move this clip's line one of the user's lines back or forward. */
  stepLine(dir: 1 | -1) {
    const c = this.clip();
    if (!c) return;
    const mine = this.mine();
    if (!mine.length) return this.toast('no script yet · press t to paste one');
    const cur = this.lineOf(c);
    const i = cur ? mine.findIndex((l) => l.n === cur) : -1;
    const j = i < 0 ? 0 : clamp(i + dir, 0, mine.length - 1);
    if (j === i) return this.toast(dir > 0 ? 'last line' : 'first line');
    this.setLine(mine[j].n);
  }

  gotoOrdinal(ordinal: number) {
    if (ordinal <= 0) return this.setLine(0);
    const n = this.globalOf(ordinal);
    if (!n) return this.toast(`you only have ${this.mine().length} lines`);
    this.setLine(n);
  }

  setCharacter(name: string | null) {
    const p = this.state.project;
    if (!p) return;
    p.character = name;
    this.persist();
    this.toast(name ? `playing ${name}` : 'all spoken lines');
  }

  toggleContext() {
    this.state.showContext = !this.state.showContext;
    this.emit();
  }

  // ---------- line mode ----------

  toggleLineMode() {
    const s = this.state;
    if (!this.mine().length) return this.toast('no script yet · press t to paste one');
    if (s.lineMode) {
      s.lineMode = false;
      s.lineFilter = null;
      this.toast('all clips');
      return this.emit();
    }
    const c = this.clip();
    s.lineMode = true;
    this.selectLine(c ? (this.lineOf(c) ?? this.mine()[0].n) : this.mine()[0].n, { keepCursor: true });
  }

  /** Show one script line's takes in the current lane. */
  selectLine(n: number, opts: { keepCursor?: boolean; play?: boolean } = {}) {
    const s = this.state;
    s.lineMode = true;
    s.lineFilter = n;
    this.player.stop();
    s.playing = false;
    const list = this.laneList();
    const cur = this.clip();
    const keep = opts.keepCursor && cur && list.some((x) => x.id === cur.id);
    const target = keep ? cur : list[0] ?? null;
    s.cursor = target?.id ?? null;
    s.pos = target?.start ?? s.pos;
    const ord = this.ordinal(n);
    const counts = this.lineCounts().get(n);
    const here = list.length;
    if (!here) this.toast(`line ${ord}: no takes in ${this.laneName(s.lane).toLowerCase()}${counts ? ` · ${counts.reduce((a, b) => a + b, 0)} in total` : ''}`);
    else this.toast(`line ${ord} · ${here} take${here === 1 ? '' : 's'} here`);
    if (opts.play && target) void this.playFrom(target.start, false);
    this.emit();
  }

  /** Shift+↑/↓ in line mode: previous / next of the user's lines. */
  moveLine(dir: 1 | -1) {
    const mine = this.mine();
    const i = mine.findIndex((l) => l.n === this.state.lineFilter);
    const j = clamp((i < 0 ? 0 : i) + dir, 0, mine.length - 1);
    if (j === i) return this.toast(dir > 0 ? 'last line' : 'first line');
    this.selectLine(mine[j].n, { play: true });
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
    this.toast(`line ${this.ordinal(n) ?? n}${t ? ' · ' + t.slice(0, 56) : ''}`);
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

  // ---------- transcription ----------

  /** Transcribe takes with Whisper in the browser, then match each to one of the user's lines. */
  async transcribe(scope: 'missing' | 'all') {
    const s = this.state;
    const p = s.project;
    const src = s.source;
    if (!p || !src) return;
    const mine = this.mine();
    if (!mine.length) return this.toast('paste the script first · t');
    if (s.ai.status === 'loading' || s.ai.status === 'running') return;
    const language = await this.ensureModel();
    if (language === false) return;
    const order = [...p.clips].sort(byStart);
    const todo = order.filter((c) => scope === 'all' || !c.text);
    s.ai = { status: 'running', progress: 0, done: 0, total: todo.length, message: 'transcribing', eta: null, uncertain: 0 };
    this.emit();
    const texts = new Map<string, string>();
    const t0 = performance.now();
    try {
      for (const c of todo) {
        if (s.ai.status !== 'running') break;
        const audio = await clipTo16k(src, c.start, c.end);
        let text = '';
        try {
          text = cleanTranscript(await this.asr.transcribe(audio, language));
        } catch (e) {
          if (s.ai.status !== 'running') throw e; // cancelled
          text = ''; // one bad take must not stop the hour
        }
        texts.set(c.id, text);
        s.ai.done++;
        s.ai.progress = s.ai.done / s.ai.total;
        const per = (performance.now() - t0) / s.ai.done;
        s.ai.eta = Math.round((per * (s.ai.total - s.ai.done)) / 1000);
        if (s.ai.done % 3 === 0 || s.ai.done === s.ai.total) this.emit();
      }
    } catch (e) {
      if (s.ai.status === 'running') {
        s.ai = { ...s.ai, status: 'error', message: e instanceof Error ? e.message : String(e) };
        this.applyTranscripts(texts, false);
        return this.emit();
      }
    }
    const cancelled = s.ai.status !== 'running';
    this.applyTranscripts(texts, !cancelled);
    if (!cancelled && s.settings.autoSplit) {
      const pieces = this.splitMultiReads();
      if (pieces.length) {
        s.ai = { ...s.ai, status: 'running', message: `re-cut ${pieces.length} pieces · transcribing them`, done: 0, total: pieces.length, eta: null };
        this.emit();
        const more = new Map<string, string>();
        try {
          for (const c of pieces) {
            if (s.ai.status !== 'running') break;
            const audio = await clipTo16k(src, c.start, c.end);
            let text = '';
            try {
              text = cleanTranscript(await this.asr.transcribe(audio, language));
            } catch {
              text = '';
            }
            more.set(c.id, text);
            s.ai.done++;
            s.ai.progress = s.ai.done / s.ai.total;
            if (s.ai.done % 3 === 0) this.emit();
          }
        } catch {
          /* cancelled */
        }
        for (const [k, v] of more) texts.set(k, v);
        this.applyTranscripts(more, s.ai.status === 'running');
      }
      if (s.ai.status === 'running') {
        const r = await this.wordRecut(language);
        if (r.split || r.merged) this.toast(`by word: ${r.split} split · ${r.merged} merged`);
      }
    }
    if (cancelled) {
      s.ai = { ...s.ai, status: 'cancelled', message: `stopped · ${texts.size} takes transcribed, lines not re-matched` };
    } else {
      s.ai = { ...s.ai, status: 'done', message: `${texts.size} takes transcribed · ${s.ai.uncertain} uncertain · u jumps to them` };
    }
    this.emit();
  }

  /** Load the chosen model; returns the language to pass, or false when loading failed. */
  private async ensureModel(): Promise<string | null | false> {
    const s = this.state;
    const model = MODELS[s.settings.asrModel];
    const language = LANGUAGES[s.settings.asrLanguage];
    const { device, label } = await detectDevice();
    s.ai = { status: 'loading', progress: 0, done: 0, total: 0, message: `loading ${model.label.split(' ')[0]} model on ${label}`, eta: null, uncertain: s.ai.uncertain };
    this.emit();
    try {
      await this.asr.load(model.id, device, (frac, message) => {
        s.ai.progress = frac;
        s.ai.message = message;
        this.emit();
      });
      return language;
    } catch (e) {
      s.ai = { ...s.ai, status: 'error', message: e instanceof Error ? e.message : String(e) };
      this.emit();
      return false;
    }
  }

  /** The quietest frame near a sample position, so cuts land between words, not on them. */
  private snapQuiet(pos: number, window: number): number {
    const an = this.state.analysis!;
    const f0 = Math.max(0, Math.floor((pos - window) / an.frameLen));
    const f1 = Math.min(an.db.length - 1, Math.ceil((pos + window) / an.frameLen));
    let best = Math.round(pos / an.frameLen);
    for (let f = f0; f <= f1; f++) if (an.db[f] < an.db[best]) best = f;
    return best * an.frameLen + Math.floor(an.frameLen / 2);
  }

  /**
   * Second pass on flagged takes using word timestamps: split reads that have no pause
   * between them, separate false starts from the read that follows, and merge a line
   * that a pause split in two. Everything is re-matched afterwards.
   */
  private async wordRecut(language: string | null): Promise<{ split: number; merged: number }> {
    const s = this.state;
    const p = s.project;
    const src = s.source;
    if (!p || !src || !s.analysis) return { split: 0, merged: 0 };
    const sr = src.sampleRate;
    const lineText = new Map(this.mine().map((l) => [l.n, l.text]));
    const order = [...p.clips].sort(byStart);

    // merges: two adjacent false-start halves of the same line that read as one line together
    const merges: Array<[Clip, Clip]> = [];
    for (let i = 0; i + 1 < order.length; i++) {
      const a = order[i];
      const b = order[i + 1];
      if (a.kind !== 'partial' || b.kind !== 'partial' || a.lane !== b.lane || a.lane === TRASH || a.lane === JUNK) continue;
      if (!a.line || a.line !== b.line || !a.text || !b.text || b.start - a.end > 2.5 * sr) continue;
      const target = prepare(lineText.get(a.line) ?? '');
      const both = similarity(prepare(`${a.text} ${b.text}`), target);
      if (both >= 0.6 && both > Math.max(similarity(prepare(a.text), target), similarity(prepare(b.text), target)) + 0.1) {
        merges.push([a, b]);
        i++;
      }
    }
    const inMerge = new Set(merges.flat().map((c) => c.id));

    // splits: multi-read takes (including false start + read) still in one piece
    const cands = order.filter((c) => !inMerge.has(c.id) && c.lane !== TRASH && c.kind === 'multi' && c.text && (c.reads ?? 0) >= 2);
    s.ai = { ...s.ai, status: 'running', message: 'refining cuts by word', done: 0, total: cands.length, eta: null };
    this.emit();
    const texts = new Map<string, string>();
    const replaced = new Map<string, Clip[]>();
    const minLen = Math.round(0.25 * sr);
    for (const c of cands) {
      if (s.ai.status !== 'running') break;
      let groups;
      try {
        const t = await this.asr.transcribeWords(await clipTo16k(src, c.start, c.end), language);
        groups = groupWords(t.words, c.reads ?? 2, (c.end - c.start) / sr);
      } catch {
        s.ai.done++;
        continue;
      }
      if (groups.length >= 2) {
        const pieces: Clip[] = [];
        let prevEnd = c.start;
        for (let g = 0; g < groups.length; g++) {
          const last = g === groups.length - 1;
          const start = g === 0 ? c.start : prevEnd;
          const end = last ? c.end : this.snapQuiet(c.start + Math.round(((groups[g].end + groups[g + 1].start) / 2) * sr), Math.round(0.15 * sr));
          if (end - start < minLen && pieces.length) {
            // too short to stand alone: fold into the previous piece
            const prev = pieces[pieces.length - 1];
            prev.end = end;
            texts.set(prev.id, `${texts.get(prev.id)} ${groups[g].text}`);
            prevEnd = end;
            continue;
          }
          const id = pieces.length === 0 ? c.id : uid();
          pieces.push({ id, start, end, lane: c.lane, line: c.line });
          texts.set(id, groups[g].text);
          prevEnd = end;
        }
        if (pieces.length >= 2) replaced.set(c.id, pieces);
      }
      s.ai.done++;
      if (s.ai.done % 3 === 0) this.emit();
    }

    if (merges.length || replaced.size) {
      this.player.stop();
      s.playing = false;
      const mergeInto = new Map(merges.map(([a, b]) => [a.id, b]));
      const drop = new Set(merges.map(([, b]) => b.id));
      this.commit((clips) =>
        clips.flatMap((c) => {
          if (drop.has(c.id)) return [];
          const b = mergeInto.get(c.id);
          if (b) return [{ ...c, end: b.end, text: `${c.text ?? ''} ${b.text ?? ''}`.trim(), kind: undefined, reads: undefined, conf: undefined }];
          const r = replaced.get(c.id);
          if (r) return r.map((x) => ({ ...x, text: texts.get(x.id) }));
          return [c];
        }),
      );
      const all = new Map<string, string>();
      for (const c of this.state.project!.clips) if (c.text !== undefined) all.set(c.id, c.text);
      this.applyTranscripts(all, true);
    }
    return { split: replaced.size, merged: merges.length };
  }

  /** Run the word-aware pass on its own, on takes that are already transcribed. */
  async wordRecutNow() {
    const s = this.state;
    if (!s.project || !s.source) return;
    if (s.ai.status === 'loading' || s.ai.status === 'running') return;
    if (!s.project.clips.some((c) => c.text !== undefined)) return this.toast('nothing transcribed yet · w');
    this.realign();
    const language = await this.ensureModel();
    if (language === false) return;
    const r = await this.wordRecut(language);
    s.ai = { ...s.ai, status: 'done', message: `re-cut by words · ${r.split} split · ${r.merged} merged · ${s.ai.uncertain} uncertain` };
    this.emit();
  }

  /** Store transcripts; when `align`, match every transcribed take to a line. */
  private applyTranscripts(texts: Map<string, string>, align: boolean) {
    const p = this.state.project;
    if (!p || !texts.size) return;
    const mine = this.mine();
    if (!align || !mine.length) {
      this.commit((clips) => clips.map((c) => (texts.has(c.id) ? { ...c, text: texts.get(c.id) } : c)));
      return;
    }
    const order = [...p.clips].sort(byStart).filter((c) => texts.has(c.id) || c.text);
    const transcripts = order.map((c) => texts.get(c.id) ?? c.text ?? '');
    const al = alignTakes(transcripts, mine);
    const byId = new Map(order.map((c, i) => [c.id, al[i]]));
    const lineText = new Map(mine.map((l) => [l.n, l.text]));
    const autoJunk = this.state.settings.autoJunk;
    // diagnose first, so a line's last remaining take is never junked automatically
    const diag = new Map(order.map((c) => {
      const a = byId.get(c.id)!;
      return [c.id, diagnose(texts.get(c.id) ?? c.text ?? '', lineText.get(a.n) ?? '', a.score)];
    }));
    const keepers = new Map<number, number>();
    for (const c of order) {
      const a = byId.get(c.id)!;
      if (diag.get(c.id)!.kind !== 'junk' && c.lane !== TRASH) keepers.set(a.n, (keepers.get(a.n) ?? 0) + 1);
    }
    let uncertain = 0;
    let junked = 0;
    this.commit((clips) =>
      clips.map((c) => {
        const a = byId.get(c.id);
        if (!a) return c;
        const text = texts.get(c.id) ?? c.text ?? '';
        const d = diag.get(c.id)!;
        const next: Clip = { ...c, text, line: a.n, conf: a.confidence, kind: d.kind, reads: d.reads };
        if (d.kind === 'junk' && autoJunk && c.lane === 0 && (keepers.get(a.n) ?? 0) > 0) {
          next.lane = JUNK;
          junked++;
        } else if (a.confidence < UNCERTAIN && d.kind !== 'junk') uncertain++;
        return next;
      }),
    );
    this.state.ai.uncertain = uncertain;
    // the current take may have just left this lane
    const cur = this.clip();
    if (cur && cur.lane !== this.state.lane) {
      const first = this.laneList()[0];
      this.state.cursor = first?.id ?? null;
      this.state.pos = first?.start ?? this.state.pos;
    }
    if (junked) this.toast(`${junked} empty takes moved to junk`);
  }

  /** Match stored transcripts to lines again, e.g. after changing the character or the script. */
  realign() {
    const p = this.state.project;
    if (!p) return;
    const texts = new Map<string, string>();
    for (const c of p.clips) if (c.text !== undefined) texts.set(c.id, c.text);
    if (!texts.size) return this.toast('nothing transcribed yet · w');
    if (!this.mine().length) return this.toast('paste the script first · t');
    this.applyTranscripts(texts, true);
    this.toast(`lines re-matched · ${this.state.ai.uncertain} uncertain`);
  }

  /** Re-cut takes that contain several reads, with a finer silence threshold. Returns the new pieces. */
  splitMultiReads(): Clip[] {
    const { project: p, analysis: an, source: src, settings } = this.state;
    if (!p || !an || !src) return [];
    const fine = { threshold: settings.threshold, minSilence: Math.min(0.3, settings.minSilence), margin: Math.min(0.1, settings.margin) };
    const minLen = Math.round(0.35 * src.sampleRate);
    const pieces: Clip[] = [];
    const replaced = new Map<string, Clip[]>();
    for (const c of p.clips) {
      if (c.kind !== 'multi' || (c.reads ?? 0) < 2 || c.lane === TRASH) continue;
      const parts = segmentRange(an, c.start, c.end, src.sampleRate, fine).filter(([s, e]) => e - s >= minLen);
      if (parts.length < 2) continue;
      // keep the first piece as the original clip so lane and history stay; the rest are new
      const out = parts.map(([start, end], i) => ({
        id: i === 0 ? c.id : uid(),
        start,
        end,
        lane: c.lane,
        line: c.line,
        text: undefined,
        conf: undefined,
        kind: undefined,
        reads: undefined,
      })) as Clip[];
      replaced.set(c.id, out);
      pieces.push(...out);
    }
    if (!replaced.size) return [];
    this.player.stop();
    this.state.playing = false;
    this.commit((clips) => clips.flatMap((c) => replaced.get(c.id) ?? [c]));
    this.toast(`${replaced.size} takes with several reads re-cut into ${pieces.length}`);
    return pieces;
  }

  cancelTranscribe() {
    if (this.state.ai.status === 'loading' || this.state.ai.status === 'running') {
      this.state.ai.status = 'cancelled';
      this.asr.cancel();
      this.emit();
    }
  }

  /** U: the next take whose line match is doubtful, in this lane. */
  nextUncertain() {
    const list = this.laneList();
    const c = this.clip();
    const from = c ? list.findIndex((x) => x.id === c.id) : -1;
    const isDoubtful = (x: Clip) => x.conf !== undefined && x.conf < UNCERTAIN && x.kind !== 'junk';
    const next = list.slice(from + 1).find(isDoubtful) ?? list.slice(0, from + 1).find(isDoubtful);
    if (!next) return this.toast('no uncertain takes in this lane');
    this.gotoClip(next.id, { play: true });
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
