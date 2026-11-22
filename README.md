# Drop Studio

Turn a finished EDM track into a YouTube-ready music video, a Shorts cut and a thumbnail, locally, from a browser UI.

> **Status: Phase 1 of 5. Skeleton + analysis.** Upload, analysis, the editable waveform, Settings and Health work.
> Style, Storyboard, Generate, Render and Publish show what's coming.

## Quick start (Mac)

You need [Node.js 22.13+](https://nodejs.org) and [Homebrew](https://brew.sh). Then, in this folder:

```bash
npm run setup     # one time: installs FFmpeg, uv, Python 3.11 and the analysis libraries
npm run dev       # starts everything; open http://localhost:3000
```

`npm run setup` is safe to re-run. Optional extras:

```bash
npm run setup -- --with-stems    # Demucs stem separation (~1 GB, uses the M-series GPU)
npm run setup -- --with-allin1   # allin1 analyzer (experimental on Mac; the built-in one is tuned for EDM anyway)
```

If something isn't working, open **Health** in the sidebar. It lists every component, with the exact command to fix anything that's missing.

## Testing Phase 1

1. **Library → Test track.** This synthesizes a 2:16, 128 BPM track (16-bar intro, build, a quiet 16-bar breakdown, a loud drop, an outro) and analyzes it.
2. On **Analyze** you should see: **128 BPM**, **A minor (8A)**, the breakdown starting at **bar 33 (1:00)** and the drop at **bar 49 (1:30)**.
3. Press **Space** to play, **← / →** to jump a bar, **Shift + ← / →** to jump 16 bars. Turn on **Click track** and listen: the high click should land on every bar's "1".
4. Drag a section's edge: it snaps to the nearest bar. Click a section to relabel it. **Save changes**, then reload; your edits stick.
5. If the bar numbers are ever off by a beat on a real track, play to the real "1" and press **Set bar 1 here**.
6. **New project** with one of your own tracks (WAV, AIFF, MP3 or FLAC).

Automated acceptance test (BPM 128 ± 0.5; breakdown and drop within one bar; also after an MP3 round-trip):

```bash
npm test
```

## How it works

```
Browser UI (Next.js) ──► API routes ──► SQLite (data/drop.db): projects, jobs, settings
                                          ▲
Python worker (FastAPI :8765) ── polls ───┘  runs analysis jobs, writes projects/<id>/music_map.json
```

- **`music_map.json`** is the single source of truth for everything downstream: BPM, beats, downbeats, 8/16-bar phrases, labeled sections, 60 fps energy envelopes (rms/low/mid/high/kick/bass/drums/other), and kick/clap/hat hits.
- **Beat grid:** club tracks are tempo-locked, so instead of a frame-quantized beat tracker we fit the exact BPM and phase across the whole track, then align it to the real kick attacks. This gives a perfect grid, even through kick-less breakdowns. Tempo drift is detected and falls back to tracked beats.
- **Sections:** boundaries are scored on bar lines (biased toward 8/16-bar phrases) by changes in low-end, overall and high-band energy and in onset density. They're then labeled `intro | build | drop | breakdown | outro` from energy and context.
- **Kicks** only count when they're on the beat, so rolling off-beat basslines don't trigger kick flashes.

## Folders

| Path | What |
|---|---|
| `app/`, `components/`, `hooks/`, `lib/` | Next.js UI and API |
| `worker/` | Python analysis worker (`analysis/` holds the actual music logic) |
| `db/schema.sql` | Database schema shared by both sides |
| `scripts/` | `setup`, `dev` and helper launchers |
| `projects/<id>/` | Your audio, `music_map.json`, `peaks.json`, images *(git-ignored)* |
| `data/drop.db` | Projects, jobs and settings, including API keys *(git-ignored)* |

## Privacy

Everything runs on your machine. API keys are stored in `data/drop.db` (git-ignored), never sent back to the browser in full, and never logged. Next.js telemetry is turned off.
