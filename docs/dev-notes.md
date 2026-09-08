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

## Next: localisation and SEO (planned, not started)

- UI strings: add `src/i18n.ts` with `t(key)` over `en` and `es` dictionaries; language setting `auto | en | es` (auto from `navigator.language`), switch in settings and a small `[es]/[en]` in the header; all copy lowercase in both languages; keep key labels as-is.
- Landing: keep static HTML for SEO. Generate `dist/es/index.html` (and keep `/` as English) at build time from a template plus a translations JSON, with `<html lang>`, `hreflang` alternates on both pages, per-language title, description, OG text and JSON-LD (FAQ regenerated from the visible FAQ), both URLs in `sitemap.xml`.
- Spanish search terms to cover: seleccionar tomas, tomas de doblaje, cortar audio por silencios, actor de doblaje, locutor, locución, grabación de voz, dividir wav en tomas, FL Studio.
- Other SEO: preload the font stylesheet, explicit `width/height` on images (done), `og:locale` per page, keep the FAQ schema in sync via the build script, consider a short "how it works" video later.
