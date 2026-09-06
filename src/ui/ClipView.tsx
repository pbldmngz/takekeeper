import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '../state/store';
import { cssVar, fmtTime } from '../util';

/** The current clip with its surrounding context, the playhead, and in/out edges. */
export function ClipView() {
  const s = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  const clip = s.clip();

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf = 0;
    const draw = () => {
      paint(c, s);
      if (s.state.playing) raf = requestAnimationFrame(draw);
    };
    draw();
    const ro = new ResizeObserver(() => paint(c, s));
    ro.observe(c);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });

  const onClick = (e: MouseEvent) => {
    const clip = s.clip();
    const src = s.state.source;
    if (!clip || !src) return;
    const rect = ref.current!.getBoundingClientRect();
    const [vs, ve] = s.viewRange(clip);
    s.seek(vs + ((e.clientX - rect.left) / rect.width) * (ve - vs));
  };

  return (
    <div class="clipview">
      <canvas ref={ref} onClick={onClick} />
      {!clip && (
        <div class="hint">
          Nothing to play in this lane.
          <br />
          <kbd>Tab</kbd> switches lanes · <kbd>Ctrl</kbd> <kbd>Z</kbd> brings things back
        </div>
      )}
    </div>
  );
}

function paint(c: HTMLCanvasElement, s: ReturnType<typeof useStore>) {
  const clip = s.clip();
  const src = s.state.source;
  const an = s.state.analysis;
  const ctx = c.getContext('2d')!;
  const dpr = devicePixelRatio || 1;
  const W = c.clientWidth;
  const H = c.clientHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!clip || !src || !an) return;

  const [vs, ve] = s.viewRange(clip);
  const span = ve - vs;
  const X = (f: number) => ((f - vs) / span) * W;
  const sr = src.sampleRate;
  const rulerH = 22;
  const top = rulerH;
  const mid = top + (H - top) / 2;
  const amp = (H - top) / 2 - 12;

  const wave = cssVar('--wave');
  const waveCtx = cssVar('--wave-ctx');
  const blueDim = cssVar('--blue-dim');
  const amber = cssVar('--amber');
  const amber2 = cssVar('--amber-2');
  const dim = cssVar('--dim');
  const muted = cssVar('--muted');
  const line = cssVar('--line-2');
  const mono = cssVar('--mono');

  // clip region
  ctx.fillStyle = blueDim;
  ctx.fillRect(X(clip.start), top, X(clip.end) - X(clip.start), H - top);

  // ruler
  ctx.fillStyle = dim;
  ctx.font = `10.5px ${mono}`;
  ctx.textAlign = 'center';
  const spanSec = span / sr;
  const tick = spanSec > 12 ? 2 : spanSec > 6 ? 1 : spanSec > 3 ? 0.5 : 0.25;
  const t0 = Math.ceil(vs / sr / tick) * tick;
  for (let t = t0; t <= ve / sr; t += tick) {
    const x = X(t * sr);
    ctx.fillStyle = line;
    ctx.fillRect(x, top - 6, 1, 6);
    ctx.fillStyle = dim;
    ctx.fillText(fmtTime(t, tick < 1 ? 2 : 0), x, 12);
  }
  ctx.fillStyle = line;
  ctx.fillRect(0, top, W, 1);

  // waveform
  const loaded = s.bufferFor(clip);
  if (loaded) {
    const m = loaded.mono;
    const per = span / W;
    for (let px = 0; px < W; px++) {
      const a = Math.floor(px * per);
      const b = Math.max(a + 1, Math.floor((px + 1) * per));
      let lo = 1;
      let hi = -1;
      for (let i = a; i < b && i < m.length; i++) {
        const v = m[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi < lo) continue;
      const f = vs + a;
      ctx.fillStyle = f >= clip.start && f < clip.end ? wave : waveCtx;
      const y0 = mid - hi * amp;
      const y1 = mid - lo * amp;
      ctx.fillRect(px, y0, 1, Math.max(1, y1 - y0));
    }
  } else {
    // coarse envelope from analysis frames while the audio loads
    ctx.fillStyle = waveCtx;
    for (let px = 0; px < W; px += 2) {
      const f = Math.floor((vs + px * (span / W)) / an.frameLen);
      const a = Math.min(1, Math.max(0, (an.db[f] + 60) / 60));
      ctx.fillRect(px, mid - a * amp * 0.6, 1.5, a * amp * 1.2 || 1);
    }
  }

  // in / out edges
  ctx.font = `10px ${mono}`;
  for (const [f, label, align] of [
    [clip.start, 'IN', 'left'],
    [clip.end, 'OUT', 'right'],
  ] as const) {
    const x = X(f);
    ctx.fillStyle = muted;
    ctx.fillRect(Math.round(x) - (align === 'right' ? 1 : 0), top, 1, H - top);
    ctx.textAlign = align;
    ctx.fillText(label, x + (align === 'left' ? 5 : -5), H - 8);
  }

  // playhead
  const pos = s.playhead();
  const x = Math.round(X(pos));
  ctx.fillStyle = amber;
  ctx.shadowColor = amber;
  ctx.shadowBlur = 10;
  ctx.fillRect(x - 1, top, 2, H - top);
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(x - 6, top);
  ctx.lineTo(x + 6, top);
  ctx.lineTo(x, top + 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = amber2;
  ctx.font = `11px ${mono}`;
  ctx.textAlign = x > W - 80 ? 'right' : 'left';
  ctx.fillText(fmtTime(pos / sr, 3), x + (x > W - 80 ? -8 : 8), top + 16);
}
