import { JUNK, TRASH, laneCounts } from '../state/project';
import { useStore } from '../state/store';
import { T, laneLabel, t } from '../i18n';
import { fmtDur, fmtTime } from '../util';
import { Toolbar } from './Toolbar';
import { ClipView } from './ClipView';
import { LangSwitch } from './Empty';
import { Logo } from './Logo';
import { Overview } from './Overview';
import { ScriptPanel } from './ScriptPanel';

export function Editor() {
  const s = useStore();
  const { project: p, source: src, lane, playing, slow, settings, toast, unsaved, lineMode, lineFilter, ai, loop } = s.state;
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
      ? `${t('line {n} of {total}', { n: filterOrd ?? '', total: s.mine().length })} · ${s.lineText(lineFilter).slice(0, 60)} · ` +
        (filterCounts
          ? p.laneNames
              .map((n, i) => (filterCounts[i] ? `${laneLabel(n)} ${filterCounts[i]}` : ''))
              .filter(Boolean)
              .join(' · ') || t('no takes')
          : t('no takes')) +
        ' · ' +
        t('shift ↑↓ changes line')
      : null;
  const laneNow = s.laneLabel(lane);
  const gain = settings.gainDb;
  const busy = ai.status === 'loading' || ai.status === 'running';

  return (
    <div class="editor">
      <header class="top">
        <Logo />
        <div class="file" title={src.name}>
          <b>{src.name}</b> · {fmtTime(src.frames / src.sampleRate, 0)} · {src.sampleRate / 1000} khz ·{' '}
          {src.channels === 1 ? t('mono') : src.channels === 2 ? t('stereo') : t('{n} ch', { n: src.channels })} · {src.float ? '32f' : src.bits}-bit
        </div>
        <nav class="lanes">
          {p.laneNames.map((name, i) => (
            <button class={`lane${lane === i ? ' active' : ''}`} onClick={() => s.setLane(i)} title={t('lane {n}', { n: i })}>
              {laneLabel(name)} <span class="n">{counts[i]}</span>
            </button>
          ))}
          <button class={`lane junk${lane === JUNK ? ' active' : ''}`} onClick={() => s.setLane(JUNK)} title={t('auto-detected non-takes: enter rescues, backspace trashes')}>
            {laneLabel('Junk')} <span class="n">{counts[p.laneNames.length]}</span>
          </button>
          <button class={`lane trash${lane === TRASH ? ' active' : ''}`} onClick={() => s.setLane(TRASH)}>
            {laneLabel('Trash')} <span class="n">{counts[p.laneNames.length + 1]}</span>
          </button>
        </nav>
        <div class="actions">
          <button
            class={`k${unsaved ? ' amber' : ''}`}
            onClick={() => void s.saveProjectFile()}
            title={unsaved ? t(unsaved === 1 ? '{n} unsaved edit · save the project file' : '{n} unsaved edits · save the project file', { n: unsaved }) : t('save the project file')}
          >
            {t('save')} <kbd>ctrl s</kbd>
          </button>
          <button class="k amber" onClick={() => s.openModal('export')}>
            {t('export')} <kbd>e</kbd>
          </button>
          <LangSwitch />
          <button class="k" onClick={() => s.openModal('settings')} title={t('settings')}>
            <kbd>,</kbd>
          </button>
          <button class="k" onClick={() => s.openModal('help')} title={t('keys')}>
            <kbd>?</kbd>
          </button>
        </div>
      </header>
      <div class={`banner${toast ? '' : ' quiet'}`}>
        {toast
          ? toast.text
          : busy
            ? `${ai.message} · ${ai.status === 'running' ? `${ai.done}/${ai.total}` : `${Math.round(ai.progress * 100)}%`}${ai.eta ? ` · ${t('{n} min left', { n: Math.ceil(ai.eta / 60) })}` : ''} · ${t('w to cancel')}`
            : lineBanner ??
              (lane === JUNK
                ? t(
                    list.length === 1
                      ? 'junk · {n} clip found empty by transcription · enter rescues to unsorted · backspace trashes'
                      : 'junk · {n} clips found empty by transcription · enter rescues to unsorted · backspace trashes',
                    { n: list.length },
                  )
                : t(list.length === 1 ? '{lane} · {n} clip · enter promotes · backspace trashes · tab switches lane' : '{lane} · {n} clips · enter promotes · backspace trashes · tab switches lane', {
                    lane: laneNow,
                    n: list.length,
                  }))}
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
                <b>{t('line {n}', { n: ord ?? line })}</b> {lineText}
                {clip.text !== undefined && (
                  <span class="tx" title={t('transcript')}>
                    {' '}
                    {clip.kind === 'multi' ? (
                      <b class="doubt">{t('×{n} reads', { n: clip.reads ?? 2 })} </b>
                    ) : clip.kind === 'partial' ? (
                      <b class="doubt">{t('false start')} </b>
                    ) : clip.kind === 'junk' ? (
                      <b class="doubt">{t('junk')} </b>
                    ) : clip.conf !== undefined && clip.conf < 0.36 ? (
                      <b class="doubt">? </b>
                    ) : null}
                    “{clip.text || '…'}”
                  </span>
                )}
              </span>
            ) : (
              <span class="line-text dim">
                <T k="no line · [[l]] marks the next line here" />
              </span>
            )}
          </>
        ) : (
          <span class="line-text">
            <T k="{lane} is empty · [[tab]] switches lanes" v={{ lane: laneNow }} />
          </span>
        )}
        <span class={`badge${playing ? ' play' : ''}`}>{playing ? (slow ? t('slow {r}×', { r: settings.slowRate }) : t('playing')) : t('stopped')}</span>
        {loop && <span class="badge on">{t('loop')}</span>}
        {lineMode && <span class="badge on">{t('by line')}</span>}
        {lane === JUNK && <span class="badge on">{t('enter rescues · ⌫ trashes')}</span>}
        <span class={`badge${settings.autoplay ? ' on' : ''}`}>{t('autoplay')}</span>
        <span class={`badge${gain !== 0 ? ' on' : ''}`}>
          {gain >= 0 ? '+' : ''}
          {gain} db
        </span>
      </div>

      <Toolbar />
    </div>
  );
}
