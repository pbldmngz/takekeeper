# Takekeeper

Take triage for voice actors. Drop an hour-long WAV, get every take as a clip, and sort them
into passes with the keyboard alone. Runs entirely in the browser — nothing is uploaded, no
account, no server.

## How it works

1. **Load** a WAV (any length) or a short MP3/FLAC/OGG. Silence between takes is detected and every take becomes a clip in the *Unsorted* lane.
2. **Listen.** Clips autoplay one after another. `Enter` promotes a take to the next lane, `Backspace` trashes it. Do a second pass on *Pass 1*, a third on *Pass 2*, until *Final* holds the keepers.
3. **Fix cuts** without leaving the keyboard: split, merge neighbours back together, nudge the start and end by a frame, all with undo.
4. **Export** the *Final* lane as numbered WAV files straight into a folder (Chrome/Edge), as a zip, or as one merged file.

Lanes, cuts and script line marks are saved in the browser and restored when you open the same file again.

## Keys

Everything acts on the clip under the amber playhead.

| Key | Action |
| --- | --- |
| `Space` / `Shift+Space` | Play–pause / play clip from its start in slow motion |
| `↑` / `↓` | Previous / next clip (slow-motion on `↑` is a setting, off by default) |
| `←` `→` | Move the playhead 150 ms · `Shift` one frame (15 ms), precise · `Alt` 1.5 ms · swap in Settings |
| `Home` / `End` | Clip start / end |
| `Enter` / `Shift+Enter` | Promote to next lane / demote |
| `Backspace` | Trash (the lane closes up) |
| `1`–`9`, `0` | Send clip straight to lane N / back to Unsorted |
| `S` / `Shift+S` | Split at playhead, staying on the first half / the second (default is a setting) |
| `M` / `Shift+M` | Merge with next / previous clip (restores the audio between them) |
| `I` / `O` | Set clip start / end at playhead |
| `L` / `Shift+L` | Continue the script here / jump to a line number |
| `[` / `]` | This clip: one line back / forward |
| `G` · `Shift+↑` `Shift+↓` | Line mode: one line's takes at a time · previous / next line |
| `W` / `U` | Transcribe takes with Whisper (in-browser, WebGPU) and match them to lines / next doubtful match |
| `T` | Edit the script |
| `A` | Toggle autoplay |
| `=` / `-` | Monitor gain up / down (listening only, never exported) |
| `Tab` / `Shift+Tab` | Switch lane |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `E` · `,` · `?` | Export · Settings · Key reference |
| `Ctrl+O` | Open a file (a `.takekeeper.json` project works too) |
| `Ctrl+S` | Save the project file: lanes, cuts, line marks, script |
| `Esc` | Stop / close |

## Into FL Studio

Sort the exported folder by name, select all files, and hold **Shift** while dropping them onto the
Playlist — they land on one track in order. Turn on **Ripple edit** so deleting a clip closes the gap.

## Develop

```bash
npm install
npm run dev
```

`npm run build` type-checks and writes a static site to `dist/`.

## Deploy to Vercel

Push this folder to a GitHub repository, import it on vercel.com, and accept the detected Vite
settings (build `npm run build`, output `dist`). No environment variables, no serverless functions.

## Limits

- WAV files stream from disk and can be any length. Compressed formats are decoded in memory, so keep those under ~25 minutes.
- Saving straight into a folder and remembering the file across reloads need Chrome or Edge. Firefox gets the zip download and has to re-pick the file.
- State lives in the browser's local storage. Clearing site data clears your lanes.

## CLI

`autoslice.py` is the original terminal version: it splits a file into numbered takes or a
single de-silenced file (`python autoslice.py --help`).
