// The musical edit: where every cut lands, what's on screen, and how we transition.
import type { PresetConfig, SceneId, StyleConfig, TransitionId } from "../../lib/presets/configs";
import type { RenderMode, SectionType } from "../../lib/types";
import type { BridgeRef, ClipRef, LiteMap } from "../types";
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
  /** AI morph segment: plays a first→last-frame clip from the previous shot into the next one. */
  bridge?: { src: string; duration: number; from: string; to: string } | null;
};

/** Where an AI morph would go: the last `W` seconds before section boundary `T`, from clip A to clip B. */
export type MorphSlot = { T: number; W: number; from: string; to: string };

/** Morph slots for this edit: 2 bars before each section change (or only drops) between two AI shots. */
export function morphPlan(segs: Segment[], map: LiteMap, style: StyleConfig, override?: StyleConfig["morph"]): MorphSlot[] {
  const mode = override ?? style.morph ?? "off";
  if (mode === "off") return [];
  const bar = (60 / map.bpm) * 4;
  const out: MorphSlot[] = [];
  map.sections.forEach((sec, si) => {
    if (si === 0 || (mode === "drops" && sec.type !== "drop")) return;
    const prev = map.sections[si - 1];
    const T = sec.start;
    const W = Math.min(2 * bar, (prev.end - prev.start) / 2);
    if (W < bar * 0.5) return;
    const a = segs[segmentAt(segs, T - W + 1e-3)];
    const b = segs[segmentAt(segs, T + 1e-3)];
    if (!a?.clip || !b?.clip || a.section === b.section || a.clip.ref.id === b.clip.ref.id) return;
    out.push({ T, W, from: a.clip.ref.id, to: b.clip.ref.id });
  });
  return out;
}

/** Swap the time before each planned boundary for its morph clip (only where one has been generated). */
function applyMorphs(segs: Segment[], slots: MorphSlot[], bridges: BridgeRef[], beat: number): Segment[] {
  let out = segs;
  for (const s of slots) {
    const br = bridges.find((b) => b.from === s.from && b.to === s.to);
    if (!br) continue;
    const t0 = s.T - s.W;
    const next: Segment[] = [];
    let inserted = false;
    for (const g of out) {
      if (g.end <= t0 + 1e-6 || g.start >= s.T - 1e-6) {
        if (!inserted && g.start >= s.T - 1e-6) {
          next.push(bridgeSeg(out, t0, s, br, beat));
          inserted = true;
        }
        // the shot we morph into starts from its first frame (the morph ends on its keyframe)
        if (g.clip && Math.abs(g.start - s.T) < 1e-6) next.push({ ...g, clip: { ...g.clip, offset: 0 } });
        else next.push(g);
      } else if (g.start < t0 - 1e-6) {
        // cut the shot that is playing when the morph starts
        const len = t0 - g.start;
        if (len > 0.08) next.push({ ...g, end: t0, transitionSeconds: Math.min(g.transitionSeconds, len * 0.5) });
      }
    }
    if (!inserted) next.push(bridgeSeg(out, t0, s, br, beat));
    out = next.map((g, i) => ({ ...g, index: i }));
  }
  return out;
}

function bridgeSeg(segs: Segment[], t0: number, s: MorphSlot, br: BridgeRef, beat: number): Segment {
  const a = segs[segmentAt(segs, t0 + 1e-3)];
  return {
    ...a, start: t0, end: s.T, clip: null, transition: "crossfade", transitionSeconds: Math.min(beat * 0.5, s.W * 0.25),
    bridge: { src: br.src, duration: br.duration, from: br.from, to: br.to },
  };
}

const cache = new Map<string, Segment[]>();

/** Which sections get AI footage in each mode. */
export function usesClips(mode: RenderMode, type: SectionType): boolean {
  if (mode === "montage") return true;
  if (mode === "hybrid") return type === "drop" || type === "build";
  return false;
}

