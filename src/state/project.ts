import type { DetectParams } from '../audio/analyze';
import { t, type LangSetting } from '../i18n';

export const TRASH = -1;
export const JUNK = -2; // auto-detected non-takes, waiting for a look

export interface Clip {
  id: string;
  start: number; // absolute sample frame in the source
  end: number; // exclusive
  lane: number; // 0 = Unsorted ... laneNames.length-1 = Final, TRASH = -1
  line?: number; // explicit script line; unset clips inherit from the previous clip
  text?: string; // transcript, when transcribed
  conf?: number; // 0..1 confidence of the automatic line match
  kind?: 'junk' | 'multi' | 'partial'; // what the transcript says this take is
  reads?: number; // how many reads of the line the take seems to contain
}

export interface Settings extends DetectParams {
  fadeMs: number;
  frameMs: number;
  contextSeconds: number; // audio shown around a clip for trimming
  stepMs: number; // one "frame" of ←/→
  fastArrows: boolean; // plain ←/→ move 10 frames; shift steps one frame
  splitStaysOnFirst: boolean; // after a split, keep the cursor on the first half
  slowRate: number;
  slowOnPrev: boolean; // ↑ replays the previous clip in slow motion
  gainDb: number; // monitoring boost, never exported
  autoplay: boolean;
  theme: 'auto' | 'dark' | 'light';
  laneNames: string[];
  asrLanguage: 'spanish' | 'english' | 'auto';
  asrModel: 'base' | 'small';
  autoJunk: boolean; // empty transcripts go to the junk lane
  autoSplit: boolean; // takes with several reads are re-cut
  spacers: boolean; // export silent gap files between takes
  gapClip: number; // seconds after every take
  gapLine: number; // seconds when the next take is another line
  exportByLine: boolean; // number exported takes in script order rather than recording order
  lang: LangSetting; // interface language; auto follows the page (/ or /es/)
}

export const DEFAULT_SETTINGS: Settings = {
  threshold: -40,
  minSilence: 1.0,
  margin: 0.25,
  fadeMs: 5,
  frameMs: 20,
  contextSeconds: 1.5,
  stepMs: 15,
  fastArrows: true,
  splitStaysOnFirst: true,
  slowRate: 0.5,
  slowOnPrev: false,
  gainDb: 0,
  autoplay: true,
  theme: 'auto',
  laneNames: ['Unsorted', 'Pass 1', 'Pass 2', 'Final'],
  asrLanguage: 'spanish',
  asrModel: 'small',
  autoJunk: true,
  autoSplit: true,
  spacers: true,
  gapClip: 1,
  gapLine: 2,
  exportByLine: true,
  lang: 'auto',
};

export interface Project {
  version: 1;
  key: string;
  name: string;
  audio: { sampleRate: number; channels: number; bits: number; float: boolean; frames: number };
  clips: Clip[];
  laneNames: string[];
  script: string;
  character?: string | null; // the user's character in the script, if it has any
  cursor?: { lane: number; clip: string | null; pos: number }; // where you were
  detect: DetectParams;
  savedAt: number;
}

export const laneName = (p: Project, lane: number) =>
  lane === TRASH ? 'Trash' : lane === JUNK ? 'Junk' : p.laneNames[lane] ?? `Lane ${lane}`;

/** Index into laneCounts / per-line counts: named lanes, then junk, then trash. */
export const laneSlot = (p: Project, lane: number) => (lane === TRASH ? p.laneNames.length + 1 : lane === JUNK ? p.laneNames.length : lane);
export const finalLane = (p: Project) => p.laneNames.length - 1;

export const byStart = (a: Clip, b: Clip) => a.start - b.start;

export function laneClips(p: Project, lane: number): Clip[] {
  return p.clips.filter((c) => c.lane === lane).sort(byStart);
}

export function laneCounts(p: Project): number[] {
  const counts = new Array(p.laneNames.length + 2).fill(0);
  for (const c of p.clips) counts[laneSlot(p, c.lane)]++;
  return counts;
}

/** Script line of every clip: explicit marks carry forward to the clips after them. */
export function derivedLines(p: Project): Map<string, number> {
  const out = new Map<string, number>();
  let cur = 0;
  for (const c of [...p.clips].sort(byStart)) {
    if (c.line !== undefined) cur = c.line;
    if (cur > 0) out.set(c.id, cur);
  }
  return out;
}

export interface ScriptLine {
  n: number; // 1-based position among the non-empty rows; what clips point at
  character: string | null;
  text: string; // spoken text without the name
  raw: string;
}

