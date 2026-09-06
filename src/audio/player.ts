import { decodeSamples, type Source } from './wav';

export interface Loaded {
  buf: AudioBuffer;
  mono: Float32Array; // channel mix, for drawing
  vs: number; // absolute frame of buf[0]
  ve: number;
}

/** Web Audio playback of a decoded range, with sample-accurate position. */
export class Player {
  ctx: AudioContext | null = null;
  playing = false;
  onEnded: (() => void) | null = null;

  private node: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private startFrame = 0;
  private endFrame = 0;
  private rate = 1;
  private srcRate = 48000;

  private gain: GainNode | null = null;
  private gainValue = 1;

  private ensureCtx() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.gainValue;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Monitoring gain only - never touches exported audio. */
  setGainDb(db: number) {
    this.gainValue = Math.pow(10, db / 20);
    if (this.gain) this.gain.gain.value = this.gainValue;
  }

  async decode(src: Source, vs: number, ve: number): Promise<Loaded> {
    const ctx = this.ensureCtx();
    const x = decodeSamples(await src.readBytes(vs, ve), src);
    const n = ve - vs;
    const ch = src.channels;
    const buf = ctx.createBuffer(ch, Math.max(1, n), src.sampleRate);
    const mono = new Float32Array(n);
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const v = x[i * ch + c];
        d[i] = v;
        mono[i] += v / ch;
      }
    }
    return { buf, mono, vs, ve };
  }

  play(l: Loaded, from: number, to: number, rate: number) {
    this.stop();
    const ctx = this.ensureCtx();
    if (to <= from) return;
    const node = ctx.createBufferSource();
    node.buffer = l.buf;
    node.playbackRate.value = rate;
    node.connect(this.gain ?? ctx.destination);
    const sr = l.buf.sampleRate;
    node.onended = () => {
      if (this.node !== node) return;
      this.node = null;
      this.playing = false;
      this.startFrame = this.endFrame;
      this.onEnded?.();
    };
    node.start(0, (from - l.vs) / sr, (to - from) / sr);
    this.node = node;
    this.startedAt = ctx.currentTime;
    this.startFrame = from;
    this.endFrame = to;
    this.rate = rate;
    this.srcRate = sr;
    this.playing = true;
  }

  stop() {
    const n = this.node;
    if (n) {
      n.onended = null;
      this.startFrame = this.position();
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.node = null;
    this.playing = false;
  }

  /** Current absolute frame. */
  position(): number {
    if (!this.playing || !this.ctx) return this.startFrame;
    const elapsed = this.ctx.currentTime - this.startedAt;
    return Math.min(this.endFrame, this.startFrame + elapsed * this.rate * this.srcRate);
  }
}
