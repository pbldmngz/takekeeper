// Match transcribed takes to script lines. Takes are mostly recorded in script
// order with small detours, so a Viterbi pass with a "stay or move a little"
// prior beats matching each take on its own.

import type { ScriptLine } from '../state/project';

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/([aeiou])\1+/g, '$1') // scripts stretch vowels for effect: hoooola -> hola
    .replace(/([^aeiou\s])\1{2,}/g, '$1$1') // and consonants: nooooo -> noo, ssss -> ss
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i + 3 <= t.length; i++) {
    const g = t.slice(i, i + 3);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function dice(a: Map<string, number>, b: Map<string, number>): number {
  let inter = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v;
  for (const v of b.values()) nb += v;
  if (!na || !nb) return 0;
  for (const [k, v] of a) inter += Math.min(v, b.get(k) ?? 0);
  return (2 * inter) / (na + nb);
}

function wordSet(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of s.split(' ')) if (w) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

export interface Prepared {
  text: string;
  tri: Map<string, number>;
  words: Map<string, number>;
  alt?: Prepared; // the same take with repeated sentences collapsed ("x. x." -> "x")
}

export function prepare(raw: string): Prepared {
  const text = normalize(raw);
  const p: Prepared = { text, tri: trigrams(text), words: wordSet(text) };
  const sentences = raw
    .split(/[.!?…]+/)
    .map(normalize)
    .filter(Boolean);
  const unique = [...new Set(sentences)];
  if (sentences.length > 1 && unique.length < sentences.length) {
    const t = unique.join(' ');
    p.alt = { text: t, tri: trigrams(t), words: wordSet(t) };
  }
  return p;
}

/** 0..1 similarity: character trigrams carry most of it, whole words add precision. */
export function similarity(a: Prepared, b: Prepared): number {
  const one = (x: Prepared): number => {
    if (!x.text || !b.text) return 0;
    if (x.text === b.text) return 1;
    return 0.65 * dice(x.tri, b.tri) + 0.35 * dice(x.words, b.words);
  };
  return a.alt ? Math.max(one(a), one(a.alt)) : one(a);
}

export interface Alignment {
  index: number; // into `lines`
  n: number; // script row
  score: number; // emission for the chosen line
  confidence: number; // 0..1
}

const NEAR = 8; // how far a "local" move can reach
const farCost = 0.55;

function moveCost(delta: number): number {
  if (delta === 0 || delta === 1) return 0;
  if (delta > 1) return 0.12 * (delta - 1);
  return 0.18 + 0.08 * (-delta - 1);
}

/** Assign every transcript (in recording order) to one of the user's lines. */
export function alignTakes(transcripts: string[], lines: ScriptLine[]): Alignment[] {
  const L = lines.length;
  const N = transcripts.length;
  if (!L || !N) return [];
  const prepLines = lines.map((l) => prepare(l.text));
  const prepTakes = transcripts.map(prepare);

  // emissions
  const E: Float32Array[] = prepTakes.map((t) => {
    const row = new Float32Array(L);
    for (let j = 0; j < L; j++) row[j] = similarity(t, prepLines[j]);
    return row;
  });

  const V: Float32Array[] = [];
  const back: Int32Array[] = [];
  let prev = new Float32Array(L);
  // first take: prefer the beginning of the script a little
  for (let j = 0; j < L; j++) prev[j] = E[0][j] - Math.min(0.3, 0.02 * j);
  V.push(prev);
  back.push(new Int32Array(L).fill(-1));

  for (let i = 1; i < N; i++) {
    const cur = new Float32Array(L);
    const bp = new Int32Array(L);
    let gmax = -Infinity;
    let garg = 0;
    for (let k = 0; k < L; k++) if (prev[k] > gmax) (gmax = prev[k]), (garg = k);
    for (let j = 0; j < L; j++) {
      let best = gmax - farCost;
      let arg = garg;
      const lo = Math.max(0, j - NEAR);
      const hi = Math.min(L - 1, j + NEAR);
      for (let k = lo; k <= hi; k++) {
        const v = prev[k] - moveCost(j - k);
        if (v > best) (best = v), (arg = k);
      }
      cur[j] = best + E[i][j];
      bp[j] = arg;
    }
    V.push(cur);
    back.push(bp);
    prev = cur;
  }

  // backtrack
  const path = new Int32Array(N);
  let j = 0;
  for (let k = 1; k < L; k++) if (prev[k] > prev[j]) j = k;
  for (let i = N - 1; i >= 0; i--) {
    path[i] = j;
    j = back[i][j] >= 0 ? back[i][j] : j;
  }

  return Array.from(path, (idx, i) => {
    const row = E[i];
    const score = row[idx];
    let second = 0;
    for (let k = 0; k < L; k++) if (k !== idx && row[k] > second) second = row[k];
    const words = prepTakes[i].text ? prepTakes[i].text.split(' ').length : 0;
    let confidence = 0.6 * score + 0.4 * Math.max(0, score - second);
    if (words <= 1) confidence *= 0.6;
    return { index: idx, n: lines[idx].n, score, confidence: Math.max(0, Math.min(1, confidence)) };
  });
}

export const UNCERTAIN = 0.36;

/** Whisper's failure mode on breaths and slates: one token repeated forever. */
export function cleanTranscript(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  const words = normalize(text).split(' ').filter(Boolean);
  if (!words.length) return ''; // punctuation only: "¡¡¡¡¡¡"
  if (words.length >= 8) {
    const unique = new Set(words).size;
    if (unique / words.length < 0.25) return '';
  }
  return text;
}
