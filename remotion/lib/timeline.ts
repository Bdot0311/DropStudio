// The musical edit: where every cut lands, what's on screen, and how we transition.
import type { PresetConfig, SceneId, StyleConfig, TransitionId } from "../../lib/presets/configs";
import type { RenderMode, SectionType } from "../../lib/types";
import type { ClipRef, LiteMap } from "../types";
import { rand } from "./music";

export type Segment = {
  index: number;
  start: number; // seconds (always on a beat)
  end: number;
  section: number;
  type: SectionType;
  scene: SceneId;
  seed: number;
  transition: TransitionId;
  transitionSeconds: number;
  clip: null | { ref: ClipRef; speed: number; mirror: boolean; reverse: boolean; zoom: number; offset: number };
};

const cache = new Map<string, Segment[]>();

/** Which sections get AI footage in each mode. */
export function usesClips(mode: RenderMode, type: SectionType): boolean {
  if (mode === "montage") return true;
  if (mode === "hybrid") return type === "drop" || type === "build";
  return false;
}

export function buildTimeline(map: LiteMap, preset: PresetConfig, style: StyleConfig, mode: RenderMode, clips: ClipRef[]): Segment[] {
  const key = `${map.duration}|${map.sections.map((s) => `${s.type}${s.start}`).join(",")}|${preset.id}|${style.cutRate}|${style.transitionMode}|${mode}|${clips.map((c) => c.id).join(",")}|${map.beats[0]}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const beat = 60 / map.bpm;
  const drops = map.sections.map((s, i) => ({ s, i })).filter((x) => x.s.type === "drop");
  const biggest = drops.sort((a, b) => b.s.energy - a.s.energy)[0]?.i ?? -1;
  const segs: Segment[] = [];
  const clipUse = new Map<string, number>();

  map.sections.forEach((sec, si) => {
    const unitBeats = Math.max(1, Math.round(preset.cutBeats[sec.type] / style.cutRate));
    const peakBeats = Math.max(1, Math.round(preset.peakCutBeats / style.cutRate));
    // Beat times inside this section; cuts land on beats counted from the section start (a downbeat).
    const beats = map.beats.filter((b) => b >= sec.start - 1e-3 && b < sec.end - 1e-3);
    const bounds: number[] = [sec.start];
    let k = 0;
    while (k < beats.length) {
      const half = si === biggest && beats[k] >= (sec.start + sec.end) / 2;
      const step = half ? peakBeats : unitBeats;
      k += step;
      if (k < beats.length && beats[k] < sec.end - beat * 0.5) bounds.push(beats[k]);
    }
    bounds.push(sec.end);

    for (let j = 0; j < bounds.length - 1; j++) {
      const index = segs.length;
      const seed = rand(index * 7.13 + si * 3.7 + 1);
      const scenes = preset.scenes[sec.type];
      const scene = scenes[(j + si) % scenes.length];
      let transition: TransitionId;
      if (j === 0) transition = index === 0 ? "cut" : preset.transitions.enter[sec.type];
      else {
        const w = preset.transitions.within;
        transition = rand(seed * 91) < preset.reactive.glitch ? "glitch" : w[Math.floor(rand(seed * 17) * w.length)];
      }
      // Style override: HyperFrames-style transitions on cuts (the drop keeps its preset entrance for impact).
      const tm = style.transitionMode ?? "preset";
      if (tm !== "preset" && index > 0 && !(j === 0 && sec.type === "drop")) {
        const MODE: Record<string, TransitionId> = { whip: "whip_pan", zoom: "zoom_through", chroma: "chroma_wipe", push: "push_wipe", pixelate: "pixelate", freeze: "freeze_cut", white: "white_through", zoomblur: "zoom_blur" };
        const ALL = Object.values(MODE);
        transition = tm === "mix" ? ALL[(index + Math.floor(rand(seed * 41) * 3)) % ALL.length] : MODE[tm] ?? transition;
      }
      const transitionSeconds =
        transition === "crossfade" ? Math.min(preset.transitions.beats * beat, (bounds[j + 1] - bounds[j]) * 0.5)
        : transition === "cut" ? 0
        : transition === "flash" ? beat * 0.75
        : transition === "whip_pan" ? Math.min(beat, (bounds[j + 1] - bounds[j]) * 0.5)
        : transition === "zoom_through" || transition === "chroma_wipe" || transition === "pixelate" ? Math.min(2 * beat, (bounds[j + 1] - bounds[j]) * 0.5)
        : transition === "push_wipe" || transition === "white_through" || transition === "zoom_blur" ? Math.min(beat, (bounds[j + 1] - bounds[j]) * 0.5)
        : transition === "freeze_cut" ? Math.min(beat * 0.5, (bounds[j + 1] - bounds[j]) * 0.5)
        : beat * 0.5;

      let clip: Segment["clip"] = null;
      if (clips.length && usesClips(mode, sec.type)) {
        const pool = clips.filter((c) => c.section === sec.type);
        const from = pool.length ? pool : clips;
        // Round-robin per section type so every clip gets used before any repeats.
        const n = clipUse.get(sec.type) ?? 0;
        clipUse.set(sec.type, n + 1);
        const ref = from[(n + si) % from.length];
        const speeds = [0.5, 0.75, 1, 1, 1.25];
        const speed = speeds[Math.floor(rand(seed * 5) * speeds.length)];
        clip = {
          ref,
          speed,
          mirror: rand(seed * 11) < 0.4,
          reverse: rand(seed * 13) < 0.25,
          zoom: 1 + rand(seed * 19) * 0.25,
          offset: rand(seed * 23) * Math.max(0, ref.duration - 1),
        };
      }
      segs.push({ index, start: bounds[j], end: bounds[j + 1], section: si, type: sec.type, scene, seed, transition, transitionSeconds, clip });
    }
  });

  if (cache.size > 20) cache.clear();
  cache.set(key, segs);
  return segs;
}

export function segmentAt(segs: Segment[], t: number): number {
  let lo = 0, hi = segs.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= t + 1e-6) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Ping-pong clip time so a 5 s clip can fill any segment length without a visible jump. */
export function clipTime(c: NonNullable<Segment["clip"]>, local: number): number {
  const d = Math.max(0.1, c.ref.duration - 0.05);
  let x = c.offset + local * c.speed;
  const period = 2 * d;
  x = ((x % period) + period) % period;
  let t = x <= d ? x : period - x;
  if (c.reverse) t = d - t;
  return t;
}