// "Name: text", "Name (note): text", "Name : text". Up to three words, letters only.
const CHAR_RE = /^([\p{Lu}][\p{L}\p{M}'’.\- ]{0,30}?)\s*(?:\(([^)]*)\))?\s*:\s*(\S.*)$/u;

let scriptCache: { text: string; lines: ScriptLine[] } | null = null;

/** Non-empty rows of the script; `Name: text` rows are spoken lines, the rest are directions. */
export function parseScript(text: string): ScriptLine[] {
  if (scriptCache && scriptCache.text === text) return scriptCache.lines;
  const lines: ScriptLine[] = [];
  let n = 0;
  for (const row of text.split(/\r?\n/)) {
    const raw = row.trim();
    if (!raw) continue;
    n++;
    const m = CHAR_RE.exec(raw);
    const name = m?.[1].trim();
    if (m && name && name.split(/\s+/).length <= 3) lines.push({ n, character: name, text: m[3].trim(), raw });
    else lines.push({ n, character: null, text: raw, raw });
  }
  scriptCache = { text, lines };
  return lines;
}

export function characters(lines: ScriptLine[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const l of lines) if (l.character) counts.set(l.character, (counts.get(l.character) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The user's lines: their character's; every spoken line if none is chosen; every row if the script has no characters. */
export function myLines(lines: ScriptLine[], character: string | null | undefined): ScriptLine[] {
  if (!lines.some((l) => l.character)) return lines;
  if (!character) return lines.filter((l) => l.character);
  return lines.filter((l) => l.character === character);
}

// ---- persistence (localStorage for JSON, IndexedDB for file handles) ----

const K = {
  legacyProject: (key: string) => `takekeeper:project:${key}`,
  settings: 'takekeeper:settings',
  last: 'takekeeper:last',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(K.settings);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Settings>;
      if (stored.stepMs === 10) stored.stepMs = 15; // old default, bumped 50%
      return { ...DEFAULT_SETTINGS, ...stored };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(K.settings, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const PROJECT_FILE = 'takekeeper-project';

/** Serialise a project for saving next to the recording. */
export function projectFileText(p: Project): string {
  return JSON.stringify({ format: PROJECT_FILE, version: 1, savedAt: new Date().toISOString(), project: p }, null, 1);
}

export function parseProjectFile(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(t('That is not a takekeeper project file.'));
  }
  const wrapped = raw as { format?: string; project?: Project };
  const p = wrapped?.format === PROJECT_FILE ? wrapped.project : (raw as Project);
  if (!p || p.version !== 1 || !Array.isArray(p.clips) || !p.audio || !Array.isArray(p.laneNames)) {
    throw new Error(t('That is not a takekeeper project file.'));
  }
  return p;
}

// ---- IndexedDB: projects (no practical size limit) and file handles ----

let dbPromise: Promise<IDBDatabase> | null = null;

function idb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((res, rej) => {
    const r = indexedDB.open('takekeeper', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => {
      dbPromise = null;
      rej(r.error);
    };
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return idb().then(
    (db) =>
      new Promise<T | undefined>((res, rej) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        let out: T | undefined;
        if (req) req.onsuccess = () => (out = req.result);
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
      }),
  );
}

export async function idbSet(key: string, value: unknown) {
  try {
    await tx('kv', 'readwrite', (s) => void s.put(value, key));
  } catch {
    /* ignore */
  }
}

export async function idbDel(key: string) {
  try {
    await tx('kv', 'readwrite', (s) => void s.delete(key));
  } catch {
    /* ignore */
  }
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await tx<T>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T>);
  } catch {
    return undefined;
  }
}

const validProject = (p: unknown): p is Project => {
  const q = p as Project;
  return !!q && q.version === 1 && Array.isArray(q.clips) && !!q.audio && Array.isArray(q.laneNames);
};

export async function loadProject(key: string): Promise<Project | null> {
  try {
    const p = await tx<Project>('projects', 'readonly', (s) => s.get(key) as IDBRequest<Project>);
    return validProject(p) ? p : null;
  } catch {
    return null;
  }
}

export async function saveProject(p: Project) {
  try {
    await tx('projects', 'readwrite', (s) => void s.put({ ...p, savedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export async function deleteProject(key: string) {
  try {
    await tx('projects', 'readwrite', (s) => void s.delete(key));
  } catch {
    /* ignore */
  }
}

export async function allProjects(): Promise<Project[]> {
  try {
    const all = (await tx<Project[]>('projects', 'readonly', (s) => s.getAll() as IDBRequest<Project[]>)) ?? [];
    return all.filter(validProject).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  } catch {
    return [];
  }
}

export interface SessionInfo {
  key: string;
  name: string;
  savedAt: number;
}

/** Saved sessions, newest first. */
export async function sessions(): Promise<SessionInfo[]> {
  return (await allProjects()).map((p) => ({ key: p.key, name: p.name, savedAt: p.savedAt ?? 0 }));
}

/** A saved project for the same recording under a different key (file re-saved, moved, renamed). */
export async function findProjectFor(audio: { name: string; frames: number; sampleRate: number; channels: number }): Promise<Project | null> {
  let best: Project | null = null;
  const score = (p: Project) => (p.name === audio.name ? 1e15 : 0) + (p.savedAt ?? 0);
  for (const p of await allProjects()) {
    const a = p.audio;
    if (a.frames !== audio.frames || a.sampleRate !== audio.sampleRate || a.channels !== audio.channels) continue;
    if (!best || score(p) > score(best)) best = p;
  }
  return best;
}

/** One-time move of projects saved by earlier versions in localStorage. */
export async function migrateLegacyProjects() {
  try {
    const prefix = K.legacyProject('');
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) {
      try {
        const p = JSON.parse(localStorage.getItem(k) ?? 'null');
        if (validProject(p) && !(await loadProject(p.key))) await saveProject(p);
      } catch {
        /* skip a broken entry */
      }
      localStorage.removeItem(k);
    }
    localStorage.removeItem(K.last);
  } catch {
    /* ignore */
  }
}
