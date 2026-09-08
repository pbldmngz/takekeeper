# Takekeeper: complete brief

A reference document about Takekeeper (takekeeper.com) for writing articles, posts and documentation. Everything in here is true of the shipped product as of September 2026 unless a section says otherwise. Numbers come from real measurements on a real session.

---

## 1. One-paragraph description

Takekeeper is a free, browser-based take-selection tool for voice actors. You record a session as one long WAV, take after take with silence between them, and drop that file on the page. It splits the recording into individual takes in seconds, transcribes each take on your own GPU (nothing is uploaded), matches every take to the line of your script it belongs to, and then lets you keep the good ones line by line with the keyboard alone, in as many passes as you need. The keepers export as numbered WAV files in script order, with silent gap files between them, so the folder drops onto one FL Studio track already spaced and ordered.

**Taglines in use:** "the takes worth keeping." (headline) · "take triage for voice actors" (descriptor) · "split a recording session into takes. keep the good ones." (hero).

---

## 2. Who it is for and the problem it solves

**Audience:** voice actors and voice-over artists, audiobook narrators, dubbing and ADR performers, people recording character reads, auditions and pickups. Scripts in Spanish and English are tuned for; other languages work via auto-detect.

**The problem.** A recording session for one character in one episode produces a single file of an hour or so containing hundreds of takes: the same line read three, five, eight times, with a breath or a slate between them, occasionally going back two lines to redo something. Choosing the best take of each line is the actual creative job, but getting to that job means a long mechanical one first: cutting the file at the silences, laying the pieces on a timeline, dragging the good ones up to another track, doing that again for a second pass, remembering which line each blob is, and finally arranging the winners in script order. In a DAW this is hours of clicking and dragging per session.

**What Takekeeper changes.** The mechanical part disappears: detection, transcription, line matching, junk removal and re-cutting happen on their own. What remains is listening and pressing one of two keys per take, with the takes for a line presented together and counts telling you where you are. A one-hour session goes from an afternoon of dragging to about half an hour of listening.

The measured reference session used throughout this document: 57 minutes, 44.1 kHz stereo 32-bit float WAV, Spanish, 848 takes, the character "Mart" with 88 lines in the script.

---

## 3. How it works, end to end

### 3.1 Loading and detection

The WAV is never decoded whole. The app parses the header and streams through the file in chunks, measuring the level of every 20 ms frame. Wherever the level stays below a threshold (default −40 dBFS) for longer than the minimum silence (default 1.0 s), it cuts; short breaths and pauses inside a take are left alone, and a margin of room tone (default 0.25 s) is kept on both sides of every take. Each take becomes a *clip*: a start and end position in the original file, not a copy. That is why an hour-long, 1.2 GB session loads in about six seconds and the page uses around 35 MB of memory, and why exports are byte-exact slices of the recording in its own bit depth and sample rate.

Threshold, minimum silence and margin are adjustable; re-detecting keeps the lane and line of every clip whose boundaries did not change. Compressed formats (MP3, FLAC, OGG, M4A) are supported for shorter files (they must be decoded into memory, so roughly 25 minutes is the practical ceiling); WAV files can be any length.

### 3.2 The script and your character

Paste the whole script as plain text. Rows of the form `Name: text` (also `Name (note): text` and `Name : text`) are spoken lines; everything else is treated as stage direction. The app lists the characters it found with their line counts and you pick yours; from then on "line 14" means your 14th line, not the 14th row of the script. Directions and other characters' lines can be shown as cues for context. A script with no character names at all is treated as every row being yours, so a plain list of lines works too.

### 3.3 Transcription

Pressing `W` runs OpenAI's Whisper model inside the page through WebGPU, using Hugging Face's transformers.js. The model downloads once and is cached by the browser (whisper-small, about 410 MB, is the safe choice for Spanish; whisper-base, about 140 MB, is roughly twice as fast and a little rougher). Every take is transcribed on its own, which matters: Whisper on a whole hour tends to collapse repeated phrases, and repetition is exactly what a take session is made of. Runaway outputs on breaths (the model repeating one token) are capped and filtered. Measured on an NVIDIA GPU: about 0.9 s per take with small, so the 848-take hour transcribes in roughly twelve minutes, and you can keep sorting while it runs; progress and time remaining show in the banner.

Audio never leaves the machine. The only network traffic is the app itself and, once, the model files.

### 3.4 Matching takes to lines

