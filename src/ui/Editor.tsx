import { JUNK, TRASH, laneCounts } from '../state/project';
import { useStore } from '../state/store';
import { fmtDur, fmtTime } from '../util';
import { Toolbar } from './Toolbar';
import { ClipView } from './ClipView';
import { Logo } from './Logo';
import { Overview } from './Overview';
import { ScriptPanel } from './ScriptPanel';

export function Editor() {
  const s = useStore();
  const { project: p, source: src, lane, playing, slow, settings, toast, unsaved, lineMode, lineFilter, ai } = s.state;
  if (!p || !src) return null;
  const counts = laneCounts(p);
  const clip = s.clip();
  const list = s.laneList();
  const idx = clip ? list.findIndex((c) => c.id === clip.id) : -1;
  const line = clip ? s.lineOf(clip) : undefined;
  const lineText = s.lineText(line);
  const ord = s.ordinal(line);
  const filterOrd = lineFilter ? s.ordinal(lineFilter) : undefined;
  const filterCounts = lineFilter ? s.lineCounts().get(lineFilter) : undefined;
  const lineBanner =
    lineMode && lineFilter
      ? `line ${filterOrd} of ${s.mine().length} · ${s.lineText(lineFilter).slice(0, 60)} · ` +
        (filterCounts
          ? p.laneNames
              .map((n, i) => (filterCounts[i] ? `${n.toLowerCase()} ${filterCounts[i]}` : ''))
              .filter(Boolean)
              .join(' · ') || 'no takes'
          : 'no takes') +
        ' · shift ↑↓ changes line'
      : null;
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
          <button class={`lane junk${lane === JUNK ? ' active' : ''}`} onClick={() => s.setLane(JUNK)} title="auto-detected non-takes: enter rescues, backspace trashes">
            junk <span class="n">{counts[p.laneNames.length]}</span>
          </button>
          <button class={`lane trash${lane === TRASH ? ' active' : ''}`} onClick={() => s.setLane(TRASH)}>
            trash <span class="n">{counts[p.laneNames.length + 1]}</span>
          </button>
        </nav>
        <div class="actions">
          <button
            class={`k${unsaved ? ' amber' : ''}`}
            onClick={() => void s.saveProjectFile()}
            title={unsaved ? `${unsaved} unsaved edit${unsaved === 1 ? '' : 's'} · save the project file` : 'save the project file'}
          >
            save <kbd>ctrl s</kbd>
          </button>
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
          : ai.status === 'loading' || ai.status === 'running'
            ? `${ai.message} · ${ai.status === 'running' ? `${ai.done}/${ai.total}` : `${Math.round(ai.progress * 100)}%`}${ai.eta ? ` · ${Math.ceil(ai.eta / 60)} min left` : ''} · w to cancel`
            : lineBanner ??
              (lane === JUNK
                ? `junk · ${list.length} clip${list.length === 1 ? '' : 's'} found empty by transcription · enter rescues to unsorted · backspace trashes`
                : `${laneNow} · ${list.length} clip${list.length === 1 ? '' : 's'} · enter promotes · backspace trashes · tab switches lane`)}
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
                <b>line {ord ?? line}</b> {lineText}
                {clip.text !== undefined && (
                  <span class="tx" title="transcript">
                    {' '}
                    {clip.kind === 'multi' ? <b class="doubt">×{clip.reads} reads </b> : clip.kind === 'partial' ? <b class="doubt">false start </b> : clip.kind === 'junk' ? <b class="doubt">junk </b> : clip.conf !== undefined && clip.conf < 0.36 ? <b class="doubt">? </b> : null}
                    “{clip.text || '…'}”
                  </span>
                )}
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
        {lineMode && <span class="badge on">by line</span>}
        {lane === JUNK && <span class="badge on">enter rescues · ⌫ trashes</span>}
        <span class={`badge${settings.autoplay ? ' on' : ''}`}>autoplay</span>
        <span class={`badge${gain !== 0 ? ' on' : ''}`}>
          {gain >= 0 ? '+' : ''}
          {gain} db
        </span>
      </div>

      <Toolbar />
    </div>
  );
}
