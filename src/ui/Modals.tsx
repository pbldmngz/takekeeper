import { useEffect, useRef, useState } from 'preact/hooks';
import { buildZip, canSaveFolder, clipBlob, mergedBlob, saveBlob, saveToFolder, type Entry } from '../audio/export';
import { silenceBytes, wavHeader } from '../audio/wav';
import { TRASH, finalLane, laneClips } from '../state/project';
import { useStore } from '../state/store';
import { MODELS, detectDevice } from '../ai/transcriber';
import { T, laneLabel, t, type Key } from '../i18n';
import { support } from '../links';
import { fmtDur, pad, stem } from '../util';

export function Modals() {
  const s = useStore();
  const m = s.state.modal;
  if (!m) return null;
  return (
    <div class="backdrop" onClick={(e) => e.target === e.currentTarget && s.openModal(null)}>
      {m === 'settings' && <SettingsModal />}
      {m === 'export' && <ExportModal />}
      {m === 'help' && <HelpModal />}
      {m === 'goto' && <GotoModal />}
      {m === 'transcribe' && <TranscribeModal />}
    </div>
  );
}

// ---------------------------------------------------------------- settings

function SettingsModal() {
  const s = useStore();
  const st = s.state.settings;
  const ready = s.state.phase === 'ready';
  const preview = ready ? s.previewCount() : null;
  const current = s.state.project?.clips.length ?? 0;
  const an = s.state.analysis;
  const num = (e: Event) => Number((e.target as HTMLInputElement).value);
  const checked = (e: Event) => (e.target as HTMLInputElement).checked;

  return (
    <div class="modal">
      <h2>{t('settings')}</h2>
      <p class="lead">{t('saved in this browser. detection changes apply when you press re-detect.')}</p>

      <h3>{t('detection')}</h3>
      <div class="row">
        <label>
          {t('silence threshold')}
          <small>
            {t('quieter than this is silence.')}
            {an ? t(' this file: floor ≈ {floor} db, peak ≈ {peak} db.', { floor: an.floor.toFixed(0), peak: an.peak.toFixed(0) }) : ''}
          </small>
        </label>
        <div class="val">
          <input type="range" min={-80} max={-10} step={1} value={st.threshold} onInput={(e) => s.updateSettings({ threshold: num(e) })} />
          <span class="mono">{st.threshold} db</span>
        </div>
      </div>
      <div class="row">
        <label>
          {t('minimum silence')}
          <small>{t('shorter pauses stay inside a take.')}</small>
        </label>
        <div class="val">
          <input type="range" min={0.1} max={4} step={0.1} value={st.minSilence} onInput={(e) => s.updateSettings({ minSilence: num(e) })} />
          <span class="mono">{st.minSilence.toFixed(1)} s</span>
        </div>
      </div>
      <div class="row">
        <label>
          {t('margin')}
          <small>{t('room tone kept on each side of a take.')}</small>
        </label>
        <div class="val">
          <input type="range" min={0} max={1} step={0.05} value={st.margin} onInput={(e) => s.updateSettings({ margin: num(e) })} />
          <span class="mono">{st.margin.toFixed(2)} s</span>
        </div>
      </div>
      <div class="row">
        <label>
          {t('fade at cuts')}
          <small>{t('tiny fade so edits never click. 0 = hard cuts.')}</small>
        </label>
        <div class="val">
          <input type="range" min={0} max={30} step={1} value={st.fadeMs} onInput={(e) => s.updateSettings({ fadeMs: num(e) })} />
          <span class="mono">{st.fadeMs} ms</span>
        </div>
      </div>
      {ready && (
        <div class="row">
          <label>
            {t('re-detect with these settings')}
            <small>{t('{preview} takes with these settings · {current} now. unchanged clips keep their lane and line.', { preview: preview ?? 0, current })}</small>
          </label>
          <div class="val">
            <button class="k amber" onClick={() => s.redetect()} disabled={preview === current}>
              {t('re-detect')}
            </button>
          </div>
        </div>
      )}

      <h3>{t('listening')}</h3>
      <div class="row">
        <label>
          {t('monitor gain')}
          <small>
            <T k="for quiet takes. never touches exports. [[=]] and [[-]] while listening." />
          </small>
        </label>
        <div class="val">
          <input type="range" min={-12} max={24} step={1} value={st.gainDb} onInput={(e) => s.updateSettings({ gainDb: num(e) })} />
          <span class="mono">
            {st.gainDb >= 0 ? '+' : ''}
            {st.gainDb} db
          </span>
        </div>
      </div>
      <div class="row">
        <label>
          {t('slow-motion speed')}
          <small>{t('tape-style: pitch drops with speed.')}</small>
        </label>
        <div class="val">
          <input type="range" min={0.25} max={0.9} step={0.05} value={st.slowRate} onInput={(e) => s.updateSettings({ slowRate: num(e) })} />
          <span class="mono">{st.slowRate.toFixed(2)}×</span>
        </div>
      </div>
      <div class="row">
        <label>
          <T k="slow motion on [[↑]]" />
          <small>
            <T k="replay the previous clip at the slow speed. [[shift space]] always does." />
          </small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.slowOnPrev} onChange={(e) => s.updateSettings({ slowOnPrev: checked(e) })} />
        </div>
      </div>
      <div class="row">
        <label>
          {t('autoplay')}
          <small>{t('continue to the next clip when one finishes.')}</small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.autoplay} onChange={(e) => s.updateSettings({ autoplay: checked(e) })} />
        </div>
      </div>

      <h3>{t('transcription')}</h3>
      <div class="row">
        <label>
          {t('empty takes go to junk')}
          <small>{t('breaths, slates and false starts with no words move to the junk lane for a quick review.')}</small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.autoJunk} onChange={(e) => s.updateSettings({ autoJunk: checked(e) })} />
        </div>
      </div>
      <div class="row">
        <label>
          {t('re-cut takes with several reads')}
          <small>{t('a take that repeats its line is cut at the pauses inside it and the pieces transcribed.')}</small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.autoSplit} onChange={(e) => s.updateSettings({ autoSplit: checked(e) })} />
        </div>
      </div>

      <h3>{t('editing')}</h3>
      <div class="row">
        <label>
          {t('frame step')}
          <small>{t('one frame. alt steps a tenth of it.')}</small>
        </label>
        <div class="val">
          <input type="range" min={1} max={100} step={1} value={st.stepMs} onInput={(e) => s.updateSettings({ stepMs: num(e) })} />
          <span class="mono">{st.stepMs} ms</span>
        </div>
      </div>
      <div class="row">
        <label>
          {t('arrows move fast')}
          <small>
            <T k="[[←]] [[→]] jump ten frames; [[shift]] steps one frame, precise. off swaps them." />
          </small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.fastArrows} onChange={(e) => s.updateSettings({ fastArrows: checked(e) })} />
        </div>
      </div>
      <div class="row">
        <label>
          {t('split stays on the first half')}
          <small>
            <T k="after [[s]], review the part before the cut. off moves on to the part after it. [[shift s]] does the opposite of this setting for one split." />
          </small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.splitStaysOnFirst} onChange={(e) => s.updateSettings({ splitStaysOnFirst: checked(e) })} />
        </div>
      </div>
      <div class="row">
        <label>
          {t('context around a clip')}
          <small>{t('audio shown before and after, so you can extend a cut.')}</small>
        </label>
        <div class="val">
          <input type="range" min={0.5} max={5} step={0.25} value={st.contextSeconds} onInput={(e) => s.updateSettings({ contextSeconds: num(e) })} />
          <span class="mono">{st.contextSeconds.toFixed(2)} s</span>
        </div>
      </div>

      <h3>{t('lanes & look')}</h3>
      <div class="row">
        <label>
          {t('lane names')}
          <small>{t('comma-separated. first is the inbox, last is final. keys 1–9 send clips to them.')}</small>
        </label>
        <div class="val">
          <input
            type="text"
            value={st.laneNames.join(', ')}
            onChange={(e) => {
              const names = (e.target as HTMLInputElement).value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
              if (names.length >= 2) s.updateSettings({ laneNames: names });
            }}
          />
        </div>
      </div>
      <div class="row">
        <label>{t('theme')}</label>
        <div class="val">
          <div class="seg">
            {(['auto', 'dark', 'light'] as const).map((th) => (
              <button class={st.theme === th ? 'on' : ''} onClick={() => s.updateSettings({ theme: th })}>
                {t(th)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class="row">
        <label>
          {t('language')}
          <small>{t('the whole interface. auto follows the page you opened.')}</small>
        </label>
        <div class="val">
          <div class="seg">
            {(['auto', 'en', 'es'] as const).map((l) => (
              <button class={st.lang === l ? 'on' : ''} onClick={() => s.updateSettings({ lang: l })}>
                {l === 'auto' ? t('auto') : l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div class="foot">
        <button class="k" onClick={() => s.openModal(null)}>
          {t('close')} <kbd>esc</kbd>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- export

type Mode = 'folder' | 'zip' | 'merged';

function ExportModal() {
  const s = useStore();
  const p = s.state.project!;
  const src = s.state.source!;
  const [lane, setLane] = useState(finalLane(p));
  const [mode, setMode] = useState<Mode>(canSaveFolder ? 'folder' : 'zip');
  const [gap, setGap] = useState(0.5);
  const [prefix, setPrefix] = useState(stem(src.name));
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const timeOrder = laneClips(p, lane);
  // script order only means something once takes carry lines (marks or transcription)
  const hasLines = timeOrder.some((c) => s.lineOf(c) !== undefined);
  const byLine = s.state.settings.exportByLine && hasLines;
  const clips = byLine
    ? [...timeOrder].sort((a, b) => (s.ordinal(s.lineOf(a)) ?? Infinity) - (s.ordinal(s.lineOf(b)) ?? Infinity) || a.start - b.start)
    : timeOrder;
  const total = clips.reduce((a, c) => a + (c.end - c.start), 0) / src.sampleRate;
  const fade = Math.round((s.state.settings.fadeMs / 1000) * src.sampleRate);
  const lines = clips.map((c) => s.ordinal(s.lineOf(c)));
  const width = Math.max(2, String(clips.length).length);
  const slug = s.laneName(lane).toLowerCase().replace(/\s+/g, '-');

  const st = s.state.settings;
  // silent gap after take i: longer when the next take is another line
  const gapAfter = (i: number): number => {
    if (!st.spacers || i >= clips.length - 1) return 0;
    const a = lines[i];
    const b = lines[i + 1];
    return a && b && a !== b ? st.gapLine : st.gapClip;
  };
  const gaps = clips.reduce((n, _, i) => n + (gapAfter(i) > 0 ? 1 : 0), 0);
  const gapSeconds = clips.reduce((n, _, i) => n + gapAfter(i), 0);

  const entries = async (onProgress: (p: number) => void): Promise<Entry[]> => {
    const out: Entry[] = [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const ln = lines[i];
      const gap = gapAfter(i);
      // with spacers, "001a" is the take and "001b" the silence after it, so any sort by name keeps them together
      const num = pad(i + 1, width) + (st.spacers ? 'a' : '');
      out.push({ name: `${prefix}_${num}${ln ? `_line${pad(ln, 3)}` : ''}.wav`, blob: await clipBlob(src, c.start, c.end, fade) });
      if (gap > 0) {
        const frames = Math.round(gap * src.sampleRate);
        out.push({
          name: `${prefix}_${pad(i + 1, width)}b_gap${gap}s.wav`,
          blob: new Blob([wavHeader(src, frames * src.blockAlign), silenceBytes(src, frames)], { type: 'audio/wav' }),
        });
      }
      onProgress((i + 1) / clips.length);
    }
    return out;
  };

  const run = async () => {
    setErr(null);
    setDone(null);
    setProgress(0);
    try {
      if (mode === 'merged') {
        setBusy(t('building merged file…'));
        const blob = await mergedBlob(src, clips.map((c) => [c.start, c.end]), fade, Math.round(gap * src.sampleRate), setProgress);
        setBusy(t('saving…'));
        if (await saveBlob(blob, `${prefix}_${slug}.wav`)) setDone(t('merged file saved.'));
      } else if (mode === 'zip') {
        setBusy(t('preparing clips…'));
        const e = await entries(setProgress);
        setBusy(t('packing zip…'));
        const blob = await buildZip(e, setProgress);
        setBusy(t('saving…'));
        if (await saveBlob(blob, `${prefix}_${slug}.zip`)) setDone(t('{n} clips zipped.', { n: e.length }));
      } else {
        setBusy(t('preparing clips…'));
        const e = await entries(setProgress);
        setBusy(t('writing files…'));
        const n = await saveToFolder(e, setProgress);
        if (n !== null) setDone(t('{n} files written.', { n }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div class="modal">
      <h2>{t('export')}</h2>
      <p class="lead">
        {byLine
          ? t('clips are numbered in script order, then by recording time within a line, so sorting by name plays your lines in order.')
          : t('clips are numbered in recording order, so sorting by name keeps them chronological.')}
      </p>

      <div class="row">
        <label>
          {t('order')}
          <small>
            {hasLines
              ? t('by line: script order, recording order within a line. takes without a line go last.')
              : t('recording order; by line becomes available once takes have lines (marks or transcription).')}
          </small>
        </label>
        <div class="val">
          <div class="seg">
            <button class={st.exportByLine && hasLines ? 'on' : ''} disabled={!hasLines} onClick={() => s.updateSettings({ exportByLine: true })}>
              {t('by line')}
            </button>
            <button class={!st.exportByLine || !hasLines ? 'on' : ''} onClick={() => s.updateSettings({ exportByLine: false })}>
              {t('by time')}
            </button>
          </div>
        </div>
      </div>
      <div class="row">
        <label>{t('lane')}</label>
        <div class="val">
          <select value={lane} onChange={(e) => setLane(Number((e.target as HTMLSelectElement).value))}>
            {p.laneNames.map((n, i) => (
              <option value={i}>{laneLabel(n)}</option>
            ))}
            <option value={-2}>{laneLabel('Junk')}</option>
            <option value={TRASH}>{laneLabel('Trash')}</option>
          </select>
        </div>
      </div>
      <div class="row">
        <label>
          {t('format')}
          <small>
            {t('{n} clips · {dur}', { n: clips.length, dur: fmtDur(total) })}
            {st.spacers && gaps > 0 && mode !== 'merged' ? t(gaps === 1 ? ' · {n} gap · {dur} of silence' : ' · {n} gaps · {dur} of silence', { n: gaps, dur: fmtDur(gapSeconds) }) : ''}
          </small>
        </label>
        <div class="val">
          <div class="seg">
            {canSaveFolder && (
              <button class={mode === 'folder' ? 'on' : ''} onClick={() => setMode('folder')}>
                {t('folder')}
              </button>
            )}
            <button class={mode === 'zip' ? 'on' : ''} onClick={() => setMode('zip')}>
              {t('zip')}
            </button>
            <button class={mode === 'merged' ? 'on' : ''} onClick={() => setMode('merged')}>
              {t('one file')}
            </button>
          </div>
        </div>
      </div>
      <div class="row">
        <label>{t('file name prefix')}</label>
        <div class="val">
          <input type="text" value={prefix} onInput={(e) => setPrefix((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      {mode === 'merged' && (
        <div class="row">
          <label>
            {t('gap between clips')}
            <small>{t('silence inserted between takes in the merged file.')}</small>
          </label>
          <div class="val">
            <input type="range" min={0} max={3} step={0.1} value={gap} onInput={(e) => setGap(Number((e.target as HTMLInputElement).value))} />
            <span class="mono">{gap.toFixed(1)} s</span>
          </div>
        </div>
      )}

      <h3>{t('project file')}</h3>
      <div class="row">
        <label>
          {t('lanes, cuts, line marks and script')}
          <small>
            <T k="saved in this browser automatically, but a file is safer: keep it next to the wav and drop it on the landing page to pick up where you left off. [[ctrl s]] anywhere." />
          </small>
        </label>
        <div class="val">
          <button class="k" onClick={() => void s.saveProjectFile()}>
            {t('save project')}
          </button>
        </div>
      </div>

      {mode !== 'merged' && (
        <>
          <div class="row">
            <label>
              {t('silent gaps between takes')}
              <small>{t('tiny silent wav files, numbered to sort in place, so the folder drops into the daw with the spacing already there.')}</small>
            </label>
            <div class="val">
              <input type="checkbox" checked={st.spacers} onChange={(e) => s.updateSettings({ spacers: (e.target as HTMLInputElement).checked })} />
            </div>
          </div>
          {st.spacers && (
            <div class="row">
              <label>
                {t('after every take / between lines')}
                <small>{t('seconds. the longer gap is used when the next take is a different line.')}</small>
              </label>
              <div class="val">
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={st.gapClip}
                  onChange={(e) => s.updateSettings({ gapClip: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })}
                />
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={st.gapLine}
                  onChange={(e) => s.updateSettings({ gapLine: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })}
                />
              </div>
            </div>
          )}
        </>
      )}

      <h3>{t('into fl studio')}</h3>
      <div class="tips">
        <b>1.</b> <T k="in the browser, sort the folder **by name** and select every file." />
        <br />
        <b>2.</b> <T k="hold **shift** while dropping them onto the playlist; they land on one track, in order." />
        <br />
        <b>3.</b> <T k="turn on **ripple edit** so deleting a clip closes the gap." />
      </div>

      {busy && (
        <div style={{ marginTop: 16 }}>
          <div class="muted" style={{ marginBottom: 6 }}>
            {busy}
          </div>
          <div class="bar">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}
      {err && (
        <div class="error" style={{ marginTop: 16 }}>
          {err}
        </div>
      )}
      <div class="foot">
        <span class="left">{done ?? (mode === 'folder' ? t('pick a folder; files are written directly into it.') : '')}</span>
        <button class="k" onClick={() => s.openModal(null)}>
          {t('close')}
        </button>
        <button class="k amber" onClick={() => void run()} disabled={!!busy || !clips.length}>
          {mode === 'folder' ? t('save to folder') : mode === 'zip' ? t('download zip') : t('save file')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- help

function HelpModal() {
  const s = useStore();
  const K = ({ k }: { k: string[] }) => (
    <span class="k">
      {k.map((x) => (
        <kbd>{x}</kbd>
      ))}
    </span>
  );
  const rows: Array<[Key, string[]]> = [
    ['play / pause', ['space']],
    ['play clip from start, slow', ['shift', 'space']],
    ['previous clip', ['↑']],
    ['next clip', ['↓']],
    ['move the playhead (ten frames)', ['←', '→']],
    ['one frame, precise / a tenth', ['shift', 'alt']],
    ['clip start / end', ['home', 'end']],
    ['toggle autoplay', ['a']],
    ['loop the current take', ['r']],
    ['monitor gain up / down', ['=', '-']],
    ['promote to next lane', ['enter']],
    ['demote one lane', ['shift', 'enter']],
    ['trash', ['⌫']],
    ['send to lane n', ['0', '…', '9']],
    ['split at playhead / land on the other half', ['s', 'shift s']],
    ['merge with next / previous', ['m', 'shift m']],
    ['set clip start / end here', ['i', 'o']],
    ['undo / redo', ['ctrl z', 'ctrl shift z']],
    ['continue the script: next line starts here', ['l']],
    ['this clip: one line back / forward', ['[', ']']],
    ['jump to line number', ['shift', 'l']],
    ['line mode: one line at a time', ['g']],
    ['in line mode: previous / next line', ['shift ↑', 'shift ↓']],
    ['transcribe takes and match lines', ['w']],
    ['next doubtful line match', ['u']],
    ['junk lane: rescue / confirm trash', ['enter', '⌫']],
    ['edit script', ['t']],
    ['switch lane', ['tab', 'shift tab']],
    ['export', ['e']],
    ['settings', [',']],
    ['open a file', ['ctrl', 'o']],
    ['save the project file', ['ctrl', 's']],
    ['stop / close', ['esc']],
  ];
  return (
    <div class="modal">
      <h2>{t('keys')}</h2>
      <p class="lead">{t('everything acts on the clip under the amber playhead.')}</p>
      <div class="keys">
        {rows.map(([label, k]) => (
          <div>
            <span>{t(label)}</span>
            <K k={k} />
          </div>
        ))}
      </div>
      <div class="foot">
        <span class="left support">
          <a class="k" href={support('bug')} target="_blank" rel="noopener noreferrer">
            {t('report a bug')}
          </a>
          <a class="k" href={support('suggestion')} target="_blank" rel="noopener noreferrer">
            {t('suggest a feature')}
          </a>
        </span>
        <button class="k" onClick={() => s.openModal(null)}>
          {t('close')} <kbd>esc</kbd>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- transcribe

function TranscribeModal() {
  const s = useStore();
  const st = s.state.settings;
  const ai = s.state.ai;
  const p = s.state.project!;
  const [device, setDevice] = useState<string>(t('checking…'));
  useEffect(() => {
    void detectDevice().then((d) => setDevice(d.label));
  }, []);
  const busy = ai.status === 'loading' || ai.status === 'running';
  const withText = p.clips.filter((c) => c.text !== undefined).length;
  const hasScript = s.mine().length > 0;
  const model = MODELS[st.asrModel];

  return (
    <div class="modal">
      <h2>{t('transcribe')}</h2>
      <p class="lead">
        {t(
          'whisper runs on your gpu, inside this page. the model downloads once ({size}) and is cached; your audio never leaves the machine. afterwards every take is matched to one of your lines, empty takes go to the junk lane, takes with several reads are re-cut at the pauses, and the leftovers are re-cut by word: reads with no pause between them, false starts, and lines a pause split in two.',
          { size: model.size },
        )}
      </p>

      <div class="row">
        <label>
          {t('language')}
          <small>{t('what the takes are spoken in.')}</small>
        </label>
        <div class="val">
          <div class="seg">
            {(['spanish', 'english', 'auto'] as const).map((l) => (
              <button class={st.asrLanguage === l ? 'on' : ''} disabled={busy} onClick={() => s.updateSettings({ asrLanguage: l })}>
                {t(l)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class="row">
        <label>
          {t('model')}
          <small>{t('small is the safe choice for spanish; base is roughly three times faster.')}</small>
        </label>
        <div class="val">
          <div class="seg">
            {(['small', 'base'] as const).map((m) => (
              <button class={st.asrModel === m ? 'on' : ''} disabled={busy} onClick={() => s.updateSettings({ asrModel: m })}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class="row">
        <label>
          {t('runs on')}
          <small>{device}</small>
        </label>
        <div class="val">
          <span class="mono">{t('{n}/{total} transcribed', { n: withText, total: p.clips.length })}</span>
        </div>
      </div>

      {(busy || ai.status === 'done' || ai.status === 'cancelled' || ai.status === 'error') && (
        <div style={{ marginTop: 16 }}>
          <div class={ai.status === 'error' ? 'error' : 'muted'} style={{ marginBottom: 6 }}>
            {ai.message}
            {ai.status === 'running' ? ` · ${ai.done}/${ai.total}${ai.eta ? t(' · about {n} min left', { n: Math.ceil(ai.eta / 60) }) : ''}` : ''}
          </div>
          {busy && (
            <div class="bar">
              <i style={{ width: `${Math.round(ai.progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      <div class="foot">
        <span class="left">{hasScript ? t('you can keep sorting while it runs; the banner shows progress.') : t('paste the script first (t) so takes have lines to match.')}</span>
        <button class="k" onClick={() => s.openModal(null)}>
          {t('close')}
        </button>
        {busy ? (
          <button class="k" onClick={() => s.cancelTranscribe()}>
            {t('cancel')}
          </button>
        ) : (
          <>
            {withText > 0 && (
              <button class="k" disabled={!hasScript} title={t('use the stored transcripts; no gpu time')} onClick={() => s.realign()}>
                {t('re-match lines')}
              </button>
            )}
            {withText > 0 && (
              <button
                class="k"
                disabled={!hasScript}
                title={t('word timestamps on flagged takes: split reads with no pause, separate false starts, merge split lines')}
                onClick={() => void s.wordRecutNow()}
              >
                {t('re-cut by words')}
              </button>
            )}
            {withText > 0 && withText < p.clips.length && (
              <button class="k" disabled={!hasScript} onClick={() => void s.transcribe('missing')}>
                {t('only new takes')}
              </button>
            )}
            <button class="k amber" disabled={!hasScript} onClick={() => void s.transcribe('all')}>
              {withText ? t('transcribe all again') : t('transcribe all takes')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- goto line

function GotoModal() {
  const s = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const clip = s.clip();
  const [v, setV] = useState(String(clip ? s.ordinal(s.lineOf(clip)) ?? '' : ''));
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const apply = () => {
    const n = Number(v);
    if (Number.isFinite(n)) s.gotoOrdinal(Math.max(0, Math.floor(n)));
    s.openModal(null);
  };
  return (
    <div class="modal narrow">
      <h2>{t('your line number')}</h2>
      <p class="lead">{t('this clip and the ones after it. 0 removes the mark.')}</p>
      <input
        ref={ref}
        type="number"
        min={0}
        value={v}
        onInput={(e) => setV((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
      />
      <div class="foot">
        <button class="k" onClick={() => s.openModal(null)}>
          {t('cancel')}
        </button>
        <button class="k amber" onClick={apply}>
          {t('set line')} <kbd>enter</kbd>
        </button>
      </div>
    </div>
  );
}
