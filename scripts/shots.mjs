// Screenshot rig: puts the editor in each documented state, in each language, and writes PNGs.
//
//   node scripts/shots.mjs --wav "D:\sessions\mart_full.wav" --project "D:\sessions\mart_full.takekeeper.json"
//   options: --out shots  --langs en,es  --scale 1|2  --states 1,2,3,4,5,6
//
// Drives the dev build (window.__tk) in the installed Chrome through Playwright. The recording is handed to the
// page as a disk-backed File, so any length works. Chrome keeps its profile in .rig/profile, which is where the
// Whisper model is cached after the first run; state 3 needs a real GPU run of a few takes.

import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const WAV = arg('wav', process.env.TK_WAV);
const PROJECT = arg('project', process.env.TK_PROJECT);
const OUT = path.resolve(arg('out', 'shots'));
const LANGS = arg('langs', 'en,es').split(',');
const SCALE = Number(arg('scale', '1'));
const STATES = new Set(arg('states', '1,2,3,4,5,6').split(',').map(Number));
const W = 1920;
const H = 940;
const PORT = 5199;

if (!WAV || !fs.existsSync(WAV)) throw new Error('--wav <recording> is required');
if (!PROJECT || !fs.existsSync(PROJECT)) throw new Error('--project <.takekeeper.json> is required');

