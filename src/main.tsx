import { render } from 'preact';
import { PAGE_LANG, browserLang, redirectFor } from './i18n';
import { installKeys } from './state/keys';
import { store } from './state/store';
import { App } from './ui/App';
import './styles.css';

// Visitors land in their language: a Spanish browser opening / goes to /es/; a chosen language always wins.
const go = redirectFor(store.state.settings.lang, PAGE_LANG, browserLang());
if (go) {
  location.replace(go);
} else {
  if (import.meta.env.DEV) (window as unknown as { __tk: typeof store }).__tk = store;
  // installable on the desktop, and the app itself opens offline after the first visit
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  installKeys();
  const app = document.getElementById('app')!;
  app.replaceChildren(); // the static hero was for crawlers
  render(<App />, app);
}
