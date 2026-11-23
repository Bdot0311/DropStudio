# Drop Studio

Turn a finished EDM track into a YouTube-ready music video, a Shorts cut, a thumbnail and a seamless loop, locally, from a browser UI.

**Upload → Analyze → Style → Storyboard → Generate → Render → Publish**

## Quick start (Mac)

You need [Node.js 22.13+](https://nodejs.org) (with nvm: `nvm install 24`) and [Homebrew](https://brew.sh). Then, in this folder:

```bash
npm run setup     # one time: FFmpeg, uv, Python 3.11, analysis libraries, web packages
npm run dev       # starts everything; open http://localhost:3000
```

`npm run dev` runs three processes and restarts any that stop:
- `web` is the UI.
- `worker` is the Python analysis worker.
- `render` handles video rendering, AI generation, exports and uploads.

Everything it prints is also saved to `data/logs/dev.log`. If something isn't working, open **Health** in the sidebar.

The first render downloads a headless browser (~100 MB) once.

Optional extras:

```bash
npm run setup -- --with-stems    # Demucs stem separation (~1 GB, uses the M-series GPU)
npm run setup -- --with-allin1   # allin1 analyzer (experimental on Mac; the built-in one is tuned for EDM)
```

## The three modes

| Mode | Cost | What you get |
|---|---|---|
| **A · Visualizer** | Free | Six GLSL scenes (tunnel, particles, liquid, lasers, terrain, kaleidoscope). Kick flashes, zoom and shake; bass bloom; hat flicker; transitions on downbeats. |
| **B · AI montage** | Paid | 8–20 AI clips, cut musically across the whole track. |
| **C · Hybrid** (default) | Paid | AI clips on builds and drops, shaders on intros and breakdowns, with grain, tint and kick flashes over everything. |

Every preset (melodic house/techno, tech house, techno, future rave) sets scenes, cut rhythm, transitions, the reactive mapping, typography and AI prompt templates. See `lib/presets/configs.ts`.

## Edit styles and captions

On the **Style** page, **Edit style → CapCut** adds:
- velocity surges on every beat, zoom punches and twists;
- strobes that speed up into the drop, then a slam with shake;
- RGB split on claps and light leaks at section changes.

It also adds kinetic captions: a hook that pops in word by word, a 3·2·1 countdown, drop text whose letters fly together on the drop, and an end card. Captions come in six styles ported from [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0): kinetic slam, RGB glitch, karaoke pill, neon glow, gradient bounce and matrix decode.

## Claude Code skills

`.claude/skills/` holds the vendored HyperFrames skills plus `dropstudio-effects`, which explains how to port more effects into the renderer. See `.claude/skills/README.md`.

## AI providers and money

- **Pick a provider in Settings.** The free **Test provider** makes placeholder footage, so you can try the whole flow without paying. For real footage, add a **fal.ai** key (recommended), a **Replicate** token, or point at a local **ComfyUI**.
- **Models and prices live in `config/models.json`.** Edit it when providers change things. The dropdowns in Settings read from it.
- **Nothing is spent without a confirm dialog** that shows the estimated cost.
- **Budget cap:** each project has a budget cap, which is also checked before every single item.
- **Spend counter:** the header shows a running total.
- **Never billed twice:** results are cached by provider, model, prompt, seed and input image. Retrying a batch, or changing a prompt back, is free. "New variation" bills exactly one item.
- **Only approved keyframes get animated.** A 6-minute track needs roughly 12–20 clips (60–100 s of footage), because the editor reuses each clip with trims, speed ramps, mirroring, reversing and per-section grading.

## Publish

- **Shorts / TikTok / Reels:** 1080×1920, auto-picked starting 2 bars before your biggest drop. Drag the window on the waveform; it snaps to bars and stays 15–45 s long.
- **Thumbnail:** 1280×720 JPG under 2 MB. Pick from frames at the most intense moments; the title is set in the preset's typography.
- **Loop:** 4, 8 or 16 bars, seamless, 9:16 for Spotify Canvas or 16:9 for live visuals.
- **Metadata:** title, description, tags and credits, built from the links you set once in Settings.
- **Export package:** a zip of everything plus `metadata.txt`, for manual upload in YouTube Studio.
- **YouTube upload (optional):** OAuth, resumable, **private** by default, sets the thumbnail. There's a setup guide under Settings → YouTube. Videos from an unverified Google Cloud project stay private until Google audits it. Each upload uses about 1,600 of your 10,000 daily quota units. If your distributor uses Content ID, whitelist your own channel.

## Output quality

- **Video:** H.264 High, CRF 18, 1080p or 4K, 30 or 60 fps.
- **Audio:** your original file is encoded once (AAC 320 kbps) and trimmed by sample count, so it's sample-accurate.
- **Resumable renders:** renders run in chunks. If one stops, **Retry** continues where it left off.

## Checks

| Command | What it proves |
|---|---|
| `npm test` | Phase 1: on the 128 BPM test track (WAV and MP3), BPM reads 128 ± 0.5, and the breakdown and drop are within 1 bar. |
| `npm run check:sync -- <video.mp4> <music_map.json>` | Phase 2: every kick flash lands on the exact frame of its kick, and audio matches video to the last frame. |
| `npm run check:pipeline` | Phase 3 (app running, Test provider): spend ≤ the estimate shown; regenerating one clip bills one clip; cached requests are free; the hybrid render works. |
| `npx tsx scripts/checks/shorts-check.mts <projectId>` | Phase 4: the Shorts cut starts before the drop, and the drop lands on a cut, both in the edit plan and in the rendered pixels. |

## Folders

| Path | What |
|---|---|
| `app/`, `components/`, `hooks/` | Next.js UI and API routes |
| `lib/` | Shared logic: presets, providers, spend/cache, metadata, YouTube |
| `remotion/` | The video compositions (the browser preview and the renderer use the same code) |
| `node-worker/` | Render, generation, export and upload jobs |
| `worker/` | Python analysis (`worker/analysis/`) |
| `config/models.json` | AI models and prices (edit freely) |
| `db/schema.sql` | Database schema shared by every process |
| `projects/<id>/`, `data/` | Your audio, renders, generated clips, settings and keys *(git-ignored)* |

## Privacy

Everything runs on your machine. API keys are stored in `data/drop.db` (git-ignored). They're never sent back to the browser in full, never logged, and only sent to the provider you chose. Next.js telemetry is off.

Remotion is free for individuals and companies of up to 3 people, including commercial use.
