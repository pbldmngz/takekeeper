import { useEffect, useRef, useState } from 'preact/hooks';
import { buildZip, canSaveFolder, clipBlob, mergedBlob, saveBlob, saveToFolder, type Entry } from '../audio/export';
import { TRASH, finalLane, laneClips } from '../state/project';
import { useStore } from '../state/store';
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
          autoplay
          <small>continue to the next clip when one finishes.</small>
        </label>
        <div class="val">
          <input type="checkbox" checked={st.autoplay} onChange={(e) => s.updateSettings({ autoplay: (e.target as HTMLInputElement).checked })} />
        </div>
      </div>

      <h3>editing</h3>
      <div class="row">
        <label>
          frame step
          <small>← → move this much. shift ×10, alt ÷10.</small>
        </label>
        <div class="val">
          <input type="range" min={1} max={100} step={1} value={st.stepMs} onInput={(e) => s.updateSettings({ stepMs: num(e) })} />
          <span class="mono">{st.stepMs} ms</span>
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
  const lines = clips.map((c) => s.lineOf(c));
  const width = Math.max(2, String(clips.length).length);
  const slug = s.laneName(lane).toLowerCase().replace(/\s+/g, '-');

  const entries = async (onProgress: (p: number) => void): Promise<Entry[]> => {
    const out: Entry[] = [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const ln = lines[i];
      const name = `${prefix}_${pad(i + 1, width)}${ln ? `_line${pad(ln, 3)}` : ''}.wav`;
      out.push({ name, blob: await clipBlob(src, c.start, c.end, fade) });
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
            <option value={TRASH}>trash</option>
          </select>
        </div>
      </div>
      <div class="row">
        <label>
          format
          <small>
            {clips.length} clips · {fmtDur(total)}
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
    ['previous clip (plays slow)', ['↑']],
    ['next clip', ['↓']],
    ['step one frame', ['←', '→']],
    ['step ×10 / ÷10', ['shift', 'alt']],
    ['clip start / end', ['home', 'end']],
    ['toggle autoplay', ['a']],
    ['monitor gain up / down', ['=', '-']],
    ['promote to next lane', ['enter']],
    ['demote one lane', ['shift', 'enter']],
    ['trash', ['⌫']],
    ['send to lane n', ['0', '…', '9']],
    ['split at playhead', ['s']],
    ['merge with next / previous', ['m', 'shift m']],
    ['set clip start / end here', ['i', 'o']],
    ['undo / redo', ['ctrl z', 'ctrl shift z']],
    ['next script line starts here', ['l']],
    ['jump to line number', ['shift', 'l']],
    ['edit script', ['t']],
    ['switch lane', ['tab', 'shift tab']],
    ['export', ['e']],
    ['settings', [',']],
    ['open a file', ['ctrl', 'o']],
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

// ---------------------------------------------------------------- goto line

function GotoModal() {
  const s = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const clip = s.clip();
  const [v, setV] = useState(String(clip ? s.lineOf(clip) ?? '' : ''));
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const apply = () => {
    const n = Number(v);
    if (Number.isFinite(n)) s.setLine(Math.max(0, Math.floor(n)));
    s.openModal(null);
  };
  return (
    <div class="modal narrow">
      <h2>line number</h2>
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
