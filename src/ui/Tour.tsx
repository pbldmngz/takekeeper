import { useEffect, useState } from 'preact/hooks';
import { TOUR } from '../tour';
import { useStore } from '../state/store';
import { T, t } from '../i18n';

const CARD = 360;
const GAP = 14;

/** The card next to whatever the step is about, and a ring around it. */
function place(sel: string[], how: 'above' | 'below' | 'left') {
  const el = sel.reduce<Element | null>((hit, q) => hit ?? document.querySelector(q), null);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const clamp = (v: number, max: number) => Math.max(12, Math.min(v, max - 12));
  const card: { left: number; top: number } =
    how === 'below'
      ? { left: r.left, top: r.bottom + GAP }
      : how === 'above'
        ? { left: r.left + 40, top: r.top - GAP }
        : { left: r.left - CARD - GAP, top: r.top + 64 };
  return {
    ring: { left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 },
    card: { left: clamp(card.left, innerWidth - CARD), top: card.top, above: how === 'above' },
  };
}

export function Tour() {
  const s = useStore();
  const step = s.state.tour;
  const [, tick] = useState(0);

  useEffect(() => {
    const onResize = () => tick((x) => x + 1);
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  if (step === null || s.state.phase !== 'ready') return null;
  const cur = TOUR[step];
  const pos = place(cur.sel, cur.place);
  if (!pos) return null;
  const last = step === TOUR.length - 1;

  return (
    <>
      <div class="tour-ring" style={{ left: pos.ring.left, top: pos.ring.top, width: pos.ring.width, height: pos.ring.height }} />
      <div
        class="tour"
        style={pos.card.above ? { left: pos.card.left, bottom: innerHeight - pos.card.top } : { left: pos.card.left, top: pos.card.top }}
      >
        <h3>
          <T k={cur.title} />
        </h3>
        <p>
          <T k={cur.body} />
        </p>
        <div class="foot">
          <span class="n">
            {step + 1}/{TOUR.length}
          </span>
          <button class="k muted" onClick={() => s.endTour()}>
            {t('skip')}
          </button>
          <button class="k amber" onClick={() => s.tourStep(1)}>
            {last ? t('done') : t('next')} <kbd>{last ? 'esc' : '→'}</kbd>
          </button>
        </div>
      </div>
    </>
  );
}
