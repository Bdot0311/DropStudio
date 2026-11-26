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

It also adds kinetic captions: a hook that pops in word by word, a 3·2·1 countdown, drop text whose letters fly together on the drop, and an end card. Cut transitions can be switched to HyperFrames-style **whip pan** (one beat, motion blur) or **zoom through** (two beats, light sweep and RGB flicker), or a mix. The drop text can use HyperFrames' **shutter slam** (six beat-locked moves with real motion blur), and **light sweep** adds a key-light band across the frame every phrase. **Camera shake** uses HyperFrames' measured handheld/rig profiles (strength follows the music's loudness), and **beat accent** adds an impact flash, scale pulse and jolt on each drop or every bar of a drop. Captions come in six styles ported from [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0): kinetic slam, RGB glitch, karaoke pill, neon glow, gradient bounce and matrix decode.

### The Director (Higgsfield / OpenArt-style shots)

Every storyboard shot is designed like a music-video shot:
- a **shot type**: extreme wide, close-up, low-angle hero, silhouette and so on;
- a **camera move** for the video model: crash zoom, 360° orbit, bullet time, FPV dive, crane up, dolly zoom, push-through and more;
- a **VFX moment**: particle burst, lightning, levitation, light trails, slow-mo wind, shattering glass, rain, smoke, lasers.

All shots share one **story world and wardrobe**, which you can edit on the Storyboard. Keyframes get a cinematic still prompt, and the video model gets a separate motion prompt (camera + action + VFX). You can change the camera move or VFX per shot; only that clip is re-generated.

Models (Settings): fal runs the real third-party models. The defaults are **Seedream 4.5** (ByteDance) for keyframes, **Nano Banana Pro** (Google) for shots of you, and **Kling 3.0 Pro** (Kuaishou) for Final clips, about $0.56 per 5 s clip. **Veo 3.1** (Google), **Seedance 1.0 Pro**, **Seedance 2.0** and **Hailuo 02 Pro** are premium options; Kling 2.6/2.5, Veo 3.1 Fast, Wan, FLUX and Qwen are cheaper ones. If you picked cheap models earlier, Settings shows a **Use recommended** button.

**Every fal.ai model, Higgsfield-style.** Click **Change** next to any model (Settings, Storyboard, Generate, or the morph pass) to open the model browser: fal's whole live catalog for that job (about 180 video, 180 image and 360 image-edit models), with previews, prices (with your fal key), search and a Newest tab. **Featured** ones are tested with Drop Studio. For any other, Drop Studio reads the model's inputs when you pick it (which field takes the prompt, start image, end frame or reference photos; it sets 16:9, about 5 s, 1080p and audio off) and refuses models it can't drive, with the reason, such as lip-sync models that need an audio file. Reference-to-video models also get your photos for likeness. `npx tsx scripts/checks/fal-catalog-check.mts` lists which catalog models work. Keyframe quality matters most: the video model can only animate what's in the keyframe. The **Cinematic** format plays each clip's camera move at real speed, from its first frame, cut on 2-bar lines with a flash on the drop.

### Finishing touches (Generate step)

Three optional paid passes on top of your clips. Each shows its cost first, and finished results are cached:

| Pass | What it does | Model (fal) | Cost |
|---|---|---|---|
| **AI morph transitions** | The last 2 bars before a section change melt from one shot into the next, landing on the drop. Switch on in Style → *AI morph transitions* (into drops, or every section). | Wan 2.2 A14B first→last frame | ≈ $0.40 per morph |
| **Upscale to 1080p** | Sharpens Draft-tier (480p/720p) clips so they hold up in a 1080p video. Clips that are already sharp are skipped. | SeedVR2 | ≈ $0.25 per 5 s clip |
| **Captions behind you** | Cuts the subject out of every clip, so the drop text and captions sit behind you. Switch on in Style → *Captions behind you*. | BiRefNet video | ≈ $0.03 per clip (approximate) |

If you regenerate a clip, its old upscale, cut-out and morphs are retired automatically. Safari can't preview transparent video, so the text-behind effect shows in the rendered file (and in Chrome previews), not in Safari's preview.

### Your character and artist formats

Upload 1–4 photos of yourself on the Upload step ("Your character"). Shots marked **★ You** on the Storyboard are generated with a reference-image model, FLUX Kontext Pro by default (≈$0.04 per image). You can pick Nano Banana or Ideogram Character in Settings. Image-to-video then animates you, so the same person appears across the clips. Never upload someone else's photos without their permission.

Two artist-first formats (Style → Edit style), modelled on real artist posts:
- **Performance:** long slow-motion shots of you with soft crossfades (no hard cuts), an optional 16:9 band inside the vertical frame, a small persistent top caption, and your lyric words one at a time in bold gold on the beat.
- **Teaser:** long moody holds, a burst of 1-beat flash cuts on the drop, then a black release-date card and your @handle.

### Effects ported from HyperFrames (all on the Style page)

| Group | Options |
|---|---|
| Transitions on cuts | whip pan, zoom through, chromatic-aberration wipe, push, grid pixelate, beat freeze-cut, flash through white, zoom blur, or **Mix all** |
| Camera | parallax zoom in/out per cut, alternating, dolly zoom on builds; measured handheld/rig camera shake |
| Hits | beat accent (impact flash + pulse + jolt) on drops or every bar; shutter-slam or letter-explode drop text |
| Looks | anamorphic flares on kicks, organic light leaks, VHS/CRT, LED-wall halftone, light sweep each phrase, letterbox |
| Overlay | equalizer bars or mirrored waveform driven by your track |
| Captions | kinetic slam, RGB glitch, karaoke pill, neon, gradient, matrix decode, TikTok highlight, clip wipe, blur-in |

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
| `node scripts/checks/finishing-check.mjs <projectId>` | Finishing passes (app running, Test provider): upscale, cut-out and morph each bill exactly their estimate, asking again is free, and the editor and a render use all three. |
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
