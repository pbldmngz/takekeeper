import { useStore } from '../state/store';
import { laneLabel, t } from '../i18n';

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
  const { project: p, source: src, playing, settings, lineMode, loop } = s.state;
  if (!p || !src) return null;
  const clip = s.clip();
  const none = !clip;
  const step = Math.max(1, Math.round((settings.stepMs / 1000) * src.sampleRate)) * (settings.fastArrows ? 10 : 1);

  return (
    <div class="hints">
      <Tool k="space" label={playing ? t('pause') : t('play')} on={() => s.togglePlay()} off={none} />
      <Tool k="⇧space" label={t('slow')} title={t('play clip from its start in slow motion')} on={() => clip && void s.playFrom(clip.start, true)} off={none} />
      <Tool k="↑" label={t('prev')} title={t('previous clip')} on={() => s.move(-1, { play: true, slow: settings.slowOnPrev })} />
      <Tool k="↓" label={t('next')} on={() => s.move(1, { play: true })} />
      <Tool k="←" label="" title={t('move back')} on={() => s.step(-step)} off={none} />
      <Tool k="→" label={t('move')} title={t('move forward')} on={() => s.step(step)} off={none} />
      <Sep />
      <Tool k="enter" label={t('promote')} title={t('move to the next lane')} on={() => s.promote()} off={none} amber />
      <Tool k="⇧enter" label={t('demote')} title={t('move down one lane')} on={() => s.demote()} off={none} />
      <Tool k="⌫" label={t('trash')} on={() => s.trash()} off={none} />
      {p.laneNames.slice(1).map((name, i) => (
        <Tool k={String(i + 1)} label={laneLabel(name)} title={t('send to {lane}', { lane: laneLabel(name) })} on={() => s.sendToLane(i + 1)} off={none} />
      ))}
      <Sep />
      <Tool k="s" label={t('split')} title={t('split at the playhead')} on={() => s.split()} off={none} />
      <Tool k="⇧s" label="" title={t('split, land on the other half')} on={() => s.split(true)} off={none} />
      <Tool k="m" label={t('merge')} title={t('merge with the next clip')} on={() => s.mergeNext()} off={none} />
      <Tool k="⇧m" label={t('merge prev')} title={t('merge with the previous clip')} on={() => s.mergePrev()} off={none} />
      <Tool k="i" label={t('in')} title={t('set clip start at the playhead')} on={() => s.setIn()} off={none} />
      <Tool k="o" label={t('out')} title={t('set clip end at the playhead')} on={() => s.setOut()} off={none} />
      <Tool k="l" label={t('line')} title={t('continue the script: the line after the furthest one so far')} on={() => s.continueScript()} off={none} />
      <Tool k="[" label="" title={t('this clip: one line back')} on={() => s.stepLine(-1)} off={none} />
      <Tool k="]" label={t('line ±')} title={t('this clip: one line forward')} on={() => s.stepLine(1)} off={none} />
      <Tool k="⇧l" label={t('line №')} title={t('jump to a line number')} on={() => s.openModal('goto')} off={none} />
      <Tool k="g" label={lineMode ? t('all clips') : t('by line')} title={t('line mode: one script line at a time')} on={() => s.toggleLineMode()} />
      <Tool k="w" label={t('transcribe')} title={t('whisper in the browser: transcribe takes and match them to lines')} on={() => s.openModal('transcribe')} />
      <Tool k="u" label="" title={t('next take with a doubtful line match')} on={() => s.nextUncertain()} />
      {lineMode && <Tool k="⇧↑" label="" title={t('previous line')} on={() => s.moveLine(-1)} />}
      {lineMode && <Tool k="⇧↓" label={t('line')} title={t('next line')} on={() => s.moveLine(1)} />}
      <Sep />
      <Tool k="ctrl z" label={t('undo')} on={() => s.undo()} />
      <Tool k="ctrl ⇧z" label={t('redo')} on={() => s.redo()} />
      <Tool k="-" label="" title={t('monitor gain down')} on={() => s.setGain(settings.gainDb - 3)} />
      <Tool k="=" label={t('gain')} title={t('monitor gain up')} on={() => s.setGain(settings.gainDb + 3)} />
      <Tool k="r" label={loop ? t('loop on') : t('loop')} title={t('repeat the current take until turned off')} on={() => s.toggleLoop()} off={none} amber={loop} />
      <Tool k="a" label={settings.autoplay ? t('autoplay on') : t('autoplay off')} title={t('toggle autoplay')} on={() => s.toggleAutoplay()} />
      <Tool k="?" label={t('all keys')} on={() => s.openModal('help')} />
    </div>
  );
}
