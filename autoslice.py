#!/usr/bin/env python3
"""
autoslice.py - Remove long silences between takes from an audio file.

Run with no arguments to get a file picker:
    python autoslice.py

Or point it straight at a file and tweak the thresholds:
    python autoslice.py --file take01.wav --threshold -45 --min-silence 1.5 --margin 0.3

Every take is written as its own numbered file in a "<name>_takes" folder next to
the original, ready to drag into a DAW playlist. Use --join to get one file with
the silences removed instead, written as "sliced_<original name>".
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

DEFAULTS = {
    "threshold": -40.0,   # dBFS; anything quieter than this counts as silence
    "min_silence": 1.0,   # seconds; silences shorter than this are left alone
    "margin": 0.25,       # seconds of silence kept on each side of speech
    "frame": 20.0,        # ms; analysis resolution
    "fade": 5.0,          # ms; tiny fade at each cut so edits don't click
    "prefix": "sliced_",
}

AUDIO_TYPES = [
    ("Audio files", "*.wav *.flac *.aiff *.aif *.mp3 *.ogg *.opus *.w64"),
    ("All files", "*.*"),
]


def pick_file():
    """Open the OS file explorer and return the chosen path (or None)."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError:
        sys.exit("tkinter is not available - use --file <path> instead.")

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(title="Pick an audio file to de-silence",
                                      filetypes=AUDIO_TYPES)
    root.destroy()
    return path or None


