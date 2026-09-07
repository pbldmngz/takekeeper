// Runs Whisper off the main thread. Loaded lazily; the model is fetched once
// and cached by the browser. Audio never leaves the machine.
import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;

interface WorkerScope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}
const ctx = self as unknown as WorkerScope;

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string }>;

let asr: Asr | null = null;
let loadedKey = '';

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data as
    | { type: 'load'; model: string; device: 'webgpu' | 'wasm' }
    | { type: 'transcribe'; id: number; audio: Float32Array; language: string | null };

  if (msg.type === 'load') {
    const key = `${msg.model}|${msg.device}`;
    if (asr && loadedKey === key) return ctx.postMessage({ type: 'ready' });
    asr = null;
    try {
      // base's encoder is not stable in fp16 on webgpu (outputs collapse to one token); small is fine
      const encoder = /whisper-(tiny|base)/.test(msg.model) ? 'fp32' : 'fp16';
      const dtype = msg.device === 'webgpu' ? { encoder_model: encoder, decoder_model_merged: 'q4' } : 'q8';
      const p = await pipeline('automatic-speech-recognition', msg.model, {
        device: msg.device,
        dtype: dtype as never,
        progress_callback: (info: unknown) => ctx.postMessage({ type: 'progress', info }),
      });
      asr = p as unknown as Asr;
      loadedKey = key;
      ctx.postMessage({ type: 'ready' });
    } catch (err) {
      ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (msg.type === 'transcribe') {
    if (!asr) return ctx.postMessage({ type: 'error', id: msg.id, message: 'model not loaded' });
    try {
      const long = msg.audio.length > 30 * 16000;
      const seconds = msg.audio.length / 16000;
      const out = await asr(msg.audio, {
        // takes are short; a hard cap stops runaway repetition on breaths and slates
        max_new_tokens: Math.min(160, 24 + Math.ceil(seconds * 7)),
        language: msg.language ?? undefined,
        task: 'transcribe',
        chunk_length_s: long ? 30 : 0,
        stride_length_s: long ? 5 : 0,
        return_timestamps: false,
      });
      ctx.postMessage({ type: 'result', id: msg.id, text: out.text ?? '' });
    } catch (err) {
      // A take with no speech makes the model emit nothing and the library throw on
      // decoding an empty sequence. That is a silent take, not a failure.
      const message = err instanceof Error ? err.message : String(err);
      if (/token_ids|non-empty/i.test(message)) return ctx.postMessage({ type: 'result', id: msg.id, text: '' });
      ctx.postMessage({ type: 'error', id: msg.id, message });
    }
  }
};
