import { useStore } from '../state/store';

interface ToolProps {
  k: string;
  label: string;
  on: () => void;
  off?: boolean;
  amber?: boolean;
  title?: string;
}

/** A clickable [key] label. Mousedown is cancelled so focus stays put and shortcuts keep working. */
function Tool({ k, label, on, off, amber, title }: ToolProps) {
  return (
    <button class={`tool${amber ? ' amber' : ''}`} disabled={off} title={title ?? label} onMouseDown={(e) => e.preventDefault()} onClick={on}>
      <kbd class={amber ? 'amber' : ''}>{k}</kbd>
      {label}
    </button>
  );
}

const Sep = () => <span class="sep">|</span>;

/** Every keyboard action, as a button. Same order and wording as the key reference. */
export function Toolbar() {
  const s = useStore();
  const { project: p, source: src, playing, settings } = s.state;
  if (!p || !src) return null;
  const clip = s.clip();
  const none = !clip;
  const step = Math.max(1, Math.round((settings.stepMs / 1000) * src.sampleRate)) * (settings.fastArrows ? 10 : 1);

  return (
    <div class="hints">
      <Tool k="space" label={playing ? 'pause' : 'play'} on={() => s.togglePlay()} off={none} />
      <Tool k="⇧space" label="slow" title="play clip from its start in slow motion" on={() => clip && void s.playFrom(clip.start, true)} off={none} />
      <Tool k="↑" label="prev" title="previous clip" on={() => s.move(-1, { play: true, slow: settings.slowOnPrev })} />
      <Tool k="↓" label="next" on={() => s.move(1, { play: true })} />
      <Tool k="←" label="" title="move back" on={() => s.step(-step)} off={none} />
      <Tool k="→" label="move" title="move forward" on={() => s.step(step)} off={none} />
      <Sep />
      <Tool k="enter" label="promote" title="move to the next lane" on={() => s.promote()} off={none} amber />
      <Tool k="⇧enter" label="demote" title="move down one lane" on={() => s.demote()} off={none} />
      <Tool k="⌫" label="trash" on={() => s.trash()} off={none} />
      {p.laneNames.slice(1).map((name, i) => (
        <Tool k={String(i + 1)} label={name.toLowerCase()} title={`send to ${name}`} on={() => s.sendToLane(i + 1)} off={none} />
      ))}
      <Sep />
      <Tool k="s" label="split" title="split at the playhead" on={() => s.split()} off={none} />
      <Tool k="⇧s" label="" title="split, land on the other half" on={() => s.split(true)} off={none} />
      <Tool k="m" label="merge" title="merge with the next clip" on={() => s.mergeNext()} off={none} />
      <Tool k="⇧m" label="merge prev" title="merge with the previous clip" on={() => s.mergePrev()} off={none} />
      <Tool k="i" label="in" title="set clip start at the playhead" on={() => s.setIn()} off={none} />
      <Tool k="o" label="out" title="set clip end at the playhead" on={() => s.setOut()} off={none} />
      <Tool k="l" label="line" title="next script line starts here" on={() => s.markLine()} off={none} />
      <Tool k="⇧l" label="line №" title="jump to a line number" on={() => s.openModal('goto')} off={none} />
      <Sep />
      <Tool k="ctrl z" label="undo" on={() => s.undo()} />
      <Tool k="ctrl ⇧z" label="redo" on={() => s.redo()} />
      <Tool k="-" label="" title="monitor gain down" on={() => s.setGain(settings.gainDb - 3)} />
      <Tool k="=" label="gain" title="monitor gain up" on={() => s.setGain(settings.gainDb + 3)} />
      <Tool k="a" label={settings.autoplay ? 'autoplay on' : 'autoplay off'} title="toggle autoplay" on={() => s.toggleAutoplay()} />
      <Tool k="?" label="all keys" on={() => s.openModal('help')} />
    </div>
  );
}