Each transcript is compared to every one of your lines using a text similarity that tolerates transcription errors (character trigrams plus whole words, with accents, punctuation and stretched letters like "HOOOOLAAAA" normalised). Then, rather than matching each take on its own, a single pass over the whole session chooses the sequence of lines that fits best overall, with a preference for staying on the same line or moving to the next, a small cost for skipping ahead, a slightly larger one for going back, and a flat cost for jumping anywhere. So a session recorded in order with detours ("went back two lines, redid them, carried on") is matched correctly, and text always wins when it is clear. On the reference session all 88 lines received their takes; the recording contained 15 backward moves and 4 large jumps.

Each match gets a confidence. Doubtful ones are flagged in the info line and `U` walks through them. In practice nearly all flags on a real session are non-takes (breaths, slates, single syllables); genuinely ambiguous cases are short lines that occur more than once ("No." / "Sí."), where the nearest one in sequence wins.

### 3.5 Diagnosis, junk and re-cutting

After matching, every take is diagnosed from its transcript:

- **Empty or wordless** (a breath, a slate, a cough, a false start that never reached a word) moves to the **Junk** lane automatically. Junk is not Trash: it is the app's guess, waiting for yours. It never takes a line's last remaining take, so no line goes silent by accident. On the reference session: 174 takes.
- **Several reads in one take** ("Otra vez. Otra vez. Otra vez.") is re-cut. First at the pauses inside the take with a finer silence threshold; then, for reads with no pause between them, at the word boundary using word-level timestamps, snapped to the quietest nearby frame so no consonant gets clipped. Reference session: 93 such takes became 238 single reads.
- **A false start followed by the real read in the same breath** ("Espera. Espera, déjame terminar.") is separated at the word boundary; the stub is tagged *false start* and left for you to trash. The rule requires the second part to carry the whole line by itself, so a line that Whisper merely punctuated in two is not split.
- **A line that a pause split in two** is merged back when the two halves together read as the line.
- Multi-sentence lines are handled specially: their own sentences look like fragments, so only an exact repeated sentence counts as another read.

Energy-based detection stays the skeleton (it never loses audio, including efforts and laughs that have no words); the transcript only refines where energy got it wrong. Transcript-first cutting was considered and rejected for exactly that reason.

### 3.6 Sorting: lanes and passes

Lanes are the passes of a selection: **Unsorted → Pass 1 → Pass 2 → Final**, plus **Junk** and **Trash**. The names and number of passes are configurable. You sit in a lane; takes autoplay one after another; `Enter` promotes the current take to the next lane, `Backspace` trashes it, nothing leaves it where it is. Do the same on Pass 1, then Pass 2, until Final holds one take per line. Every lane tab shows its count.

**Line mode** (`G`) filters the current lane to one script line: `↑`/`↓` play through that line's takes, `Shift+↑`/`↓` move to the previous or next line, Enter and Backspace work as usual. The script panel shows, for every line, how many takes it has in each lane (`2 p1:4 f:1` = two in unsorted, four in pass 1, one in final) and marks lines with no take in red. Clicking a line filters to it; clicking it again returns to the whole lane; the filter follows you across lanes so a line can be checked pass by pass. Takes can be re-assigned while listening (`[` and `]` move one a line back or forward; `Shift+L` jumps to a number), and `L` marks "the script continues here" for people who prefer to mark lines by hand instead of transcribing.

### 3.7 Fixing cuts by hand

Every take is shown with 1.5 s of context on each side, so a cut can be extended, not only shrunk. The playhead is the only cursor: `←`/`→` move it (ten frames by default, `Shift` for one precise 15 ms frame, `Alt` for a tenth), `I` and `O` set the take's start or end there, `S` splits there, `M` merges with the next take and restores the original audio between them, `Shift+M` merges with the previous. `Shift+Space` replays a take from its start in slow motion (tape-style, pitch drops, default 0.5×), `R` loops the current take, `=`/`-` raise or lower a monitoring gain that never touches the export. Undo is unlimited. Everything is also a button in the toolbar, and mouse users can click lanes, takes in the overview strip, the waveform to seek, and script lines.

### 3.8 Export

The Final lane (or any lane) exports three ways: straight into a folder you pick (Chrome/Edge), as a zip, or as one merged WAV with a fixed gap between takes. Files are numbered in **script order** once takes have lines (recording order within a line; takes without a line last), with the line number in the filename: `mart_001a_line014.wav`. Between takes the export writes tiny silent WAVs in the recording's own format, named to sort in place: `mart_001b_gap1s.wav` after every take (1 s by default) and a longer one (2 s) where the next take is another line. Sort the folder by name, select all, hold Shift while dropping onto the FL Studio playlist, and the takes land on one track, in order, spaced. Turn on Ripple edit in FL so deleting a clip closes the gap. Exports are byte-exact slices with a 5 ms fade at each cut so nothing clicks.

### 3.9 Sessions and project files

