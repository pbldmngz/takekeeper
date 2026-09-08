# Developer notes

Practical notes for working on Takekeeper. The product itself is described in `takekeeper-brief.md`.

## Layout

- `index.html`: head metadata, JSON-LD (SoftwareApplication + FAQPage, regenerated from the visible FAQ), and the static landing page `<main id="landing">` (hidden by CSS while `body[data-phase]` is `loading` or `ready`).
- `src/main.tsx`: mounts the Preact app into `#app`; in dev exposes the store as `window.__tk`.
- `src/state/project.ts`: types (Clip, Settings, Project, ScriptLine), lane constants (`TRASH = -1`, `JUNK = -2`), script parsing (`parseScript`, `characters`, `myLines`), IndexedDB persistence (`projects` store keyed by `name|size|lastModified`, `kv` store for file handles), legacy localStorage migration.
- `src/state/store.ts`: the single store (mutable state + `emit()`), every command (navigation, playback, triage, editing, lines, transcription, export helpers), undo as clip-array snapshots.
- `src/state/keys.ts`: the keyboard map. `Ctrl+S/O/Z/Y` first, then everything else only when `phase === 'ready'`.
- `src/audio/`: `wav.ts` (byte-level WAV source, lazy `Blob.slice`, decode/encode samples, header), `analyze.ts` (per-frame dB, `segment`, `segmentRange`), `export.ts` (clip blobs with fades, merged file, store-method zip, folder save via File System Access), `player.ts` (Web Audio playback with a `GainNode`).
- `src/ai/`: `whisper.worker.ts` (transformers.js pipeline in a module worker), `transcriber.ts` (client, models, device detection), `audio.ts` (clip → mono 16 kHz), `align.ts` (normalisation, similarity, Viterbi `alignTakes`, `diagnose`, `groupWords`, `cleanTranscript`).
- `src/ui/`: `Empty.tsx` (landing hero + sessions list), `Editor.tsx`, `Overview.tsx`, `ClipView.tsx`, `ScriptPanel.tsx`, `Toolbar.tsx`, `Modals.tsx` (settings, export, transcribe, help, goto), `Logo.tsx`.
- `public/`: `screenshot.png`, `og.png`, `logo.svg`, `favicon.svg`, touch icons, `robots.txt`, `sitemap.xml`.
- `autoslice.py`: the original CLI, kept.

## Running and testing

- `npm run dev` (Vite on 5173), `npm run build` (tsc + vite), Vercel deploys `main` on push, live at takekeeper.com (apex is primary; www redirects).
- `.claude/launch.json` (git-ignored) defines `slate-dev` and `testfiles` (a python http.server on 8765 serving the scratchpad; Vite proxies `/testfiles/*` to it). Test WAVs: `small.wav` (16 s, 3 takes), `session1h.wav` (synthetic 1 h, 800 takes), `mart.wav` (the user's real 57-min Spanish session; the script is `script_ep02.txt`, character "Mart").
- Loading a file in the test browser: `const b = await (await fetch('/testfiles/x.wav')).blob(); await __tk.openFile(new File([b], 'x.wav', {lastModified: 1}))`. A tab's blob store dies after two or three 1.2 GB loads ("Failed to fetch" / truncated body): open a fresh tab.
- The in-app browser needs DOM key names (`ArrowRight`, `Enter`, `Backspace`); `space` does not work, dispatch a synthetic `KeyboardEvent` with `key: ' '` on `window` instead.
- The test browser has WebGPU on an NVIDIA GPU, so transcription can be tested for real; whisper-small takes about 0.9 s per take.
- A Vite full reload happens on `vite.config.ts` or store edits; `window.__*` test state is lost with it.
- When patching source with Python, anchor on unique strings; a bare `#landing {` once matched an earlier selector and duplicated the stylesheet.

## Gotchas learned

- `whisper-base` with an fp16 encoder on WebGPU outputs garbage; base uses fp32 encoder, small uses fp16. Both use the `_timestamped` ONNX exports (needed for word timestamps).
- transformers.js throws "token_ids must be a non-empty array" when a take yields no tokens; treated as an empty transcript.
- Whisper repeats one token on breaths; `max_new_tokens` is capped by clip length and `cleanTranscript` drops repeated-word and single-letter-run outputs.
- The script panel's `.keys` class collided with the help modal grid; tables use `keytable`.
- Long unbreakable text in the info line once widened the whole page; `.editor` and `.info` are contained.
- Settings live in localStorage; migrating a default is done in `loadSettings` (see `stepMs`).

## Conventions

- UI copy is lowercase, terse, no em dashes; keys shown as `[key]`.
- Design tokens in `styles.css`: cyan structure, amber focus, coral trash, mint playing; light theme overrides under `[data-theme='light']`.
- Every keyboard action is also a toolbar button; help modal, landing key table and README must all be updated when a key changes.
- Commit messages: short imperative title; trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Localisation and SEO

- UI copy: `src/i18n.tsx`. `t(key, vars)` where the key is the English string itself and `es` is one dictionary keyed by those strings, so `tsc` rejects a call whose key has no Spanish. `{name}` interpolates; `[[x]]` renders `<kbd>` and `**x**` `<b>` through `rich()` / `<T k=… />`. Plural forms are separate keys. Lane names: stored in English (`Unsorted`, `Pass 1`, `Final`, plus `Junk`/`Trash`); `laneLabel()` translates the defaults for display and leaves custom names as typed. Every user-visible string in `store.ts`, `wav.ts`, `export.ts`, `transcriber.ts` and the UI goes through `t()`.
- Language: setting `lang: auto | en | es`. `auto` follows the page (`<html lang>`, fixed at load as `PAGE_LANG`). A chosen language wins: `main.tsx` redirects `/` ↔ `/es/` before mounting when the setting disagrees with the page. The header `[es]`/`[en]` button navigates on the landing page and only re-renders in the editor (amber when `navigator.language` prefers the other one and the setting is auto).
- Landing: `index.html` is the English source, including a static hero inside `#app` for crawlers without JS (the app clears it before mounting). `landing/es.html` holds the Spanish hero (`<!-- @hero -->`) and `<main>` (`<!-- @landing -->`), `landing/es.json` the Spanish title/description/OG/schema text. `landing/plugin.ts` (Vite plugin) serves `/es/` in dev and writes `dist/es/index.html` at build by swapping those parts and the head metadata; on both pages it regenerates the JSON-LD (SoftwareApplication + FAQPage) from the visible `<details>` FAQ, so `index.html` carries no JSON-LD of its own. Keep the two `<main>`s structurally identical; when adding a FAQ entry or key row, add it in both.
- Head: `hreflang` en/es/x-default on both pages (same set), canonical per page, `og:locale` + alternate, font stylesheet preloaded. `public/sitemap.xml` lists both URLs with xhtml alternates. Same `og.png` for both languages for now.
- Testing `/es/` in the in-app browser: navigate to `http://localhost:5173/es/`; the app UI, modals and toasts should read Spanish; `__tk.updateSettings({ lang: 'auto' })` resets a stored choice.