const server = await createServer({ configFile: 'vite.config.ts', server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const ctx = await chromium.launchPersistentContext(path.resolve('.rig/profile'), {
  channel: 'chrome',
  headless: false,
  viewport: { width: W, height: H },
  deviceScaleFactor: SCALE,
  colorScheme: 'dark',
  args: ['--window-size=1960,1120', '--window-position=0,0'],
});
ctx.setDefaultTimeout(15 * 60 * 1000);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

try {
  for (const lang of LANGS) {
    const base = `http://localhost:${PORT}${lang === 'es' ? '/es/' : '/'}`;
    const dir = path.join(OUT, lang);
    fs.mkdirSync(dir, { recursive: true });
    const settings = { lang, asrLanguage: 'spanish', asrModel: 'small' };

    const fresh = async () => {
      const page = await ctx.newPage();
      await page.addInitScript((s) => localStorage.setItem('takekeeper:settings', JSON.stringify(s)), settings);
      await page.goto(base);
      await page.waitForFunction(() => !!window.__tk);
      await page.waitForTimeout(600); // sessions list
      return page;
    };
    // A File backed by the file on disk, through an input Playwright fills by path; then the app opens it.
    const feed = async (page, file) => {
      await page.evaluate(() => {
        const i = document.createElement('input');
        i.type = 'file';
        i.id = 'rig-file';
        i.style.display = 'none';
        document.body.appendChild(i);
      });
      await page.setInputFiles('#rig-file', file);
      await page.evaluate(async () => {
        const i = document.getElementById('rig-file');
        const f = i.files[0];
        i.remove();
        await window.__tk.openFile(f);
      });
      await page.waitForFunction(() => window.__tk.state.phase !== 'loading');
    };
    const quiet = async (page) => {
      await page.waitForFunction(() => !window.__tk.state.toast, null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(350);
    };
    const shot = async (page, name) => {
      await quiet(page);
      const file = path.join(dir, `${name}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
      log(lang, name);
    };

    let page = await fresh();

    // 2. right after detection: no saved sorting, every take in unsorted, junk empty
    await page.evaluate(() => Promise.all(window.__tk.state.sessions.map((s) => window.__tk.discard(s.key))));
    await feed(page, WAV);
    if (STATES.has(2)) {
      // not the first take (a quiet slate at 0:00): a full-bodied one a couple of minutes in
      await page.evaluate(() => {
        const tk = window.__tk;
        const sr = tk.state.source.sampleRate;
        const c = [...tk.state.project.clips]
          .sort((a, b) => a.start - b.start)
          .find((c) => c.start > 120 * sr && (c.end - c.start) / sr >= 1.5 && (c.end - c.start) / sr <= 3.5);
        if (c) tk.gotoClip(c.id, { play: false });
      });
      await shot(page, '02-detected');
    }

    // the sorted, transcribed project on top of the same recording
    await feed(page, PROJECT);
    await page.evaluate(() => window.__tk.setLane(0));
    await shot(page, '00-editor');

    // 4. line mode: one line with takes spread over lanes
    if (STATES.has(4)) {
      await page.evaluate(() => {
        const tk = window.__tk;
        const counts = tk.lineCounts();
        let best = null;
        for (const l of tk.mine()) {
          const c = counts.get(l.n);
          if (!c) continue;
          const here = c[0];
          const spread = c.slice(1, -2).filter(Boolean).length;
          const score = (here >= 4 && here <= 8 ? 10 : 0) + spread * 3 + Math.min(c[1] ?? 0, 5);
          if (!best || score > best.score) best = { n: l.n, score };
        }
        tk.setLane(0);
        tk.selectLine(best.n, { play: false });
      });
      await shot(page, '04-line-mode');
      await page.evaluate(() => window.__tk.toggleLineMode());
    }

    // 5. export dialog
    if (STATES.has(5)) {
      await page.evaluate(() => window.__tk.openModal('export'));
      await page.waitForTimeout(400);
      // the fullest named lane, so the count, order and gap lines mean something
      await page.evaluate(() => {
        const tk = window.__tk;
        const p = tk.state.project;
        const counts = p.laneNames.map((_, i) => p.clips.filter((c) => c.lane === i).length);
        const lane = counts.indexOf(Math.max(...counts.slice(1)), 1);
        const sel = document.querySelector('.modal select');
        sel.value = String(lane);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(300);
      await shot(page, '05-export');
      await page.evaluate(() => window.__tk.openModal(null));
    }

    // 6. junk lane, on a take that looks like junk: flagged by the transcription, a word or two of transcript
    if (STATES.has(6)) {
      await page.evaluate(() => {
        const tk = window.__tk;
        tk.setLane(-2);
        const junk = tk.state.project.clips.filter((c) => c.lane === -2);
        const words = (c) => (c.text ?? '').match(/\p{L}+/gu)?.length ?? 0;
        const score = (c) => (c.kind === 'junk' ? 10 : 0) + (words(c) === 2 ? 3 : words(c) === 1 || words(c) === 3 ? 2 : 0) + Math.min(c.text?.length ?? 0, 12) / 12;
        const pick = [...junk].sort((a, b) => score(b) - score(a))[0];
        if (pick) tk.gotoClip(pick.id, { play: false });
      });
      await shot(page, '06-junk');
      await page.evaluate(() => window.__tk.setLane(0));
    }

    // 3. transcription dialog mid-run, with the time remaining; a real run of a few takes, then cancelled
    if (STATES.has(3)) {
      await page.evaluate(() => {
        window.__tk.openModal('transcribe');
        void window.__tk.transcribe('all');
      });
      log(lang, 'transcribing until an eta shows (first run downloads the model)');
      await page.waitForFunction(() => {
        const ai = window.__tk.state.ai;
        return ai.status === 'running' && ai.eta !== null && ai.done >= 15; // enough takes for a believable eta
      });
      await page.waitForTimeout(300);
      await shot(page, '03-transcribe');
      await page.evaluate(() => window.__tk.cancelTranscribe());
      await page.waitForFunction(() => window.__tk.state.ai.status !== 'running');
      await page.evaluate(() => window.__tk.openModal(null));
      await feed(page, PROJECT); // back to the saved sorting
    }
    await page.close();

    // 1. the landing page with the session listed
    if (STATES.has(1)) {
      page = await fresh();
      await shot(page, '01-landing');
      await page.close();
    }
  }
} finally {
  await ctx.close();
  await server.close();
}
log('done →', OUT);
