import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { target: 'es2022' },
  worker: { format: 'es' },
  // transformers.js loads its wasm/webgpu runtime itself; pre-bundling breaks that
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  server: {
    proxy: { '/testfiles': { target: 'http://127.0.0.1:8765', changeOrigin: true, rewrite: (p) => p.replace(/^\/testfiles/, '') } },
  },
});
