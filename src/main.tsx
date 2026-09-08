import { render } from 'preact';
import { PAGE_LANG, langUrl } from './i18n';
import { installKeys } from './state/keys';
import { store } from './state/store';
import { App } from './ui/App';
import './styles.css';

// A chosen language wins over the page opened: / for English, /es/ for Spanish. Auto follows the page.
const want = store.state.settings.lang;
if (want !== 'auto' && want !== PAGE_LANG) {
  location.replace(langUrl(want));
} else {
  if (import.meta.env.DEV) (window as unknown as { __tk: typeof store }).__tk = store;
  installKeys();
  const app = document.getElementById('app')!;
  app.replaceChildren(); // the static hero was for crawlers
  render(<App />, app);
}