export function buildTimeline(map: LiteMap, preset: PresetConfig, style: StyleConfig, mode: RenderMode, clips: ClipRef[], bridges: BridgeRef[] = []): Segment[] {
  const key = `${map.duration}|${map.sections.map((s) => `${s.type}${s.start}`).join(",")}|${preset.id}|${style.cutRate}|${style.transitionMode}|${style.editStyle}|${style.morph}|${mode}|${clips.map((c) => c.id + (c.matteSrc ? "m" : "")).join(",")}|${bridges.map((b) => b.from + b.to).join(",")}|${map.beats[0]}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const beat = 60 / map.bpm;
  const drops = map.sections.map((s, i) => ({ s, i })).filter((x) => x.s.type === "drop");
  const biggest = drops.sort((a, b) => b.s.energy - a.s.energy)[0]?.i ?? -1;
  const segs: Segment[] = [];
  const clipUse = new Map<string, number>();

  // CapCut-style music-video rhythm: fast cuts on drops, builds that accelerate into the drop.
  const capcut = style.editStyle === "capcut";
  const performance = style.editStyle === "performance";
  const teaser = style.editStyle === "teaser";
  // Cinematic (Higgsfield style): each AI shot plays its camera move from the start, cut on 2-bar lines.
  const cinematic = style.editStyle === "cinematic";
  const CAPCUT_BEATS: Record<string, number> = { intro: 8, build: 4, drop: 2, breakdown: 8, outro: 8 };
  map.sections.forEach((sec, si) => {
    const baseBeats = capcut ? CAPCUT_BEATS[sec.type] : performance || teaser ? 16 : cinematic ? (sec.type === "drop" || sec.type === "build" ? 8 : 16) : preset.cutBeats[sec.type];
    const unitBeats = Math.max(1, Math.round(baseBeats / style.cutRate));
    const peakBeats = Math.max(1, Math.round((capcut ? 1 : preset.peakCutBeats) / style.cutRate));
    // Beat times inside this section; cuts land on beats counted from the section start (a downbeat).
    const beats = map.beats.filter((b) => b >= sec.start - 1e-3 && b < sec.end - 1e-3);
    const bounds: number[] = [sec.start];
    let k = 0;
    while (k < beats.length) {
      const half = si === biggest && beats[k] >= (sec.start + sec.end) / 2;
      let step = half ? peakBeats : unitBeats;
      // Teaser: a burst of 1-beat flash cuts on the drop, then long holds again.
      if (teaser && sec.type === "drop") {
        const nIn = k; // beats into the drop
        step = nIn < 4 ? 1 : 8;
      }
      if (capcut && sec.type === "build") {
        const q = (beats[k] - sec.start) / Math.max(0.01, sec.end - sec.start);
        step = q > 0.75 ? 1 : q > 0.5 ? 2 : unitBeats; // accelerate into the drop
      }
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
      if (cinematic && (style.transitionMode ?? "preset") === "preset" && index > 0) {
        transition = sec.type === "drop" && j === 0 ? "flash" : sec.type === "breakdown" || sec.type === "intro" ? "crossfade" : j === 0 ? "whip_pan" : "cut";
      }
      if ((performance || teaser) && (style.transitionMode ?? "preset") === "preset" && index > 0) {
        transition = teaser && sec.type === "drop" && bounds[j] - sec.start < beat * 4.5 ? "flash" : "crossfade";
      }
      // CapCut rhythm transitions (unless the user picked a transition style).
      if (capcut && (style.transitionMode ?? "preset") === "preset" && index > 0) {
        if (sec.type === "drop") transition = j === 0 ? "flash" : "cut";
        else if (sec.type === "build") transition = j === 0 ? "zoom_blur" : j % 2 ? "whip_pan" : "zoom_blur";
        else if (sec.type === "breakdown") transition = "crossfade";
        else transition = j === 0 ? "crossfade" : "cut";
      }
      // Style override: HyperFrames-style transitions on cuts (the drop keeps its preset entrance for impact).
      const tm = style.transitionMode ?? "preset";
      if (tm !== "preset" && index > 0 && !(j === 0 && sec.type === "drop")) {
        const MODE: Record<string, TransitionId> = { whip: "whip_pan", zoom: "zoom_through", chroma: "chroma_wipe", push: "push_wipe", pixelate: "pixelate", freeze: "freeze_cut", white: "white_through", zoomblur: "zoom_blur" };
        const ALL = Object.values(MODE);
        transition = tm === "mix" ? ALL[(index + Math.floor(rand(seed * 41) * 3)) % ALL.length] : MODE[tm] ?? transition;
      }
      const transitionSeconds =
        transition === "crossfade" ? Math.min((capcut || teaser ? 2 : performance ? 3 : preset.transitions.beats) * beat, (bounds[j + 1] - bounds[j]) * 0.5)
        : transition === "cut" ? 0
        : transition === "flash" ? beat * 0.75
        : transition === "whip_pan" ? Math.min(beat, (bounds[j + 1] - bounds[j]) * 0.5)
        : transition === "zoom_through" || transition === "chroma_wipe" || transition === "pixelate" ? Math.min(2 * beat, (bounds[j + 1] - bounds[j]) * 0.5)
        : transition === "push_wipe" || transition === "white_through" || transition === "zoom_blur" ? Math.min(beat, (bounds[j + 1] - bounds[j]) * 0.5)
        : transition === "freeze_cut" ? Math.min(beat * 0.5, (bounds[j + 1] - bounds[j]) * 0.5)
        : beat * 0.5;

      let clip: Segment["clip"] = null;
      if (clips.length && (usesClips(mode, sec.type) || performance || teaser || cinematic)) {
        // Artist formats feature you: prefer your character clips everywhere.
        const mine = clips.filter((c) => c.character);
        const pool = (performance || teaser || cinematic) && mine.length ? mine : clips.filter((c) => c.section === sec.type);
        const from = pool.length ? pool : clips;
        // Round-robin per section type so every clip gets used before any repeats.
        const n = clipUse.get(sec.type) ?? 0;
        clipUse.set(sec.type, n + 1);
        const ref = from[(n + si) % from.length];
        // Forward playback only (reversed AI footage looks wrong), gentle speed variety, slight crop.
        const speeds = capcut || cinematic ? [1] : performance ? [0.6] : teaser ? [0.75] : [0.75, 1, 1, 1.25];
        const speed = speeds[Math.floor(rand(seed * 5) * speeds.length)];
        const segLen = bounds[j + 1] - bounds[j];
        clip = {
          ref,
          speed,
          // never mirror footage of you (faces aren't symmetric, text on clothes flips)
          mirror: !cinematic && !ref.character && rand(seed * 11) < 0.2,
          reverse: false,
          zoom: cinematic ? 1 : 1 + rand(seed * 19) * 0.06,
          // start where the cut can play through without looping
          // cinematic: start at the beginning so the AI camera move plays from its first frame
          offset: cinematic ? 0 : rand(seed * 23) * Math.max(0, ref.duration - 0.1 - segLen * speed),
        };
      }
      segs.push({ index, start: bounds[j], end: bounds[j + 1], section: si, type: sec.type, scene, seed, transition, transitionSeconds, clip });
    }
  });

  const final = bridges.length ? applyMorphs(segs, morphPlan(segs, map, style), bridges, beat) : segs;
  if (cache.size > 20) cache.clear();
  cache.set(key, final);
  return final;
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
/** Clip time for a moment `local` seconds into its cut. Always forward; a cut longer than the
 *  clip jumps back to the start (rare: cuts are short and offsets leave room). */
export function clipTime(c: NonNullable<Segment["clip"]>, local: number): number {
  const d = Math.max(0.1, c.ref.duration - 0.05);
  const x = c.offset + Math.max(0, local) * c.speed;
  return x < d ? x : x % d;
}

/** CapCut "velocity" ramp within one cut: bursts in at ~2.3x, eases to ~0.35x slow motion by the
 *  next cut, averaging real time (u: 0..1 through the cut, returns 0..1). */
export function velocityRamp(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return 0.35 * x + 0.65 * (1 - Math.pow(1 - x, 3));
}
