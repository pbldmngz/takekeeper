import { useState } from 'preact/hooks';
import { useStore } from '../state/store';
import { Logo } from './Logo';

export function Empty() {
  const s = useStore();
  const { phase, progress, status, error, resumable } = s.state;
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) void s.openFile(f);
  };

  return (
    <div class="landing-top">
      <header class="top">
        <Logo />
        <div class="actions">
          <button class="k" onClick={() => s.openModal('settings')}>
            settings <kbd>,</kbd>
          </button>
          <button class="k" onClick={() => s.openModal('help')}>
            keys <kbd>?</kbd>
          </button>
        </div>
      </header>

      {phase === 'loading' ? (
        <div class="loading">
          <p class="muted">
            <span class="dim">&gt;</span> {status.toLowerCase()} {progress !== null ? `${Math.round(progress * 100)}%` : ''}
          </p>
          <div class="bar">
            <i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        </div>
      ) : (
        <section class="hero">
          <p class="eyebrow">for voice actors</p>
          <h1>split a recording session into takes. keep the good ones.</h1>
          <p class="lead">
            drop the one long wav from your session. takekeeper cuts it at every silence, plays the takes back to back, and you
            promote or trash each one with a single key, then export the keepers as numbered files for fl studio, reaper or any daw.
          </p>

          <div
            class={`drop${over ? ' over' : ''}`}
            onClick={() => void s.pickFile()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <span class="big">drop your session wav here</span>
            <span class="muted">
              or press <kbd>ctrl o</kbd> to browse · any length · nothing is uploaded
            </span>
            <span class="dim">
              a saved <b>.takekeeper.json</b> project can be dropped here too, then its wav
            </span>
          </div>

          {resumable && (
            <p class="resume">
              <span class="dim">&gt;</span> continue <b>{resumable.name}</b>
              <button class="k amber" onClick={() => void s.resume()}>
                resume
              </button>
            </p>
          )}
          {error && (
            <div class="error">
              <span>{error}</span>
              <button class="k" onClick={() => s.clearError()}>
                dismiss
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
