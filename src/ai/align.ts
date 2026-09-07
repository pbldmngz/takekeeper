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

export interface Diagnosis {
  kind?: 'junk' | 'multi' | 'partial';
  reads: number;
}

/** What a transcript says about the take: nothing, one read, several, or a false start. */
export function diagnose(transcript: string, line: string, score: number): Diagnosis {
  const t = prepare(transcript);
  if (!t.text) return { kind: 'junk', reads: 0 };
  const words = t.text.split(' ').length;
  if (words <= 2 && score < 0.35) return { kind: 'junk', reads: 0 };
  const target = prepare(line);
  const lineWords = target.text.split(' ');
  const sentences = transcript
    .split(/[.!?…]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map(prepare)
    .filter((x) => x.text);
  const lineSentences = line.split(/[.!?…]+/).filter((x) => x.trim()).length;

  if (lineSentences > 1) {
    // a line with several sentences: its own sentences look like fragments, so only an
    // exact repeat means another read
    const seen = new Map<string, number>();
    let dup = 1;
    for (const x of sentences) {
      const n = (seen.get(x.text) ?? 0) + 1;
      seen.set(x.text, n);
      dup = Math.max(dup, n);
    }
    if (dup >= 2) return { kind: 'multi', reads: dup };
    if (score < 0.6 && words < lineWords.length * 0.6) return { kind: 'partial', reads: 1 };
    return { reads: 1 };
  }

  let reads = 0;
  for (const x of sentences) if (similarity(x, target) >= 0.55) reads++;
  if (reads >= 2) return { kind: 'multi', reads };
  // false start followed by the real read in the same breath: the last sentence must carry
  // the whole line by itself, and an earlier one must be a short prefix of it
  if (reads === 1 && sentences.length >= 2) {
    const last = sentences[sentences.length - 1];
    const lastWords = new Set(last.text.split(' '));
    const coverage = lineWords.filter((w) => lastWords.has(w)).length / lineWords.length;
    if (coverage >= 0.8) {
      for (const x of sentences.slice(0, -1)) {
        const n = x.text.split(' ').length;
        if (n < lineWords.length * 0.6 && similarity(x, prepare(lineWords.slice(0, n + 1).join(' '))) >= 0.6) {
          return { kind: 'multi', reads: sentences.length };
        }
      }
    }
  }
  // false start on its own: clearly shorter than the line, but matching its beginning
  if (score < 0.6 && words < lineWords.length * 0.6 && words >= 1) {
    const head = prepare(lineWords.slice(0, words + 1).join(' '));
    if (similarity(t, head) >= 0.6) return { kind: 'partial', reads: 1 };
  }
  return { reads: Math.max(1, reads) };
}

export interface WordGroup {
  text: string;
  start: number; // seconds
  end: number;
}

/** Split timed words into sentences (by the punctuation Whisper writes), or into `reads` equal runs when it wrote none. */
export function groupWords(words: Array<{ text: string; start: number | null; end: number | null }>, reads: number, total: number): WordGroup[] {
  const timed = words.filter((w) => w.text.trim());
  if (!timed.length) return [];
  // fill missing times from neighbours
  for (let i = 0; i < timed.length; i++) {
    if (timed[i].start === null) timed[i].start = i ? timed[i - 1].end : 0;
    if (timed[i].end === null) timed[i].end = i + 1 < timed.length && timed[i + 1].start !== null ? timed[i + 1].start : total;
  }
  const groups: WordGroup[] = [];
  let cur: WordGroup | null = null;
  for (const w of timed) {
    if (!cur) cur = { text: '', start: w.start as number, end: w.end as number };
    cur.text += w.text;
    cur.end = w.end as number;
    if (/[.!?…]\s*$/.test(w.text)) {
      groups.push(cur);
      cur = null;
    }
  }
  if (cur) groups.push(cur);
  if (groups.length >= 2 || reads < 2 || timed.length < reads) return groups.map((g) => ({ ...g, text: g.text.trim() }));
  // no punctuation to go by: equal runs
  const per = Math.round(timed.length / reads);
  const out: WordGroup[] = [];
  for (let i = 0; i < timed.length; i += per) {
    const run = timed.slice(i, i + per);
    if (!run.length) continue;
    out.push({ text: run.map((w) => w.text).join('').trim(), start: run[0].start as number, end: run[run.length - 1].end as number });
  }
  return out;
}

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
