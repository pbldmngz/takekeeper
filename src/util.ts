export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function fmtTime(sec: number, decimals = 2): string {
  const neg = sec < 0;
  sec = Math.abs(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec - h * 3600 - m * 60;
  const ss = s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0');
  return `${neg ? '-' : ''}${h ? h + ':' + String(m).padStart(2, '0') : m}:${ss}`;
}

export const fmtDur = (sec: number) => (sec < 10 ? `${sec.toFixed(2)} s` : fmtTime(sec, 1));

export const uid = () => Math.random().toString(36).slice(2, 10);

export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const stem = (name: string) => name.replace(/\.[^.]+$/, '');

export const pad = (n: number, w: number) => String(n).padStart(w, '0');

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
