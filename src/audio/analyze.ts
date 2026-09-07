import { decodeSamples, type Source } from './wav';

export interface Analysis {
  db: Float32Array; // per-frame level, dBFS, loudest channel
  frameLen: number; // samples per frame
  floor: number; // ~noise floor (10th percentile)
  peak: number;
}

export interface DetectParams {
  threshold: number; // dBFS
  minSilence: number; // seconds
  margin: number; // seconds
}

/** Stream through the source once and measure the level of every frame. */
export async function analyze(
  src: Source,
  frameMs: number,
  onProgress: (p: number) => void,
): Promise<Analysis> {
  const frameLen = Math.max(1, Math.round((src.sampleRate * frameMs) / 1000));
  const nFrames = Math.ceil(src.frames / frameLen);
  const db = new Float32Array(nFrames);
  const per = 1000; // frames per read (~20 s at 20 ms)
  const ch = src.channels;
  for (let f0 = 0; f0 < nFrames; f0 += per) {
    const f1 = Math.min(nFrames, f0 + per);
    const s0 = f0 * frameLen;
    const s1 = Math.min(src.frames, f1 * frameLen);
    const x = decodeSamples(await src.readBytes(s0, s1), src);
    for (let f = f0; f < f1; f++) {
      const a = (f - f0) * frameLen * ch;
      const b = Math.min(x.length, a + frameLen * ch);
      let best = 0;
      for (let c = 0; c < ch; c++) {
        let acc = 0;
        let cnt = 0;
        for (let i = a + c; i < b; i += ch) {
          acc += x[i] * x[i];
          cnt++;
        }
        const m = cnt ? acc / cnt : 0;
        if (m > best) best = m;
      }
      db[f] = 10 * Math.log10(Math.max(best, 1e-24));
    }
    onProgress(f1 / nFrames);
    await new Promise((r) => setTimeout(r, 0));
  }
  const sorted = Float32Array.from(db).sort();
  const floor = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : -120;
  const peak = sorted.length ? sorted[sorted.length - 1] : -120;
  return { db, frameLen, floor, peak };
}

/** Re-cut one range of the recording with its own (finer) parameters. */
export function segmentRange(an: Analysis, start: number, end: number, sampleRate: number, p: DetectParams): Array<[number, number]> {
  const f0 = Math.floor(start / an.frameLen);
  const f1 = Math.ceil(end / an.frameLen);
  const sub: Analysis = { ...an, db: an.db.subarray(f0, f1) };
  const off = f0 * an.frameLen;
  return segment(sub, end - off, sampleRate, p).map(([s, e]) => [Math.max(start, s + off), Math.min(end, e + off)]);
}

/** Turn frame levels into [start, end) sample ranges to keep. */
export function segment(
  an: Analysis,
  total: number,
  sampleRate: number,
  p: DetectParams,
): Array<[number, number]> {
  const { db, frameLen } = an;
  const minSil = Math.round(p.minSilence * sampleRate);
  const margin = Math.round(p.margin * sampleRate);

  const runs: Array<[number, number]> = [];
  let inRun = false;
  let start = 0;
  for (let i = 0; i <= db.length; i++) {
    const loud = i < db.length && db[i] > p.threshold;
    if (loud && !inRun) {
      inRun = true;
      start = i;
    } else if (!loud && inRun) {
      inRun = false;
      runs.push([start * frameLen, Math.min(i * frameLen, total)]);
    }
  }
  if (!runs.length) return [];

  // Only genuinely long gaps get cut; short pauses inside a take stay.
  const merged: Array<[number, number]> = [runs[0]];
  for (let k = 1; k < runs.length; k++) {
    const [s, e] = runs[k];
    const last = merged[merged.length - 1];
    if (s - last[1] < minSil) last[1] = e;
    else merged.push([s, e]);
  }

  // Breathing room on each side, then re-merge anything that now overlaps.
  const out: Array<[number, number]> = [];
  for (const [s0, e0] of merged) {
    const s = Math.max(0, s0 - margin);
    const e = Math.min(total, e0 + margin);
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}