def pick_folder():
    """Open the OS file explorer and return the chosen folder (or None)."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError:
        sys.exit("tkinter is not available - use --file <path> instead.")

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    folder = filedialog.askdirectory(title="Pick the takes folder to merge")
    root.destroy()
    return Path(folder) if folder else None


def merge_folder(folder, gap_seconds):
    """Join every audio file in a folder, in filename order, into one file."""
    if folder is None:
        sys.exit("No folder selected.")
    if not folder.is_dir():
        sys.exit(f"Not a folder: {folder}")

    exts = {".wav", ".flac", ".aiff", ".aif", ".mp3", ".ogg", ".opus", ".w64"}
    files = sorted(f for f in folder.iterdir() if f.suffix.lower() in exts)
    if not files:
        sys.exit(f"No audio files in {folder}")

    info = sf.info(str(files[0]))
    chunks = []
    for f in files:
        data, sr = sf.read(str(f), dtype="float32", always_2d=True)
        if sr != info.samplerate or data.shape[1] != info.channels:
            sys.exit(f"{f.name} is {sr} Hz / {data.shape[1]} ch - does not match "
                     f"{files[0].name} ({info.samplerate} Hz / {info.channels} ch)")
        chunks.append(data)

    gap = max(0, int(round(gap_seconds * info.samplerate)))
    if gap:
        silence = np.zeros((gap, info.channels), dtype="float32")
        chunks = [c for chunk in chunks for c in (chunk, silence)][:-1]

    out = np.concatenate(chunks)
    dest = unique_path(folder.with_name(f"{folder.name}_merged{files[0].suffix}"))
    print(f"Merged   {len(files)} takes  |  {hms(out.shape[0] / info.samplerate)}")
    print(f"Wrote    {write_audio(dest, out, info.samplerate, info)}")


def frame_db(audio, frame_len):
    """Per-frame level in dBFS, taking the loudest channel of each frame."""
    n_pad = (-audio.shape[0]) % frame_len
    if n_pad:
        audio = np.pad(audio, ((0, n_pad), (0, 0)))
    frames = audio.reshape(-1, frame_len, audio.shape[1])
    rms = np.sqrt(np.mean(np.square(frames), axis=1)).max(axis=1)
    return 20.0 * np.log10(np.maximum(rms, 1e-12))


def loud_runs(mask):
    """Start/end frame indices of every contiguous True run in mask."""
    edges = np.flatnonzero(np.diff(np.concatenate(([0], mask.astype(np.int8), [0]))))
    return list(zip(edges[0::2], edges[1::2]))


def build_segments(runs, n_samples, frame_len, min_silence, margin):
    """Turn loud frame runs into sample ranges to keep."""
    segs = [[s * frame_len, min(e * frame_len, n_samples)] for s, e in runs]
    if not segs:
        return []

    # Only genuinely long gaps get cut; short pauses stay untouched.
    merged = [segs[0]]
    for start, end in segs[1:]:
        if start - merged[-1][1] < min_silence:
            merged[-1][1] = end
        else:
            merged.append([start, end])

    # Breathing room around each kept region, then re-merge any overlaps.
    padded = []
    for start, end in merged:
        start = max(0, start - margin)
        end = min(n_samples, end + margin)
        if padded and start <= padded[-1][1]:
            padded[-1][1] = max(padded[-1][1], end)
        else:
            padded.append([start, end])
    return padded


def apply_fade(chunk, fade_len):
    if fade_len <= 0 or chunk.shape[0] < 2 * fade_len:
        return chunk
    ramp = np.linspace(0.0, 1.0, fade_len, dtype=chunk.dtype)[:, None]
    chunk = chunk.copy()
    chunk[:fade_len] *= ramp
    chunk[-fade_len:] *= ramp[::-1]
    return chunk


def write_audio(out_path, data, sr, info):
    """Write in the source format where possible, else fall back to WAV."""
    subtype = info.subtype if sf.check_format(info.format, info.subtype) else None
    try:
        sf.write(str(out_path), data, sr, subtype=subtype)
    except Exception:
        out_path = unique_path(out_path.with_suffix(".wav"))
        sf.write(str(out_path), data, sr, subtype="PCM_24")
        print("(original format could not be written - saved as WAV instead)")
    return out_path


def unique_path(path):
    if not path.exists():
        return path
    for i in range(1, 1000):
        candidate = path.with_name(f"{path.stem}_{i}{path.suffix}")
        if not candidate.exists():
            return candidate
    sys.exit(f"Too many existing files like {path.name}")


def hms(seconds):
    m, s = divmod(seconds, 60)
    return f"{int(m):d}:{s:05.2f}"


def main():
    p = argparse.ArgumentParser(
        description="Cut long silences out of a voice-over take.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--file", help="Audio file to process, or the takes folder when "
                                  "using --merge (default: ask with a picker)")
    p.add_argument("--merge", action="store_true",
                   help="Join the takes left in a folder back into one file, in "
                        "filename order - run this after deleting the bad ones")
    p.add_argument("--gap", type=float, default=0.0,
                   help="Seconds of silence to place between takes when merging")
    p.add_argument("--threshold", type=float, default=DEFAULTS["threshold"],
                   help="Silence threshold in dBFS - lower = only cuts quieter parts")
    p.add_argument("--min-silence", type=float, default=DEFAULTS["min_silence"],
                   help="Seconds - silences shorter than this are kept as-is")
    p.add_argument("--margin", type=float, default=DEFAULTS["margin"],
                   help="Seconds of silence kept on each side of every take")
    p.add_argument("--frame", type=float, default=DEFAULTS["frame"],
                   help="Analysis frame size in milliseconds")
    p.add_argument("--fade", type=float, default=DEFAULTS["fade"],
                   help="Fade in/out at each cut in milliseconds (0 = hard cuts)")
    p.add_argument("--join", action="store_true",
                   help="Write one file with the silences removed, instead of "
                        "one numbered file per take")
    p.add_argument("--prefix", default=DEFAULTS["prefix"],
                   help="Filename prefix for the --join output")
    p.add_argument("--dry-run", action="store_true", help="Analyse and report, write nothing")
    args = p.parse_args()

    if args.merge:
        merge_folder(Path(args.file) if args.file else pick_folder(), args.gap)
        return

    path = Path(args.file) if args.file else (lambda f: Path(f) if f else None)(pick_file())
    if path is None:
        sys.exit("No file selected.")
    if not path.is_file():
        sys.exit(f"Not a file: {path}")

    print(f"Reading  {path}")
    try:
        info = sf.info(str(path))
        audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
    except Exception as exc:
        sys.exit(f"Could not read that file: {exc}")

    total = audio.shape[0]
    if total == 0:
        sys.exit("File is empty.")
    print(f"         {hms(total / sr)}  |  {sr} Hz  |  {audio.shape[1]} ch  |  {info.subtype}")

    frame_len = max(1, int(round(args.frame / 1000.0 * sr)))
    db = frame_db(audio, frame_len)
    floor = float(np.percentile(db, 10))
    peak = float(db.max())
    print(f"Levels   noise floor ~{floor:.1f} dBFS  |  peak ~{peak:.1f} dBFS  "
          f"|  threshold {args.threshold:.1f} dBFS")

    segments = build_segments(
        loud_runs(db > args.threshold),
        total,
        frame_len,
        int(round(args.min_silence * sr)),
        int(round(args.margin * sr)),
    )

    if not segments:
        sys.exit("Nothing above the threshold - try a lower --threshold "
                 f"(the noise floor here is around {floor:.0f} dBFS).")

    kept = sum(e - s for s, e in segments)
    removed = total - kept
    print(f"Result   {len(segments)} take(s) kept  |  {hms(kept / sr)} kept  "
          f"|  {hms(removed / sr)} removed ({removed / total * 100:.1f}%)")

    if args.dry_run:
        print("Dry run - nothing written.")
        return

    fade_len = max(0, int(round(args.fade / 1000.0 * sr)))

    if args.join:
        out = np.concatenate([apply_fade(audio[s:e], fade_len) for s, e in segments])
        dest = unique_path(path.with_name(args.prefix + path.name))
        print(f"Wrote    {write_audio(dest, out, sr, info)}")
        return

    out_dir = unique_path(path.with_name(f"{path.stem}_takes"))
    out_dir.mkdir()
    width = max(2, len(str(len(segments))))
    for i, (start, end) in enumerate(segments, 1):
        name = f"{path.stem}_{i:0{width}d}{path.suffix}"
        write_audio(out_dir / name, apply_fade(audio[start:end], fade_len), sr, info)
    print(f"Wrote    {len(segments)} take files in {out_dir}")
    print("         In FL: select them all in the Browser, drag them into the")
    print("         Playlist, switch the Playlist to Ripple edit, delete bad takes.")


if __name__ == "__main__":
    interactive = len(sys.argv) == 1
    try:
        main()
    except SystemExit as exc:
        if interactive and exc.code:
            print(exc.code)
            input("\nPress Enter to close...")
            raise SystemExit(1) from None
        raise
    except KeyboardInterrupt:
        sys.exit("\nCancelled.")
    if interactive:
        input("\nPress Enter to close...")
