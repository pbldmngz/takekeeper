import { render } from 'preact';
import { installKeys } from './state/keys';
import { store } from './state/store';
import { App } from './ui/App';
import './styles.css';

if (import.meta.env.DEV) (window as unknown as { __tk: typeof store }).__tk = store;
installKeys();
render(<App />, document.getElementById('app')!);
