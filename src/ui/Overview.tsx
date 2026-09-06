import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../state/store';
import { cssVar } from '../util';

const PX_PER_SEC = 26;
const GAP = 3;
const MIN_W = 10;

/** The current lane as a strip of clips, each drawn with its level envelope. */
export function Overview() {
  const s = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  const layout = useRef<Array<{ id: string; x: number; w: number }>>([]);
  const offset = useRef(0);
  const [, tick] = useState(0);

  useEffect(() => {
    const onResize = () => tick((x) => x + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const c = ref.current;
    const { source: src, analysis: an } = s.state;
    if (!c || !src || !an) return;
    const ctx = c.getContext('2d')!;
    const dpr = devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const list = s.laneList();
    const cur = s.state.cursor;
    const sr = src.sampleRate;
    const items: Array<{ id: string; x: number; w: number }> = [];
    let x = 0;
    let cx = W / 2;
    for (const clip of list) {
      const w = Math.max(MIN_W, ((clip.end - clip.start) / sr) * PX_PER_SEC);
      items.push({ id: clip.id, x, w });
      if (clip.id === cur) cx = x + w / 2;
      x += w + GAP;
    }
    const ox = W / 2 - cx;
    offset.current = ox;
    layout.current = items;

    const blue = cssVar('--blue');
    const blueDim = cssVar('--blue-dim');
    const amber = cssVar('--amber');
    const amberDim = cssVar('--amber-dim');
    const dim = cssVar('--dim');
    const pad = 10;
    const inner = H - pad * 2;

    ctx.font = `10px ${cssVar('--mono')}`;
    for (let i = 0; i < list.length; i++) {
      const clip = list[i];
      const it = items[i];
      const x0 = it.x + ox;
      if (x0 + it.w < 0 || x0 > W) continue;
      const active = clip.id === cur;
      ctx.fillStyle = active ? amberDim : blueDim;
      roundRect(ctx, x0, pad, it.w, inner, 4);
      ctx.fill();

      // envelope from the analysis frames
      ctx.fillStyle = active ? amber : blue;
      const f0 = Math.floor(clip.start / an.frameLen);
      const f1 = Math.ceil(clip.end / an.frameLen);
      const cols = Math.max(1, Math.floor(it.w / 2));
      for (let k = 0; k < cols; k++) {
        const a = f0 + Math.floor(((f1 - f0) * k) / cols);
        const b = Math.max(a + 1, f0 + Math.floor(((f1 - f0) * (k + 1)) / cols));
        let m = -120;
        for (let f = a; f < b && f < an.db.length; f++) if (an.db[f] > m) m = an.db[f];
        const amp = Math.min(1, Math.max(0, (m + 60) / 60));
        const h = Math.max(1, amp * (inner - 6));
        ctx.fillRect(x0 + 1 + k * 2, pad + (inner - h) / 2, 1.4, h);
      }
      if (it.w > 34) {
        ctx.fillStyle = active ? amber : dim;
        ctx.fillText(`${i + 1}`, x0 + 5, pad + 11);
      }
    }
    if (!list.length) {
      ctx.fillStyle = dim;
      ctx.font = `13px ${cssVar('--font')}`;
      ctx.textAlign = 'center';
      ctx.fillText('This lane is empty', W / 2, H / 2 + 4);
    }
  });

  const onClick = (e: MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - offset.current;
    const hit = layout.current.find((it) => x >= it.x && x <= it.x + it.w);
    if (hit) s.gotoClip(hit.id, { play: true });
  };

  return (
    <div class="overview">
      <canvas ref={ref} onClick={onClick} />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
