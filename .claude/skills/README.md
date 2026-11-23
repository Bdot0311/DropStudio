# Claude Code skills for this project

Claude Code loads these automatically when you work on Drop Studio with it.

| Skill | Source | Purpose |
|---|---|---|
| `dropstudio-effects` | Drop Studio | How to add or port effects, caption styles and transitions in `remotion/`, and how to verify them. |
| `hyperframes` | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) `skills/hyperframes` | HyperFrames' video-making knowledge (motion, captions, music videos, rhythm). Used as a reference library. |
| `hyperframes-registry` | same, `skills/hyperframes-registry` | Finds effects, transitions and caption styles in the HyperFrames registry. |
| `hyperframes-cli` | same, `skills/hyperframes-cli` | The `npx hyperframes` commands (fetch registry items, beat analysis, previews). |

The three HyperFrames skills are vendored from commit `effc958` under the Apache License 2.0 (`HYPERFRAMES-LICENSE`).

**Changes made:** the "Usage beacon" instruction (which sends a telemetry event to HeyGen each time a skill starts) was removed from each `SKILL.md`, so nothing leaves your machine unless you run a HyperFrames command yourself. Nothing else was changed.

To update them, copy `skills/<name>` from a newer HyperFrames checkout over these folders and remove the beacon line again.
