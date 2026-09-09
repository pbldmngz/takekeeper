import { useState } from 'preact/hooks';
import { useStore } from '../state/store';
import { T, lang, t } from '../i18n';
import { support } from '../links';
import { Logo } from './Logo';

/** [es] on the English page, [en] on the Spanish one; amber when the browser prefers the other language. */
export function LangSwitch() {
  const s = useStore();
  const other = lang() === 'es' ? 'en' : 'es';
  const nudge = s.state.settings.lang === 'auto' && navigator.language.toLowerCase().startsWith(other);
  return (
    <button class={`k${nudge ? ' amber' : ''}`} onClick={() => s.switchLanguage(other)} title={other === 'es' ? t('switch to spanish') : t('switch to english')}>
      {other}
    </button>
  );
}

export function Empty() {
  const s = useStore();
  const { phase, progress, status, error, sessions } = s.state;
  const [over, setOver] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null); // key of the row asking "are you sure?"

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
          <LangSwitch />
          <button class="k" onClick={() => s.openModal('settings')}>
            {t('settings')} <kbd>,</kbd>
          </button>
          <button class="k" onClick={() => s.openModal('help')}>
            {t('keys')} <kbd>?</kbd>
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
          <p class="eyebrow">{t('for voice actors and narrators. it is free.')}</p>
          <h1>
            <span>{t('one session in, a folder of takes out.')}</span>
            <span>{t('split at the silences, keep the best.')}</span>
          </h1>
          <p class="lead">{t('each take is cut at the silence around it, transcribed and filed under its script line. you keep the ones you want with one key.')}</p>

          <button
            type="button"
            class={`drop${over ? ' over' : ''}`}
            onClick={() => void s.pickFile()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <span class="big">{t('drop your session wav here')}</span>
            <span class="muted">
              <T k="or press [[ctrl o]] to browse · any length · nothing leaves your computer" />
            </span>
          </button>

          {sessions.length > 0 && (
            <div class="sessions">
              <p class="back">{t('coming back to one? drop the .takekeeper.json you saved, then its wav')}</p>
              {sessions.map((r) => {
                const asking = confirm === r.key;
                return (
                  <p class="resume" key={r.key}>
                    <span class="dim">&gt;</span> {asking ? t('forget the sorting for') : t('continue')} <b>{r.name}</b>
                    {asking && <span class="dim">{t('? the recording stays where it is')}</span>}
                    <span class="actions">
                      {asking ? (
                        <>
                          <button class="k" onClick={() => setConfirm(null)}>
                            {t('keep')}
                          </button>
                          <button
                            class="k amber"
                            onClick={() => {
                              void s.discard(r.key);
                              setConfirm(null);
                            }}
                          >
                            {t('yes, discard')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button class="k amber" onClick={() => void s.resume(r.key)}>
                            {t('resume')}
                          </button>
                          <button class="k muted" onClick={() => setConfirm(r.key)} title={t('forget the saved sorting for this file')}>
                            {t('discard')}
                          </button>
                        </>
                      )}
                    </span>
                  </p>
                );
              })}
            </div>
          )}
          {error && (
            <div class="error">
              <span>{error}</span>
              <span class="actions">
                <a class="k" href={support('bug')} target="_blank" rel="noopener noreferrer">
                  {t('report a bug')}
                </a>
                <button class="k" onClick={() => s.clearError()}>
                  {t('dismiss')}
                </button>
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
