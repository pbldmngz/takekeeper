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
          <h1>the takes worth keeping.</h1>
          <p class="lead">split a voice-over session at the silences, sort the takes with the keyboard, export the keepers.</p>

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
            <span class="big">drop a wav here</span>
            <span class="muted">
              or press <kbd>ctrl o</kbd> to browse · nothing is uploaded
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
