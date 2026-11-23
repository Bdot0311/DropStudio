---
name: dropstudio-effects
description: Use when adding or changing a visual effect, caption style, transition or edit style in Drop Studio's videos (remotion/), including porting an effect from the vendored HyperFrames skills/registry. Explains where effects live, the determinism and beat-sync rules, and how to verify a change.
---

# Drop Studio effects

Drop Studio renders with **Remotion** (React), not HyperFrames. The vendored `hyperframes`, `hyperframes-registry` and `hyperframes-cli` skills are a **reference library**: use them to find an effect's look and motion (registry components live at `github.com/heygen-com/hyperframes/tree/main/registry/components/<name>`, and `npx hyperframes add <name>` fetches one into a scratch folder), then **re-implement** it in Remotion here. Never add HyperFrames HTML/GSAP to the render path.

## Where things live

| What | File |
|---|---|
| Per-frame picture: layers, transitions, kick flash/zoom, grade | `remotion/Visual.tsx` |
| CapCut edit style: velocity surges, beat punches, build-up strobe, drop slam, RGB split, light leaks, letterbox, kinetic captions | `remotion/EditFx.tsx` |
| Caption looks (ported from HyperFrames: slam, glitch, karaoke, neon, gradient, decode, char-slam) | `remotion/captionStyles.tsx` |
| Shutter slam (drop text), light sweep, camera shake and beat accent, ported from HyperFrames | `remotion/fxPorts.tsx` |
| Effects pack ported from HyperFrames: camera moves (parallax zoom/unzoom, dolly), transitions (chroma wipe, push, pixelate, freeze cut, flash white, zoom blur), looks (anamorphic flare, light leaks, VHS/CRT, halftone), waveform overlay | `remotion/fxPack.tsx` |
| Cut transitions ported from HyperFrames (whip pan, zoom through) | `remotion/transitions.tsx` (used in `Visual.tsx`, chosen in `remotion/lib/timeline.ts`) |
| Shader scenes (GLSL) | `remotion/gl/shaders.ts` |
| Musical edit plan: where cuts land, which scene/clip, transitions | `remotion/lib/timeline.ts` |
| Beat/bar/envelope helpers | `remotion/lib/music.ts` |
| Genre presets (scenes, cut rhythm, transitions, reactive mapping, typography) | `lib/presets/configs.ts` |
| Per-project style options (+ sanitising) | `lib/presets/configs.ts` (`StyleConfig`, `DEFAULT_STYLE`), `lib/style.ts` |
| Style page UI | `app/projects/[id]/style/page.tsx` |

## Rules (an effect that breaks these is wrong, however good it looks)

1. **Pure function of song time.** Compute everything from `t` (song seconds) and `frame`. No `Date.now()`, `Math.random()`, timers or CSS animations/transitions; use `rand(seed)` from `remotion/lib/music.ts` for noise. The browser preview and the chunked, parallel render must produce identical frames.
2. **Musical time, not wall time.** Get beats, bars and phases from `beatInfo(map, t)`. Get section types from `map.sections` and hits from `map.env.kick` (`envMax` over the frame), `map.kicks`, `map.claps` and `map.hats`. Land accents on beats/downbeats and big moves on section starts (drops).
3. **Composition-relative where it matters.** Captions and end cards work off the video's own window (`startTime` … `startTime + duration`), so they also work for social cuts and loops. Loops and thumbnails pass `noCaptions`.
4. **Resolution-independent.** Size with `useVideoConfig()` (`Math.min(width, height)`). The same code renders 1080p, 4K, 9:16, 4:5 and 1:1.
5. **New style options** go into `StyleConfig` + `DEFAULT_STYLE`, get clamped/validated in `lib/style.ts`, and get a control on the Style page. Old `style.json` files must keep working through the defaults.
6. **Porting credit.** HyperFrames is Apache-2.0 (`.claude/skills/HYPERFRAMES-LICENSE`). When you port a component, name it in a comment at the top of the code.

## Porting a HyperFrames effect

1. Find it with the `hyperframes-registry` skill and read the component's header comment: it states the envelope (IN / HOLD / OUT), the variables and the motion recipe.
2. Translate GSAP tweens into closed-form easing over a progress value (`clamp01((t - start) / dur)` plus `backOut` / `elasticOut` / `easeOut`). A "stage shake" becomes `rand(frame * k)` offsets inside a short window.
3. Tie its trigger to the music: a beat, a downbeat, a clap, a section start, or the countdown into the drop.
4. Add it as an option, not a replacement, unless asked.

## Verify

- `npx tsc --noEmit`
- Render a short cut and look at frames:
  ```bash
  curl -X POST -H 'content-type: application/json' \
    -d '{"kind":"short","name":"fx-test","startTime":<drop-4bars>,"duration":12,"width":540,"height":960}' \
    http://localhost:3000/api/projects/<id>/render
  ffmpeg -ss 2 -i projects/<id>/renders/fx-test.mp4 -frames:v 1 frame.png
  ```
- If you touched kick timing or `Visual.tsx`'s flash logic, re-run the sync check in **Clean** mode:
  `npm run check:sync -- projects/<id>/renders/main.mp4 projects/<id>/music_map.json` (must PASS).
- `npx tsx scripts/checks/shorts-check.mts <id>` must still PASS: the drop lands on a cut.
