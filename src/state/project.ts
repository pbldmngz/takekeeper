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
