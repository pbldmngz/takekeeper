import { TRASH, laneCounts } from '../state/project';
import { useStore } from '../state/store';
import { fmtDur, fmtTime } from '../util';
import { ClipView } from './ClipView';
import { Logo } from './Logo';
import { Overview } from './Overview';
import { ScriptPanel } from './ScriptPanel';

export function Editor() {
  const s = useStore();
  const { project: p, source: src, lane, playing, slow, settings, toast } = s.state;
  if (!p || !src) return null;
  const counts = laneCounts(p);
  const clip = s.clip();
  const list = s.laneList();
  const idx = clip ? list.findIndex((c) => c.id === clip.id) : -1;
  const line = clip ? s.lineOf(clip) : undefined;
  const lineText = s.lineText(line);
  const laneNow = s.laneName(lane).toLowerCase();
  const gain = settings.gainDb;

  return (
    <div class="editor">
      <header class="top">
        <Logo />
        <div class="file" title={src.name}>
          <b>{src.name}</b> · {fmtTime(src.frames / src.sampleRate, 0)} · {src.sampleRate / 1000} khz ·{' '}
          {src.channels === 1 ? 'mono' : src.channels === 2 ? 'stereo' : `${src.channels} ch`} · {src.float ? '32f' : src.bits}-bit
        </div>
        <nav class="lanes">
          {p.laneNames.map((name, i) => (
            <button class={`lane${lane === i ? ' active' : ''}`} onClick={() => s.setLane(i)} title={`lane ${i}`}>
              {name.toLowerCase()} <span class="n">{counts[i]}</span>
            </button>
          ))}
          <button class={`lane trash${lane === TRASH ? ' active' : ''}`} onClick={() => s.setLane(TRASH)}>
            trash <span class="n">{counts[p.laneNames.length]}</span>
          </button>
        </nav>
        <div class="actions">
          <button class="k amber" onClick={() => s.openModal('export')}>
            export <kbd>e</kbd>
          </button>
          <button class="k" onClick={() => s.openModal('settings')} title="settings">
            <kbd>,</kbd>
          </button>
          <button class="k" onClick={() => s.openModal('help')} title="keys">
            <kbd>?</kbd>
          </button>
        </div>
      </header>
      <div class={`banner${toast ? '' : ' quiet'}`}>
        {toast
          ? toast.text
          : `${laneNow} · ${list.length} clip${list.length === 1 ? '' : 's'} · enter promotes · backspace trashes · tab switches lane`}
      </div>

      <Overview />

      <div class="main">
        <ClipView />
        <ScriptPanel />
      </div>

      <div class="info">
        {clip ? (
          <>
            <span>
              <b>#{idx + 1}</b>/{list.length} {laneNow}
            </span>
            <span class="mono">{fmtTime(clip.start / src.sampleRate)}</span>
            <span class="mono">{fmtDur((clip.end - clip.start) / src.sampleRate)}</span>
            {line ? (
              <span class="line-text">
                <b>line {line}</b> {lineText}
              </span>
            ) : (
              <span class="line-text dim">
                no line · <kbd>l</kbd> marks the next line here
              </span>
            )}
          </>
        ) : (
          <span class="line-text">
            {laneNow} is empty · <kbd>tab</kbd> switches lanes
          </span>
        )}
        <span class={`badge${playing ? ' play' : ''}`}>{playing ? (slow ? `slow ${settings.slowRate}×` : 'playing') : 'stopped'}</span>
        <span class={`badge${settings.autoplay ? ' on' : ''}`}>autoplay</span>
        <span class={`badge${gain !== 0 ? ' on' : ''}`}>
          {gain >= 0 ? '+' : ''}
          {gain} db
        </span>
      </div>

      <div class="hints">
        <span>
          <kbd>space</kbd> play
        </span>
        <span>
          <kbd>↑</kbd> prev·slow
        </span>
        <span>
          <kbd>↓</kbd> next
        </span>
        <span>
          <kbd>←</kbd>
          <kbd>→</kbd> frame
        </span>
        <span class="sep">|</span>
        <span>
          <kbd class="amber">enter</kbd> promote
        </span>
        <span>
          <kbd>⌫</kbd> trash
        </span>
        <span>
          <kbd>1</kbd>–<kbd>{p.laneNames.length - 1}</kbd> lane
        </span>
        <span class="sep">|</span>
        <span>
          <kbd>s</kbd> split
        </span>
        <span>
          <kbd>m</kbd> merge
        </span>
        <span>
          <kbd>i</kbd>
          <kbd>o</kbd> trim
        </span>
        <span>
          <kbd>l</kbd> line
        </span>
        <span class="sep">|</span>
        <span>
          <kbd>=</kbd>
          <kbd>-</kbd> gain
        </span>
        <span>
          <kbd>tab</kbd> lane
        </span>
        <span>
          <kbd>ctrl z</kbd> undo
        </span>
        <span>
          <kbd>?</kbd> all keys
        </span>
      </div>
    </div>
  );
}
