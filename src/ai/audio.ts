import { decodeSamples, type Source } from '../audio/wav';

export const ASR_RATE = 16000;

/** A clip as mono 16 kHz float samples, which is what Whisper expects. */
export async function clipTo16k(src: Source, start: number, end: number): Promise<Float32Array> {
  const x = decodeSamples(await src.readBytes(start, end), src);
  const ch = src.channels;
  const n = end - start;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let c = 0; c < ch; c++) v += x[i * ch + c];
    mono[i] = v / ch;
  }
  if (src.sampleRate === ASR_RATE) return mono;
  const outLen = Math.max(1, Math.ceil((n * ASR_RATE) / src.sampleRate));
  const ctx = new OfflineAudioContext(1, outLen, ASR_RATE);
  const buf = ctx.createBuffer(1, n, src.sampleRate);
  buf.copyToChannel(mono, 0);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  node.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}
