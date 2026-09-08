import { t } from '../i18n';
// Byte-level audio source. WAV files are never decoded whole: analysis streams
// through them in chunks and clips are lazy Blob.slice() views onto the file.

export interface Fmt {
  channels: number;
  sampleRate: number;
  bits: number;
  float: boolean;
  bytesPerSample: number;
  blockAlign: number;
}

export interface Source extends Fmt {
  kind: 'wav' | 'decoded';
  name: string;
  key: string;
  frames: number;
  file: File;
  sliceBytes(start: number, end: number): Blob;
  readBytes(start: number, end: number): Promise<ArrayBuffer>;
}

export const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

const ascii = (v: DataView, p: number, n: number) => {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(p + i));
  return s;
};

function mkFmt(channels: number, sampleRate: number, bits: number, float: boolean): Fmt {
  const bytesPerSample = bits / 8;
  return { channels, sampleRate, bits, float, bytesPerSample, blockAlign: channels * bytesPerSample };
}

export async function openAudio(file: File): Promise<Source> {
  const head = new DataView(await file.slice(0, Math.min(file.size, 1 << 20)).arrayBuffer());
  if (head.byteLength >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') {
    return openWav(file, head);
  }
  if (head.byteLength >= 4 && ascii(head, 0, 4) === 'RF64') {
    throw new Error(t('RF64 WAV files (over 4 GB) are not supported yet.'));
  }
  return openCompressed(file);
}

function openWav(file: File, head: DataView): Source {
  let pos = 12;
  let fmt: Fmt | null = null;
  let dataOff = -1;
  let dataLen = 0;
  while (pos + 8 <= head.byteLength) {
    const id = ascii(head, pos, 4);
    const size = head.getUint32(pos + 4, true);
    if (id === 'fmt ') {
      let tag = head.getUint16(pos + 8, true);
      const channels = head.getUint16(pos + 10, true);
      const sampleRate = head.getUint32(pos + 12, true);
      const bits = head.getUint16(pos + 22, true);
      if (tag === 0xfffe && size >= 40) tag = head.getUint16(pos + 8 + 24, true);
      if (tag !== 1 && tag !== 3) throw new Error(t('Unsupported WAV encoding - only PCM and float WAV are supported.'));
      if (![8, 16, 24, 32].includes(bits)) throw new Error(t('Unsupported bit depth: {bits}-bit.', { bits }));
      if (tag === 3 && bits !== 32) throw new Error(t('Only 32-bit float WAV is supported.'));
      fmt = mkFmt(channels, sampleRate, bits, tag === 3);
    } else if (id === 'data') {
      dataOff = pos + 8;
      dataLen = size;
      break;
    }
    pos += 8 + size + (size & 1);
  }
  if (!fmt || dataOff < 0) throw new Error(t('Could not find the audio data in this WAV file.'));
  const avail = file.size - dataOff;
  if (dataLen === 0 || dataLen === 0xffffffff || dataLen > avail) dataLen = avail;
  dataLen -= dataLen % fmt.blockAlign;
  const { blockAlign } = fmt;
  const off = dataOff;
  return {
    kind: 'wav',
    name: file.name,
    key: fileKey(file),
    frames: dataLen / blockAlign,
    file,
    ...fmt,
    sliceBytes: (s, e) => file.slice(off + s * blockAlign, off + e * blockAlign),
    readBytes: (s, e) => file.slice(off + s * blockAlign, off + e * blockAlign).arrayBuffer(),
  };
}

