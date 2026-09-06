import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { target: 'es2022' },
  // Dev only: local test recordings served by a separate static server.
  server: { proxy: { '/testfiles': { target: 'http://127.0.0.1:8765', rewrite: (p) => p.replace(/^\/testfiles/, '') } } },
});
