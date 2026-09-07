import { useEffect, useRef, useState } from 'preact/hooks';
import { buildZip, canSaveFolder, clipBlob, mergedBlob, saveBlob, saveToFolder, type Entry } from '../audio/export';
import { silenceBytes, wavHeader } from '../audio/wav';
import { TRASH, finalLane, laneClips } from '../state/project';
import { useStore } from '../state/store';
import { MODELS, detectDevice } from '../ai/transcriber';
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

  return (
    <div class="modal">
      <h2>settings</h2>
      <p class="lead">saved in this browser. detection changes apply when you press re-detect.</p>

      <h3>detection</h3>
      <div class="row">
        <label>
          silence threshold
          <small>
            quieter than this is silence.{an ? ` this file: floor ≈ ${an.floor.toFixed(0)} db, peak ≈ ${an.peak.toFixed(0)} db.` : ''}
          </small>
        </label>
        <div class="val">
          <input type="range" min={-80} max={-10} step={1} value={st.threshold} onInput={(e) => s.updateSettings({ threshold: num(e) })} />
          <span class="mono">{st.threshold} db</span>
        </div>
      </div>
      <div class="row">
        <label>
          minimum silence
          <small>shorter pauses stay inside a take.</small>
        </label>
        <div class="val">
          <input type="range" min={0.1} max={4} step={0.1} value={st.minSilence} onInput={(e) => s.updateSettings({ minSilence: num(e) })} />
          <span class="mono">{st.minSilence.toFixed(1)} s</span>
        </div>
      </div>
      <div class="row">
        <label>
          margin
          <small>room tone kept on each side of a take.</small>
        </label>
        <div class="val">
          <input type="range" min={0} max={1} step={0.05} value={st.margin} onInput={(e) => s.updateSettings({ margin: num(e) })} />
          <span class="mono">{st.margin.toFixed(2)} s</span>
        </div>
      </div>
      <div class="row">
        <label>
          fade at cuts
          <small>tiny fade so edits never click. 0 = hard cuts.</small>
        </label>
        <div class="val">
          <input type="range" min={0} max={30} step={1} value={st.fadeMs} onInput={(e) => s.updateSettings({ fadeMs: num(e) })} />
          <span class="mono">{st.fadeMs} ms</span>
        </div>
      </div>
      {ready && (
        <div class="row">
          <label>
            re-detect with these settings
            <small>
              {preview} takes with these settings · {current} now. unchanged clips keep their lane and line.
            </small>
          </label>
          <div class="val">
            <button class="k amber" onClick={() => s.redetect()} disabled={preview === current}>
              re-detect
            </button>
          </div>
        </div>
      )}

      <h3>listening</h3>
      <div class="row">
        <label>
          monitor gain
          <small>
            for quiet takes. never touches exports. <kbd>=</kbd> and <kbd>-</kbd> while listening.
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
          slow-motion speed
          <small>tape-style: pitch drops with speed.</small>
        </label>
        <div class="val">
          <input type="range" min={0.25} max={0.9} step={0.05} value={st.slowRate} onInput={(e) => s.updateSettings({ slowRate: num(e) })} />
          <span class="mono">{st.slowRate.toFixed(2)}×</span>
        </div>
      </div>
      <div class="row">
        <label>
          slow motion on <kbd>↑</kbd>
          <small>replay the previous clip at the slow speed. <kbd>shift space</kbd> always does.</small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.slowOnPrev} onChange={(e) => s.updateSettings({ slowOnPrev: (e.target as HTMLInputElement).checked })} />
        </div>
      </div>
      <div class="row">
        <label>
          autoplay
          <small>continue to the next clip when one finishes.</small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.autoplay} onChange={(e) => s.updateSettings({ autoplay: (e.target as HTMLInputElement).checked })} />
        </div>
      </div>

      <h3>transcription</h3>
      <div class="row">
        <label>
          empty takes go to junk
          <small>breaths, slates and false starts with no words move to the junk lane for a quick review.</small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.autoJunk} onChange={(e) => s.updateSettings({ autoJunk: (e.target as HTMLInputElement).checked })} />
        </div>
      </div>
      <div class="row">
        <label>
          re-cut takes with several reads
          <small>a take that repeats its line is cut at the pauses inside it and the pieces transcribed.</small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.autoSplit} onChange={(e) => s.updateSettings({ autoSplit: (e.target as HTMLInputElement).checked })} />
        </div>
      </div>

      <h3>editing</h3>
      <div class="row">
        <label>
          frame step
          <small>one frame. alt steps a tenth of it.</small>
        </label>
        <div class="val">
          <input type="range" min={1} max={100} step={1} value={st.stepMs} onInput={(e) => s.updateSettings({ stepMs: num(e) })} />
          <span class="mono">{st.stepMs} ms</span>
        </div>
      </div>
      <div class="row">
        <label>
          arrows move fast
          <small>
            <kbd>←</kbd> <kbd>→</kbd> jump ten frames; <kbd>shift</kbd> steps one frame, precise. off swaps them.
          </small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.fastArrows} onChange={(e) => s.updateSettings({ fastArrows: (e.target as HTMLInputElement).checked })} />
        </div>
      </div>
      <div class="row">
        <label>
          split stays on the first half
          <small>
            after <kbd>s</kbd>, review the part before the cut. off moves on to the part after it. <kbd>shift s</kbd> does the opposite of
            this setting for one split.
          </small>
        </label>
        <div class="val">
          <input
            type="checkbox"
            checked={st.splitStaysOnFirst}
            onChange={(e) => s.updateSettings({ splitStaysOnFirst: (e.target as HTMLInputElement).checked })}
          />
        </div>
      </div>
      <div class="row">
        <label>
          context around a clip
          <small>audio shown before and after, so you can extend a cut.</small>
        </label>
        <div class="val">
          <input type="range" min={0.5} max={5} step={0.25} value={st.contextSeconds} onInput={(e) => s.updateSettings({ contextSeconds: num(e) })} />
          <span class="mono">{st.contextSeconds.toFixed(2)} s</span>
        </div>
      </div>

      <h3>lanes & look</h3>
      <div class="row">
        <label>
          lane names
          <small>comma-separated. first is the inbox, last is final. keys 1–9 send clips to them.</small>
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
        <label>theme</label>
        <div class="val">
          <div class="seg">
            {(['auto', 'dark', 'light'] as const).map((t) => (
              <button class={st.theme === t ? 'on' : ''} onClick={() => s.updateSettings({ theme: t })}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div class="foot">
        <button class="k" onClick={() => s.openModal(null)}>
          close <kbd>esc</kbd>
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

  const clips = laneClips(p, lane);
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
        setBusy('building merged file…');
        const blob = await mergedBlob(src, clips.map((c) => [c.start, c.end]), fade, Math.round(gap * src.sampleRate), setProgress);
        setBusy('saving…');
        if (await saveBlob(blob, `${prefix}_${slug}.wav`)) setDone('merged file saved.');
      } else if (mode === 'zip') {
        setBusy('preparing clips…');
        const e = await entries(setProgress);
        setBusy('packing zip…');
        const blob = await buildZip(e, setProgress);
        setBusy('saving…');
        if (await saveBlob(blob, `${prefix}_${slug}.zip`)) setDone(`${e.length} clips zipped.`);
      } else {
        setBusy('preparing clips…');
        const e = await entries(setProgress);
        setBusy('writing files…');
        const n = await saveToFolder(e, setProgress);
        if (n !== null) setDone(`${n} files written.`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div class="modal">
      <h2>export</h2>
      <p class="lead">clips are numbered in recording order, so sorting by name keeps them chronological.</p>

      <div class="row">
        <label>lane</label>
        <div class="val">
          <select value={lane} onChange={(e) => setLane(Number((e.target as HTMLSelectElement).value))}>
            {p.laneNames.map((n, i) => (
              <option value={i}>{n.toLowerCase()}</option>
            ))}
            <option value={-2}>junk</option>
            <option value={TRASH}>trash</option>
          </select>
        </div>
      </div>
      <div class="row">
        <label>
          format
          <small>
            {clips.length} clips · {fmtDur(total)}
            {st.spacers && gaps > 0 && mode !== 'merged' ? ` · ${gaps} gap${gaps === 1 ? '' : 's'} · ${fmtDur(gapSeconds)} of silence` : ''}
          </small>
        </label>
        <div class="val">
          <div class="seg">
            {canSaveFolder && (
              <button class={mode === 'folder' ? 'on' : ''} onClick={() => setMode('folder')}>
                folder
              </button>
            )}
            <button class={mode === 'zip' ? 'on' : ''} onClick={() => setMode('zip')}>
              zip
            </button>
            <button class={mode === 'merged' ? 'on' : ''} onClick={() => setMode('merged')}>
              one file
            </button>
          </div>
        </div>
      </div>
      <div class="row">
        <label>file name prefix</label>
        <div class="val">
          <input type="text" value={prefix} onInput={(e) => setPrefix((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      {mode === 'merged' && (
        <div class="row">
          <label>
            gap between clips
            <small>silence inserted between takes in the merged file.</small>
          </label>
          <div class="val">
            <input type="range" min={0} max={3} step={0.1} value={gap} onInput={(e) => setGap(Number((e.target as HTMLInputElement).value))} />
            <span class="mono">{gap.toFixed(1)} s</span>
          </div>
        </div>
      )}

      <h3>project file</h3>
      <div class="row">
        <label>
          lanes, cuts, line marks and script
          <small>
            saved in this browser automatically, but a file is safer: keep it next to the wav and drop it on the landing page to pick up
            where you left off. <kbd>ctrl s</kbd> anywhere.
          </small>
        </label>
        <div class="val">
          <button class="k" onClick={() => void s.saveProjectFile()}>
            save project
          </button>
        </div>
      </div>

      {mode !== 'merged' && (
        <>
          <div class="row">
            <label>
              silent gaps between takes
              <small>tiny silent wav files, numbered to sort in place, so the folder drops into the daw with the spacing already there.</small>
            </label>
            <div class="val">
              <input type="checkbox" checked={st.spacers} onChange={(e) => s.updateSettings({ spacers: (e.target as HTMLInputElement).checked })} />
            </div>
          </div>
          {st.spacers && (
            <div class="row">
              <label>
                after every take / between lines
                <small>seconds. the longer gap is used when the next take is a different line.</small>
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

      <h3>into fl studio</h3>
      <div class="tips">
        <b>1.</b> in the browser, sort the folder <b>by name</b> and select every file.
        <br />
        <b>2.</b> hold <b>shift</b> while dropping them onto the playlist; they land on one track, in order.
        <br />
        <b>3.</b> turn on <b>ripple edit</b> so deleting a clip closes the gap.
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
        <span class="left">{done ?? (mode === 'folder' ? 'pick a folder; files are written directly into it.' : '')}</span>
        <button class="k" onClick={() => s.openModal(null)}>
          close
        </button>
        <button class="k amber" onClick={() => void run()} disabled={!!busy || !clips.length}>
          {mode === 'folder' ? 'save to folder' : mode === 'zip' ? 'download zip' : 'save file'}
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
  const rows: Array<[string, string[]]> = [
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
      <h2>keys</h2>
      <p class="lead">everything acts on the clip under the amber playhead.</p>
      <div class="keys">
        {rows.map(([label, k]) => (
          <div>
            <span>{label}</span>
            <K k={k} />
          </div>
        ))}
      </div>
      <div class="foot">
        <button class="k" onClick={() => s.openModal(null)}>
          close <kbd>esc</kbd>
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
  const [device, setDevice] = useState<string>('checking…');
  useEffect(() => {
    void detectDevice().then((d) => setDevice(d.label));
  }, []);
  const busy = ai.status === 'loading' || ai.status === 'running';
  const withText = p.clips.filter((c) => c.text !== undefined).length;
  const hasScript = s.mine().length > 0;
  const model = MODELS[st.asrModel];

  return (
    <div class="modal">
      <h2>transcribe</h2>
      <p class="lead">
        whisper runs on your gpu, inside this page. the model downloads once ({model.size}) and is cached; your audio never leaves the
        machine. afterwards every take is matched to one of your lines, empty takes go to the junk lane, takes with several reads are
        re-cut at the pauses, and the leftovers are re-cut by word: reads with no pause between them, false starts, and lines a pause
        split in two.
      </p>

      <div class="row">
        <label>
          language
          <small>what the takes are spoken in.</small>
        </label>
        <div class="val">
          <div class="seg">
            {(['spanish', 'english', 'auto'] as const).map((l) => (
              <button class={st.asrLanguage === l ? 'on' : ''} disabled={busy} onClick={() => s.updateSettings({ asrLanguage: l })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class="row">
        <label>
          model
          <small>small is the safe choice for spanish; base is roughly three times faster.</small>
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
          runs on
          <small>{device}</small>
        </label>
        <div class="val">
          <span class="mono">
            {withText}/{p.clips.length} transcribed
          </span>
        </div>
      </div>

      {(busy || ai.status === 'done' || ai.status === 'cancelled' || ai.status === 'error') && (
        <div style={{ marginTop: 16 }}>
          <div class={ai.status === 'error' ? 'error' : 'muted'} style={{ marginBottom: 6 }}>
            {ai.message}
            {ai.status === 'running' ? ` · ${ai.done}/${ai.total}${ai.eta ? ` · about ${Math.ceil(ai.eta / 60)} min left` : ''}` : ''}
          </div>
          {busy && (
            <div class="bar">
              <i style={{ width: `${Math.round(ai.progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      <div class="foot">
        <span class="left">{hasScript ? 'you can keep sorting while it runs; the banner shows progress.' : 'paste the script first (t) so takes have lines to match.'}</span>
        <button class="k" onClick={() => s.openModal(null)}>
          close
        </button>
        {busy ? (
          <button class="k" onClick={() => s.cancelTranscribe()}>
            cancel
          </button>
        ) : (
          <>
            {withText > 0 && (
              <button class="k" disabled={!hasScript} title="use the stored transcripts; no gpu time" onClick={() => s.realign()}>
                re-match lines
              </button>
            )}
            {withText > 0 && (
              <button class="k" disabled={!hasScript} title="word timestamps on flagged takes: split reads with no pause, separate false starts, merge split lines" onClick={() => void s.wordRecutNow()}>
                re-cut by words
              </button>
            )}
            {withText > 0 && withText < p.clips.length && (
              <button class="k" disabled={!hasScript} onClick={() => void s.transcribe('missing')}>
                only new takes
              </button>
            )}
            <button class="k amber" disabled={!hasScript} onClick={() => void s.transcribe('all')}>
              {withText ? 'transcribe all again' : 'transcribe all takes'}
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
      <h2>your line number</h2>
      <p class="lead">this clip and the ones after it. 0 removes the mark.</p>
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
          cancel
        </button>
        <button class="k amber" onClick={apply}>
          set line <kbd>enter</kbd>
        </button>
      </div>
    </div>
  );
}