Lanes, cuts, line marks, transcripts and where you were (lane, take, playhead) are saved in the browser as you work (IndexedDB, no practical size limit). Every recording you have touched is listed on the landing page, newest first, to resume with one click or discard (with a confirm step). Reopening a WAV that was re-exported or renamed still finds its session by audio length. `Ctrl+S` writes a small `.takekeeper.json` project file next to the recording; drop it on the landing page in any browser, then the WAV, to pick up where you left off. Dropping it into an open editor for the same recording replaces the current sorting (undoable).

---

## 4. Intended workflows

**The full session (with transcription).** Drop the WAV. Paste the script (`T`), pick your character. Press `W`, choose Spanish or English and the small model, start; keep sorting or make coffee, about twelve minutes for an hour. When it finishes: Tab to Junk and confirm the noise (Backspace) or rescue the odd real take (Enter). Press `G` on Unsorted and walk your lines: each line's takes play back to back, promote the ones worth keeping, `Shift+↓` to the next line; `U` visits the few doubtful matches. Repeat the pass on Pass 1 until Final holds one take per line, ideally with the counts showing `f:1` on every line and nothing in red. `E`, export to folder, Shift-drop the folder onto the FL playlist.

**The quick session (no script).** Drop the WAV, let it autoplay, Enter or Backspace per take, a second pass on Pass 1, export in recording order. Same tool, no transcription, still spaced with gap files.

**The pickup.** Reopen a recording from the landing page. Rescue a take from Trash or Junk with Enter (it keeps the line it was matched to; the toast names it). Fix a cut with `[`/`]`, `I`/`O`, `S` or `M`. Re-export. If the machine changed, drop the project file first.

**Marking lines by hand (no GPU).** Paste the script, and while listening press `L` on the first take of each of your lines; every take after it inherits the line until the next mark, `[` and `]` fix a take you went back for. Line mode, counts and script-order export work the same.

---

## 5. Complete key reference

Everything acts on the take under the amber playhead. Every key is also a toolbar button.

