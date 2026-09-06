import { useEffect, useRef } from 'preact/hooks';
import { scriptLines } from '../state/project';
import { useStore } from '../state/store';

export function ScriptPanel() {
  const s = useStore();
  const { project: p, scriptEditing } = s.state;
  const ta = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  if (!p) return null;
  const lines = scriptLines(p.script);
  const clip = s.clip();
  const current = clip ? s.lineOf(clip) : undefined;
  const editing = scriptEditing;

  useEffect(() => {
    if (editing) ta.current?.focus();
    else ta.current?.blur();
  }, [editing]);

  useEffect(() => {
    if (!current || editing) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-n="${current}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [current, editing]);

  return (
    <aside class="script">
      <div class="head">
        <span>script</span>
        {editing ? (
          <button class="k" onClick={() => s.setScriptEditing(false)}>
            done <kbd>esc</kbd>
          </button>
        ) : (
          <button class="k" onClick={() => s.setScriptEditing(true)}>
            edit <kbd>t</kbd>
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          ref={ta}
          placeholder={'paste your script here, one line per line.\n\nthen press l on the first take of each line while you listen - every clip after it inherits the line until the next mark. shift+l jumps to a specific line number.'}
          value={p.script}
          onInput={(e) => s.setScript((e.target as HTMLTextAreaElement).value)}
        />
      ) : lines.length === 0 ? (
        <div class="placeholder">
          no script yet. press <kbd>t</kbd> to paste one, one line per line.
          <br />
          <br />
          while listening, press <kbd>l</kbd> on the first take of each line — every clip after it inherits that line until the next mark.
        </div>
      ) : (
        <div class="lines" ref={listRef}>
          {lines.map((text, i) => (
            <div class={`line${current === i + 1 ? ' current' : ''}`} data-n={i + 1} onClick={() => s.setLine(i + 1)}>
              <span class="n">{i + 1}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
