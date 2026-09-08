import { t } from '../i18n';

// Main-thread client for the Whisper worker: one model load, sequential takes,
// download progress aggregated across files, hard cancel by terminating the worker.

export type AsrDevice = 'webgpu' | 'wasm';

export const MODELS = {
  // the _timestamped exports carry cross-attentions, which word timestamps need; same size and speed
  base: { id: 'onnx-community/whisper-base_timestamped', label: 'base · faster', size: '~140 MB' },
  small: { id: 'onnx-community/whisper-small_timestamped', label: 'small · more accurate', size: '~410 MB' },
} as const;
export type AsrModel = keyof typeof MODELS;

export const LANGUAGES = {
  spanish: 'spanish',
  english: 'english',
  auto: null,
} as const;
export type AsrLanguage = keyof typeof LANGUAGES;

interface Progress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
}

export async function detectDevice(): Promise<{ device: AsrDevice; label: string }> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string } } | null> } }).gpu;
  if (gpu) {
    try {
      const a = await gpu.requestAdapter();
      if (a) return { device: 'webgpu', label: `webgpu${a.info?.vendor ? ' · ' + a.info.vendor : ''}` };
    } catch {
      /* fall through */
    }
  }
  return { device: 'wasm', label: t('cpu · no webgpu, expect it to be slow') };
}

export interface Word {
  text: string;
  start: number | null; // seconds from the start of the audio given
  end: number | null;
}

export interface Transcript {
  text: string;
  words: Word[];
}

export class Transcriber {
  private worker: Worker | null = null;
  private pending = new Map<number, { resolve: (t: Transcript) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private files = new Map<string, { loaded: number; total: number }>();
  private loadWait: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private onProgress: ((fraction: number, message: string) => void) | null = null;

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent) => this.handle(e.data);
    w.onerror = (e) => this.failAll(new Error(e.message || 'worker error'));
    this.worker = w;
    return w;
  }

  private handle(msg: { type: string; id?: number; text?: string; words?: Word[]; message?: string; info?: Progress }) {
    if (msg.type === 'progress' && msg.info) {
      const p = msg.info;
      if (p.file && p.total) this.files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of this.files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      const frac = total ? loaded / total : 0;
      const label = p.status === 'ready' ? t('warming up') : t('downloading model · {a} / {b} MB', { a: Math.round(loaded / 1e6), b: Math.round(total / 1e6) });
      this.onProgress?.(frac, label);
      return;
    }
    if (msg.type === 'ready') {
      this.loadWait?.resolve();
      this.loadWait = null;
      return;
    }
    if (msg.type === 'result' && msg.id !== undefined) {
      this.pending.get(msg.id)?.resolve({ text: msg.text ?? '', words: msg.words ?? [] });
      this.pending.delete(msg.id);
      return;
    }
    if (msg.type === 'error') {
      const err = new Error(msg.message ?? t('transcription failed'));
      if (msg.id !== undefined) {
        this.pending.get(msg.id)?.reject(err);
        this.pending.delete(msg.id);
      } else {
        this.loadWait?.reject(err);
        this.loadWait = null;
      }
    }
  }

  private failAll(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.loadWait?.reject(err);
    this.loadWait = null;
  }

  load(model: string, device: AsrDevice, onProgress: (fraction: number, message: string) => void): Promise<void> {
    this.onProgress = onProgress;
    this.files.clear();
    const w = this.ensure();
    return new Promise<void>((resolve, reject) => {
      this.loadWait = { resolve, reject };
      w.postMessage({ type: 'load', model, device });
    });
  }

  transcribe(audio: Float32Array, language: string | null): Promise<string> {
    return this.run(audio, language, false).then((t) => t.text);
  }

  /** Transcript plus a start/end time for every word. About 1.4x the cost. */
  transcribeWords(audio: Float32Array, language: string | null): Promise<Transcript> {
    return this.run(audio, language, true);
  }

  private run(audio: Float32Array, language: string | null, words: boolean): Promise<Transcript> {
    const w = this.ensure();
    const id = this.nextId++;
    return new Promise<Transcript>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ type: 'transcribe', id, audio, language, words }, [audio.buffer]);
    });
  }

  /** Stop everything now. The next call starts a fresh worker (model reloads from cache). */
  cancel() {
    this.worker?.terminate();
    this.worker = null;
    this.failAll(new Error('cancelled'));
  }
}