// Compressed formats go through the browser decoder, which holds the whole
// decoded file in memory - fine for short files, impossible for an hour.
async function openCompressed(file: File): Promise<Source> {
  if (file.size > 250 * 1024 * 1024) {
    throw new Error(t('Compressed files over 250 MB cannot be decoded in the browser. Convert to WAV first.'));
  }
  let ab: AudioBuffer;
  try {
    ab = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(t('Could not decode this file. WAV works best; MP3, FLAC, OGG and M4A work for shorter recordings.'));
  }
  const ch = ab.numberOfChannels;
  const n = ab.length;
  if (n * ch * 3 > 450e6) {
    throw new Error(t('This compressed file is too long to decode in the browser. Convert it to WAV first.'));
  }
  const fmt = mkFmt(ch, ab.sampleRate, 24, false);
  let bytes: Uint8Array<ArrayBuffer> | null = new Uint8Array(new ArrayBuffer(n * ch * 3));
  for (let c = 0; c < ch; c++) {
    const d = ab.getChannelData(c);
    for (let i = 0, j = c * 3; i < n; i++, j += ch * 3) {
      const x = Math.round(Math.max(-1, Math.min(1, d[i])) * 8388607);
      bytes[j] = x & 255;
      bytes[j + 1] = (x >> 8) & 255;
      bytes[j + 2] = (x >> 16) & 255;
    }
  }
  const blob = new Blob([bytes]);
  bytes = null;
  const { blockAlign } = fmt;
  return {
    kind: 'decoded',
    name: file.name,
    key: fileKey(file),
    frames: n,
    file,
    ...fmt,
    sliceBytes: (s, e) => blob.slice(s * blockAlign, e * blockAlign),
    readBytes: (s, e) => blob.slice(s * blockAlign, e * blockAlign).arrayBuffer(),
  };
}

/** Interleaved samples as floats in [-1, 1]. */
export function decodeSamples(buf: ArrayBuffer, fmt: Fmt): Float32Array {
  const n = Math.floor(buf.byteLength / fmt.bytesPerSample);
  if (fmt.float) return new Float32Array(buf, 0, n);
  const out = new Float32Array(n);
  switch (fmt.bits) {
    case 8: {
      const u = new Uint8Array(buf);
      for (let i = 0; i < n; i++) out[i] = (u[i] - 128) / 128;
      break;
    }
    case 16: {
      const s = new Int16Array(buf, 0, n);
      for (let i = 0; i < n; i++) out[i] = s[i] / 32768;
      break;
    }
    case 24: {
      const u = new Uint8Array(buf);
      for (let i = 0, j = 0; i < n; i++, j += 3) {
        let x = u[j] | (u[j + 1] << 8) | (u[j + 2] << 16);
        if (x & 0x800000) x -= 0x1000000;
        out[i] = x / 8388608;
      }
      break;
    }
    case 32: {
      const s = new Int32Array(buf, 0, n);
      for (let i = 0; i < n; i++) out[i] = s[i] / 2147483648;
      break;
    }
  }
  return out;
}

/** Inverse of decodeSamples, in the source's own encoding. */
export function encodeSamples(f: Float32Array, fmt: Fmt): ArrayBuffer {
  const n = f.length;
  const buf = new ArrayBuffer(n * fmt.bytesPerSample);
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  if (fmt.float) {
    new Float32Array(buf).set(f);
    return buf;
  }
  switch (fmt.bits) {
    case 8: {
      const u = new Uint8Array(buf);
      for (let i = 0; i < n; i++) u[i] = Math.round(clamp(f[i]) * 127) + 128;
      break;
    }
    case 16: {
      const s = new Int16Array(buf);
      for (let i = 0; i < n; i++) s[i] = Math.round(clamp(f[i]) * 32767);
      break;
    }
    case 24: {
      const u = new Uint8Array(buf);
      for (let i = 0, j = 0; i < n; i++, j += 3) {
        const x = Math.round(clamp(f[i]) * 8388607);
        u[j] = x & 255;
        u[j + 1] = (x >> 8) & 255;
        u[j + 2] = (x >> 16) & 255;
      }
      break;
    }
    case 32: {
      const s = new Int32Array(buf);
      for (let i = 0; i < n; i++) s[i] = Math.round(clamp(f[i]) * 2147483647);
      break;
    }
  }
  return buf;
}

export function wavHeader(fmt: Fmt, dataBytes: number): ArrayBuffer {
  const b = new ArrayBuffer(44);
  const v = new DataView(b);
  const put = (p: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i));
  };
  put(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, fmt.float ? 3 : 1, true);
  v.setUint16(22, fmt.channels, true);
  v.setUint32(24, fmt.sampleRate, true);
  v.setUint32(28, fmt.sampleRate * fmt.blockAlign, true);
  v.setUint16(32, fmt.blockAlign, true);
  v.setUint16(34, fmt.bits, true);
  put(36, 'data');
  v.setUint32(40, dataBytes, true);
  return b;
}

export function silenceBytes(fmt: Fmt, frames: number): ArrayBuffer {
  const b = new ArrayBuffer(frames * fmt.blockAlign);
  if (fmt.bits === 8 && !fmt.float) new Uint8Array(b).fill(128);
  return b;
}
