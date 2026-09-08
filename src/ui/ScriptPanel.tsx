import { useEffect, useRef } from 'preact/hooks';
import { characters } from '../state/project';
import { useStore } from '../state/store';
import { T, laneLabel, t } from '../i18n';

export function ScriptPanel() {
  const s = useStore();
  const { project: p, scriptEditing, lineMode, lineFilter, showContext } = s.state;
  const ta = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  if (!p) return null;

  const all = s.script();
  const mine = s.mine();
  const chars = characters(all);
  const hasChars = chars.length > 0;
  const clip = s.clip();
  const current = clip ? s.lineOf(clip) : undefined;
  const editing = scriptEditing;
  const counts = s.lineCounts();
  const ordinalOf = new Map(mine.map((l, i) => [l.n, i + 1]));
  const shown = showContext ? all : mine;
  const focusLine = lineMode ? lineFilter : current;

  useEffect(() => {
    if (editing) ta.current?.focus();
    else ta.current?.blur();
  }, [editing]);

  useEffect(() => {
    if (!focusLine || editing) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-n="${focusLine}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusLine, editing]);

  return (
    <aside class="script">
      <div class="head">
        <span>{t('script')}</span>
        <div class="tools">
          {!editing && hasChars && (
            <select
              class="who"
              title={t('your character')}
              value={p.character ?? ''}
              onChange={(e) => s.setCharacter((e.target as HTMLSelectElement).value || null)}
            >
              <option value="">{t('all spoken')}</option>
              {chars.map((c) => (
                <option value={c.name}>
                  {c.name.toLowerCase()} · {c.count}
                </option>
              ))}
            </select>
          )}
          {!editing && hasChars && (
            <button class={`k${showContext ? ' amber' : ''}`} onClick={() => s.toggleContext()} title={t('show every row, not only your lines')}>
              {t('cues')}
            </button>
          )}
          {!editing && all.length > 0 && (
            <button class="k" onClick={() => s.openModal('transcribe')} title={t('transcribe takes and match them to lines')}>
              <kbd>w</kbd>
            </button>
          )}
          {editing ? (
            <button class="k" onClick={() => s.setScriptEditing(false)}>
              {t('done')} <kbd>esc</kbd>
            </button>
          ) : (
            <button class="k" onClick={() => s.setScriptEditing(true)}>
              {t('edit')} <kbd>t</kbd>
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <textarea
          ref={ta}
          placeholder={t(
            'paste the whole script here.\n\nrows like "mart: text" are spoken lines and the names become characters you can pick; other rows are directions. no names at all? every row counts as yours.\n\nthen press l on the first take of each of your lines while you listen.',
          )}
          value={p.script}
          onInput={(e) => s.setScript((e.target as HTMLTextAreaElement).value)}
        />
      ) : all.length === 0 ? (
        <div class="placeholder">
          <T k="no script yet. press [[t]] to paste one." />
          <br />
          <br />
          <T k="rows like **mart: text** become your lines once you pick the character. while listening, press [[l]] on the first take of each line; every clip after it inherits that line. [[[]] [[]]] fix a take you went back for." />
        </div>
      ) : (
        <div class="lines" ref={listRef}>
          {hasChars && !p.character && <div class="placeholder small">{t('pick your character above · until then every spoken line counts as yours')}</div>}
          {shown.map((l) => {
            const ord = ordinalOf.get(l.n);
            const c = counts.get(l.n);
            const total = c ? c.reduce((a, b) => a + b, 0) : 0;
            const cls = [
              'line',
              ord ? '' : 'other',
              current === l.n ? 'current' : '',
              lineMode && lineFilter === l.n ? 'filter' : '',
              ord && !total ? 'zero' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                class={cls}
                data-n={l.n}
                title={ord ? (lineMode && lineFilter === l.n ? t('click: back to the whole lane') : t("click: only this line's takes · shift+click: give the current take this line")) : undefined}
                onClick={(e) => {
                  if (!ord) return;
                  if (e.shiftKey) return s.setLine(l.n);
                  if (lineMode && lineFilter === l.n) return s.toggleLineMode(); // the selected line again: back to the whole lane
                  s.selectLine(l.n, { play: true });
                }}
              >
                <span class="n">{ord ?? ''}</span>
                <span class="t">
                  {!ord && l.character ? <b>{l.character.toLowerCase()}: </b> : null}
                  {l.text}
                </span>
                {ord ? (
                  <span class="c" title={t('takes per lane')}>
                    {c
                      ? c
                          .slice(0, -2)
                          .map((k, i) => {
                            if (!k) return '';
                            if (i === 0) return String(k); // unsorted: bare count
                            const name = laneLabel(p.laneNames[i]);
                            const abbr = /^(?:pass|pasada)\s*(\d+)$/.test(name) ? name.replace(/^(?:pass|pasada)\s*/, 'p') : name.slice(0, 1);
                            return `${abbr}:${k}`; // p1:4 = four takes in pass 1, f:1 = one in final
                          })
                          .filter(Boolean)
                          .join(' ') || '·'
                      : '·'}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