| Key | Action |
|---|---|
| `Space` / `Shift+Space` | Play–pause / play the take from its start in slow motion |
| `↑` / `↓` | Previous / next take (autoplays; slow-mo on `↑` is a setting, off by default) |
| `←` `→` | Move the playhead ten frames · `Shift`: one frame, precise · `Alt`: a tenth · swap in settings |
| `Home` / `End` | Take start / end |
| `Enter` / `Shift+Enter` | Promote to next lane / demote. From Junk or Trash, Enter rescues to Unsorted |
| `Backspace` | Trash; the lane closes up |
| `1`…`9`, `0` | Send to lane N / back to Unsorted |
| `Tab` / `Shift+Tab` | Next / previous lane, Junk and Trash included |
| `=` / `-` | Monitor gain up / down (listening only) |
| `R` / `A` | Loop the current take (repeats on its own with autoplay on; otherwise play replays it) / toggle autoplay |
| `S` / `Shift+S` | Split at playhead, staying on the first half / the second (default is a setting) |
| `M` / `Shift+M` | Merge with next / previous (restores the audio between them) |
| `I` / `O` | Set take start / end at playhead |
| `G` | Line mode: one line's takes at a time |
| `Shift+↑` / `Shift+↓` | In line mode: previous / next line |
| `L` / `Shift+L` | Continue the script here / jump to a line number |
| `[` / `]` | This take: one line back / forward |
| `T` | Edit the script |
| `W` | Transcribe takes and match them to lines (dialog also has re-match, re-cut by words, only new takes) |
| `U` | Next doubtful line match |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+S` / `Ctrl+O` | Save the project file / open a file or project |
| `E` · `,` · `?` | Export · settings · key reference |
| `Esc` | Stop / close |

---

## 6. Settings (all saved in the browser)

Detection: silence threshold, minimum silence, margin, fade at cuts, re-detect. Listening: monitor gain, slow-motion speed, slow motion on `↑`, autoplay, line mode wraps around (on). Transcription: language (Spanish, English, auto), model (small, base), empty takes go to junk, re-cut takes with several reads. Editing: frame step, arrows move fast, split stays on the first half, context around a clip. Lanes and look: lane names, theme (auto, dark, light), interface language (auto, English, Spanish). Export: order (by line / by time), silent gaps between takes (on), gap after every take (1 s), gap between lines (2 s), file name prefix.

---

## 7. Measured numbers (reference session)

| Measure | Value |
|---|---|
| File | 57 min, 44.1 kHz, stereo, 32-bit float WAV, 1.21 GB |
| Load and detect | ~6 s; ~35 MB of page memory |
| Takes detected | 848 |
| Transcription, whisper-small on WebGPU (NVIDIA) | ~0.9 s per take, ~12 min for the session |
| Transcription, whisper-base | ~0.44 s per take, ~6 min; average match to the script line 0.79 vs 0.83 for small |
| Lines matched | 88 of 88 |
| Backward moves / large jumps in the recording, handled | 15 / 4 |
| Takes moved to Junk automatically | 174 (breaths, slates, single syllables) |
| Takes with several reads, re-cut | 93 → 238 single reads |
| Export: 848 clip files built | 0.7 s; a full 805 MB zip in 8.5 s at 15 MB memory |
| Whisper model download, once | small ~410 MB, base ~140 MB |

---

## 8. Privacy, platform and limits

- No account, no server, no upload. The recording is read from disk inside the browser; transcription runs on the local GPU; exports are written back to disk. Network traffic is the app and the one-time model download.
- Chrome or Edge on desktop get everything: WebGPU transcription, saving straight into a folder, one-click resume via remembered file handles. Firefox sorts fine, downloads a zip instead, and falls back to CPU transcription, which is slow. Phones and tablets are not the target; it is a keyboard tool.
- WAV: any length (RF64 over 4 GB not yet). Compressed formats: about 25 minutes.
- Transcription quality: Whisper small is good on clean booth Spanish and English; shouted, laughed or mumbled lines transcribe poorly and show up as flagged matches, correctly placed by sequence more often than not. Transcription judges what a take *is*, never how good it is.
- Word timestamps are only ±100–300 ms accurate; that is why they are used to decide *whether* to cut, with cut points snapped to measured silence, and never to trim take edges automatically. A "smart trim" from word times was considered and deliberately not built: the margin a take carries is often performance (a breath, a held vowel), and a silent failure there would show up in the mix.

---

## 9. Design and character

Visual language: monospace everywhere (JetBrains Mono), lowercase labels, controls drawn as `[bracket]` buttons, headings as `> prompts`, hairline rules, cyan for structure, amber for the one thing that matters right now (the playhead, the active lane, the key you should press), coral for trash, mint for playing. Dark by default with a light theme. The logo is two cyan half-takes on a baseline with a coral take lifted out above a dashed ghost slot: the promote gesture. The editor is one screen: lane tabs, a strip of the current lane's takes, the current take's waveform with context and playhead, the script panel with counts, an info line, and a toolbar that is also the key reference. The landing page is deliberately plain: one headline, one sentence, a big drop target, the list of saved sessions, then the explanation.

Terminology used consistently in the product: *take* (what you recorded), *clip* (a take as the app sees it, a range in the file), *line* (a row of your character's script), *lane* (a pass), *promote* / *trash* / *rescue*, *junk* (auto-detected non-takes awaiting a look), *doubtful* (a line match worth a listen).

---

## 10. Origins and roadmap

Takekeeper began as a Python command-line script that cut a session at the silences into numbered files for a voice actor to arrange in FL Studio. The lane workflow copies what that actor was doing by hand: several audio tracks, the good takes dragged up a layer per pass. The web version replaced the CLI, then gained the script, transcription, junk detection and re-cutting over a few days of use on real sessions.

Not built, and honest about it: recording inside the browser (your interface and DAW do it better; pickups may come later), and automatic trimming from word timestamps (see §8).

---

## 11. Suggested screenshot

One editor screenshot with a real session loaded and transcribed, mid-sort, is enough (the one on the landing page, `public/screenshot.png`, with a Spanish-interface twin `screenshot-es.png` on /es/, is exactly that: 797 unsorted, 70 in pass 1, 125 in junk, take #40 on line 17 "Estoy negociando."): the lane tabs with counts along the top (including Junk and Trash), the overview strip with the current take in amber, the waveform with IN/OUT and the amber playhead, the script panel with the character picker, per-line counts and the highlighted current line, the info line showing `line 43 · Espera, déjame terminar.` with its transcript, and the toolbar. That single frame contains every concept in this document.

---

## 12. Facts for quick reference

- Name: Takekeeper. Domain: takekeeper.com. Free. No sign-up.
- Runs in the browser; built with Vite, TypeScript and Preact; hosted on Vercel as a static site.
- Speech recognition: OpenAI Whisper (small / base), run locally via transformers.js and WebGPU, using the `_timestamped` ONNX exports for word timestamps.
- Languages tuned: Spanish, English. Auto-detect for others.
- Interface and landing page in English (takekeeper.com) and Spanish (takekeeper.com/es/); the app follows the page you open, or a language chosen in settings.
- Export: WAV, byte-exact, script order, silent gap files; folder, zip or merged single file.
- FL Studio tip that the export is designed around: sort by name, select all, hold Shift while dropping onto the playlist, then Ripple edit.
