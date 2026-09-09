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
- The landing fold is deliberate and measured: at 1440x780 (a real laptop) the header, one thin line, a two-line title, a three-line lead and the drop zone end by 486, and `#look` starts at 510, so about a third of the editor screenshot is visible above the fold on a laptop and cut by it (43% on a 900px viewport). That is the proof, so keep it there: `.hero` padding, `#landing` padding-top and the title size are what move it. The title is sized `clamp(20px, 2.2vw, 32px)` because at 32px the longest line (the English first sentence, 35 characters) is 672px of the 720px content box; each sentence is its own `<span>` so a rounding error can never wrap it to three lines. The drop zone is the only amber thing above the fold, and it is a real `<button>`.
- Dropping a `.takekeeper.json` on the landing: if this browser still holds a file handle for that project key, `importProjectFile` calls `resume` and the recording opens itself. Otherwise `state.pending` is set and the drop zone says which recording is missing, until `openFile` clears it. The landing renders no toast, so anything a toast alone would say there is invisible.
- The hero exists three times and they must stay identical in shape: `src/ui/Empty.tsx` (the real one), the `<!-- hero -->` block in `index.html` and the `<!-- @hero -->` block in `landing/es.html` (both static, for crawlers and for the frame before the app mounts). Verified with JavaScript disabled: the static frame puts `.drop` and `.shot` at exactly the same y as the mounted app, so there is no shift.
- `src/tour.ts` + `src/ui/Tour.tsx`: the four first-run cards. Step data (selectors to point at, placement, copy keys) lives in `tour.ts` so the store can count steps without importing the ui; `settings.toured` remembers it, `[ tour ]` in the keys panel replays it.
- `public/manifest.webmanifest`, `public/sw.js`: installable on the desktop. The worker caches same-origin GETs only (network-first for pages so a deploy lands, cache-first for hashed assets); the model and the fonts are other origins and keep their own caches. It registers in production only.
- `src/links.ts`: the author's site and the support page (`?type=bug|suggestion&lang=`), the only outbound links; nothing about the session ever goes in a query string.
- `public/`: `screenshot.png` / `screenshot-es.png` (editor in each language, same session and take), `og.png` / `og-es.png`, `logo.svg`, `favicon.svg`, touch icons, `robots.txt`, `sitemap.xml`.
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
- Author and support links: the landing footer (static, both `index.html` and `landing/es.html`, with the copyright line) carries all four; the help modal and the landing error box carry only report a bug / suggest a feature, in the modal's `.foot .left` so they line up with the close button. `lang` follows the interface language at click time.
- The brand in the editor header calls `closeSession()`: back to the landing with the recording still in memory, so `resume` on that session returns instantly instead of re-picking the file. Ctrl or middle click still opens the real landing URL.
- Commit messages: short imperative title; trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Localisation and SEO

- UI copy: `src/i18n.tsx`. `t(key, vars)` where the key is the English string itself and `es` is one dictionary keyed by those strings, so `tsc` rejects a call whose key has no Spanish. `{name}` interpolates; `[[x]]` renders `<kbd>` and `**x**` `<b>` through `rich()` / `<T k=… />`. Plural forms are separate keys. Lane names: stored in English (`Unsorted`, `Pass 1`, `Final`, plus `Junk`/`Trash`); `laneLabel()` translates the defaults for display and leaves custom names as typed. Every user-visible string in `store.ts`, `wav.ts`, `export.ts`, `transcriber.ts` and the UI goes through `t()`.
- Language: setting `lang: auto | en | es`. `auto` follows the page (`<html lang>`, fixed at load as `PAGE_LANG`). `redirectFor()` decides before mounting: a chosen language always wins (`/` ↔ `/es/`); on auto, a Spanish browser (`navigator.languages[0]`) opening `/` goes to `/es/`, and the reverse never redirects so English crawlers can index `/es/`. The header `[es]`/`[en]` button navigates on the landing page and only re-renders in the editor (amber when `navigator.language` prefers the other one and the setting is auto).
- Landing: `index.html` is the English source, including a static hero inside `#app` for crawlers without JS (the app clears it before mounting). `landing/es.html` holds the Spanish hero (`<!-- @hero -->`) and `<main>` (`<!-- @landing -->`), `landing/es.json` the Spanish title/description/OG/schema text. `landing/plugin.ts` (Vite plugin) serves `/es/` in dev and writes `dist/es/index.html` at build by swapping those parts and the head metadata; on both pages it regenerates the JSON-LD (SoftwareApplication + FAQPage) from the visible `<details>` FAQ, so `index.html` carries no JSON-LD of its own. Keep the two `<main>`s structurally identical; when adding a FAQ entry or key row, add it in both.
- Head: `hreflang` en/es/x-default on both pages (same set), canonical per page, `og:locale` + alternate, font stylesheet preloaded. `public/sitemap.xml` lists both URLs with xhtml alternates. `og.png` / `og-es.png` carry the hero copy verbatim; `python scripts/og.py` regenerates both (JetBrains Mono ttfs in `.rig/fonts`) is set as `og:image`/`twitter:image` on `/es/`. `vercel.json` has `trailingSlash: true` so `/es` redirects to `/es/`, the canonical.
- Testing `/es/` in the in-app browser: navigate to `http://localhost:5173/es/`; the app UI, modals and toasts should read Spanish; `__tk.updateSettings({ lang: 'auto' })` resets a stored choice.

## Screenshot rig

`npm run shots -- --wav <recording> --project <.takekeeper.json>` (`scripts/shots.mjs`) writes the six documented states in both languages to `shots/<lang>/`: `01-landing` (session listed), `02-detected` (fresh detection, nothing sorted), `03-transcribe` (dialog mid-run with the eta, a real GPU run cancelled after 15 takes), `04-line-mode` (a line with takes spread over lanes), `05-export` (fullest named lane, gaps on), `06-junk` (the junk take with the most real words, the honest caveat), plus `00-editor` (the landing screenshot state). Options: `--langs en,es`, `--scale 2`, `--states 1,3`, `--out dir`. It starts its own Vite dev server on 5199 and drives the installed Chrome (headed, Playwright) through `window.__tk`; the recording is handed over as a disk-backed File through a file input, so no blob-store limit. Chrome's profile lives in `.rig/profile` (git-ignored) and keeps the Whisper model cache; the first run downloads it. About 90 s per language once cached. The FL Studio playlist shot is manual.
