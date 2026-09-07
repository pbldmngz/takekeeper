import type { DetectParams } from '../audio/analyze';

export const TRASH = -1;

export interface Clip {
  id: string;
  start: number; // absolute sample frame in the source
  end: number; // exclusive
  lane: number; // 0 = Unsorted ... laneNames.length-1 = Final, TRASH = -1
  line?: number; // explicit script line; unset clips inherit from the previous clip
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
};

export interface Project {
  version: 1;
  key: string;
  name: string;
  audio: { sampleRate: number; channels: number; bits: number; float: boolean; frames: number };
  clips: Clip[];
  laneNames: string[];
  script: string;
  detect: DetectParams;
  savedAt: number;
}

export const laneName = (p: Project, lane: number) => (lane === TRASH ? 'Trash' : p.laneNames[lane] ?? `Lane ${lane}`);
export const finalLane = (p: Project) => p.laneNames.length - 1;

export const byStart = (a: Clip, b: Clip) => a.start - b.start;

export function laneClips(p: Project, lane: number): Clip[] {
  return p.clips.filter((c) => c.lane === lane).sort(byStart);
}

export function laneCounts(p: Project): number[] {
  const counts = new Array(p.laneNames.length + 1).fill(0);
  for (const c of p.clips) counts[c.lane === TRASH ? p.laneNames.length : c.lane]++;
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

export const scriptLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

// ---- persistence (localStorage for JSON, IndexedDB for file handles) ----

const K = {
  project: (key: string) => `takekeeper:project:${key}`,
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

export function loadProject(key: string): Project | null {
  try {
    const raw = localStorage.getItem(K.project(key));
    if (!raw) return null;
    const p = JSON.parse(raw) as Project;
    if (p.version !== 1 || !Array.isArray(p.clips)) return null;
    return p;
  } catch {
    return null;
  }
}

export function saveProject(p: Project) {
  try {
    localStorage.setItem(K.project(p.key), JSON.stringify({ ...p, savedAt: Date.now() }));
    localStorage.setItem(K.last, JSON.stringify({ key: p.key, name: p.name }));
  } catch {
    /* quota - project JSON is small, so this should not happen */
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
    throw new Error('That is not a takekeeper project file.');
  }
  const wrapped = raw as { format?: string; project?: Project };
  const p = wrapped?.format === PROJECT_FILE ? wrapped.project : (raw as Project);
  if (!p || p.version !== 1 || !Array.isArray(p.clips) || !p.audio || !Array.isArray(p.laneNames)) {
    throw new Error('That is not a takekeeper project file.');
  }
  return p;
}

/** A saved project for the same recording under a different key (file re-saved, moved, renamed). */
export function findProjectFor(audio: { name: string; frames: number; sampleRate: number; channels: number }): Project | null {
  const prefix = K.project('');
  let best: Project | null = null;
  const score = (p: Project) => (p.name === audio.name ? 1e15 : 0) + (p.savedAt ?? 0);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      const p = loadProject(k.slice(prefix.length));
      if (!p) continue;
      const a = p.audio;
      if (a.frames !== audio.frames || a.sampleRate !== audio.sampleRate || a.channels !== audio.channels) continue;
      if (!best || score(p) > score(best)) best = p;
    }
  } catch {
    /* ignore */
  }
  return best;
}

export function lastProject(): { key: string; name: string } | null {
  try {
    const raw = localStorage.getItem(K.last);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('takekeeper', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function idbSet(key: string, value: unknown) {
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await idb();
    return await new Promise<T | undefined>((res, rej) => {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => res(r.result as T | undefined);
      r.onerror = () => rej(r.error);
    });
  } catch {
    return undefined;
  }
}
