import { t } from '../i18n';
import { decodeSamples, encodeSamples, silenceBytes, wavHeader, type Source } from './wav';

export const canSaveFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
export const canSaveFile = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

/** Body of one clip: lazy slice of the source, with only the fade edges rewritten. */
export async function bodyParts(src: Source, s: number, e: number, fade: number): Promise<BlobPart[]> {
  const len = e - s;
  if (fade <= 1 || len < 2 * fade) return [src.sliceBytes(s, e)];
  const ch = src.channels;
  const head = decodeSamples(await src.readBytes(s, s + fade), src);
  const tail = decodeSamples(await src.readBytes(e - fade, e), src);
  const hOut = Float32Array.from(head);
  const tOut = Float32Array.from(tail);
  for (let i = 0; i < fade; i++) {
    const g = i / (fade - 1);
    for (let c = 0; c < ch; c++) {
      hOut[i * ch + c] = head[i * ch + c] * g;
      tOut[(fade - 1 - i) * ch + c] = tail[(fade - 1 - i) * ch + c] * g;
    }
  }
  return [encodeSamples(hOut, src), src.sliceBytes(s + fade, e - fade), encodeSamples(tOut, src)];
}

export async function clipBlob(src: Source, s: number, e: number, fade: number): Promise<Blob> {
  const parts = await bodyParts(src, s, e, fade);
  return new Blob([wavHeader(src, (e - s) * src.blockAlign), ...parts], { type: 'audio/wav' });
}

export async function mergedBlob(
  src: Source,
  ranges: Array<[number, number]>,
  fade: number,
  gapFrames: number,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const parts: BlobPart[] = [];
  let bytes = 0;
  const gap = gapFrames > 0 ? new Blob([silenceBytes(src, gapFrames)]) : null;
  for (let i = 0; i < ranges.length; i++) {
    const [s, e] = ranges[i];
    parts.push(...(await bodyParts(src, s, e, fade)));
    bytes += (e - s) * src.blockAlign;
    if (gap && i < ranges.length - 1) {
      parts.push(gap);
      bytes += gap.size;
    }
    onProgress?.((i + 1) / ranges.length);
  }
  return new Blob([wavHeader(src, bytes), ...parts], { type: 'audio/wav' });
}

// ---- ZIP (store method, no compression - WAV does not compress anyway) ----

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

async function crc32(blob: Blob): Promise<number> {
  let c = -1;
  const CH = 8 << 20;
  for (let p = 0; p < blob.size; p += CH) {
    const u = new Uint8Array(await blob.slice(p, p + CH).arrayBuffer());
    for (let i = 0; i < u.length; i++) c = CRC_TABLE[(c ^ u[i]) & 255] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

export interface Entry {
  name: string;
  blob: Blob;
}

export async function buildZip(entries: Entry[], onProgress?: (p: number) => void): Promise<Blob> {
  const parts: BlobPart[] = [];
  const central: BlobPart[] = [];
  const enc = new TextEncoder();
  let offset = 0;
  for (let i = 0; i < entries.length; i++) {
    const { name, blob } = entries[i];
    const nameB = enc.encode(name);
    const crc = await crc32(blob);
    const size = blob.size;

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, nameB.length, true);
    parts.push(lh.buffer, nameB, blob);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, nameB.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd.buffer, nameB);

    offset += 30 + nameB.length + size;
    onProgress?.((i + 1) / entries.length);
  }
  let cdSize = 0;
  for (const p of central) cdSize += (p as ArrayBuffer | Uint8Array).byteLength;
  if (offset + cdSize > 0xffffffff || entries.length > 0xffff) {
    throw new Error(t('ZIP would exceed 4 GB / 65535 files. Use Save to folder instead.'));
  }
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd.buffer], { type: 'application/zip' });
}

// ---- Saving ----

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Write files straight into a folder the user picks. Returns count, or null if cancelled. */
export async function saveToFolder(entries: Entry[], onProgress?: (p: number) => void): Promise<number | null> {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
  for (let i = 0; i < entries.length; i++) {
    const h = await dir.getFileHandle(entries[i].name, { create: true });
    const w = await h.createWritable();
    await w.write(entries[i].blob);
    await w.close();
    onProgress?.((i + 1) / entries.length);
  }
  return entries.length;
}

/** Save one blob: streaming file picker where available, download link otherwise. */
export async function saveBlob(blob: Blob, name: string): Promise<boolean> {
  if (canSaveFile) {
    try {
      const ext = name.slice(name.lastIndexOf('.'));
      const h = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: ext === '.zip' ? 'ZIP archive' : 'WAV audio', accept: { [blob.type || 'application/octet-stream']: [ext] } }],
      });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    } catch (e) {
      if (isAbort(e)) return false;
      throw e;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 120_000);
  return true;
}
