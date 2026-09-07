import { store } from './store';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export function installKeys() {
  window.addEventListener('keydown', (e) => {
    const s = store.state;
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      if (s.modal) store.openModal(null);
      else if (s.scriptEditing) store.setScriptEditing(false);
      else if (s.playing) store.togglePlay();
      (document.activeElement as HTMLElement | null)?.blur?.();
      e.preventDefault();
      return;
    }
    if (s.modal || isTyping(e.target)) return;

    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      return void store.saveProjectFile();
    }
    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      return void store.pickFile();
    }
    if (s.phase !== 'ready') {
      if (e.key === '?' || e.key === ',') {
        e.preventDefault();
        store.openModal(e.key === '?' ? 'help' : 'settings');
      }
      return;
    }

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      return e.shiftKey ? store.redo() : store.undo();
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      return store.redo();
    }
    if (mod) return;

    const sr = s.source!.sampleRate;
    const fast = s.settings.fastArrows ? !e.shiftKey : e.shiftKey;
    const step = Math.round((s.settings.stepMs / 1000) * sr * (e.altKey ? 0.1 : fast ? 10 : 1));

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (e.shiftKey) {
          const c = store.clip();
          if (c) void store.playFrom(c.start, true);
        } else store.togglePlay();
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (e.shiftKey && s.lineMode) return store.moveLine(-1);
        return store.move(-1, { play: true, slow: s.settings.slowOnPrev });
      case 'ArrowDown':
        e.preventDefault();
        if (e.shiftKey && s.lineMode) return store.moveLine(1);
        return store.move(1, { play: true });
      case '[':
        e.preventDefault();
        return store.stepLine(-1);
      case ']':
        e.preventDefault();
        return store.stepLine(1);
      case 'ArrowLeft':
        e.preventDefault();
        return store.step(-Math.max(1, step));
      case 'ArrowRight':
        e.preventDefault();
        return store.step(Math.max(1, step));
      case 'Home':
        e.preventDefault();
        return store.home();
      case 'End':
        e.preventDefault();
        return store.end();
      case 'Enter':
        e.preventDefault();
        return e.shiftKey ? store.demote() : store.promote();
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        return store.trash();
      case 'Tab':
        e.preventDefault();
        return store.setLane(s.lane === -1 ? (e.shiftKey ? s.project!.laneNames.length - 1 : 0) : s.lane + (e.shiftKey ? -1 : 1));
      case '?':
        e.preventDefault();
        return store.openModal('help');
      case ',':
        e.preventDefault();
        return store.openModal('settings');
      case '=':
      case '+':
        e.preventDefault();
        return store.setGain(s.settings.gainDb + 3);
      case '-':
      case '_':
        e.preventDefault();
        return store.setGain(s.settings.gainDb - 3);
    }

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      return store.sendToLane(Number(e.key));
    }

    switch (e.key.toLowerCase()) {
      case 's':
        e.preventDefault();
        return store.split(e.shiftKey);
      case 'm':
        e.preventDefault();
        return e.shiftKey ? store.mergePrev() : store.mergeNext();
      case 'i':
        e.preventDefault();
        return store.setIn();
      case 'o':
        e.preventDefault();
        return store.setOut();
      case 'l':
        e.preventDefault();
        return e.shiftKey ? store.openModal('goto') : store.continueScript();
      case 'g':
        e.preventDefault();
        return store.toggleLineMode();
      case 'w':
        e.preventDefault();
        return store.openModal('transcribe');
      case 'u':
        e.preventDefault();
        return store.nextUncertain();
      case 'a':
        e.preventDefault();
        return store.toggleAutoplay();
      case 'r':
        e.preventDefault();
        return store.toggleLoop();
      case 'e':
        e.preventDefault();
        return store.openModal('export');
      case 't':
        e.preventDefault();
        return store.setScriptEditing(true);
    }
  });
}
