// Pure helpers for the Publish step (used by the UI and the checks).
import type { Section } from "./types";

type MapLike = { bpm: number; duration: number; downbeats: number[]; sections: Section[]; beats: number[]; onsets?: { kick: number[] }; envelopes?: { fps: number; rms: number[]; kick: number[] } };

export function biggestDropSection(map: MapLike): Section {
  const drops = map.sections.filter((s) => s.type === "drop");
  return [...(drops.length ? drops : map.sections)].sort((a, b) => b.energy - a.energy)[0];
}

/**
 * Shorts window: starts 2 bars before the biggest drop (so the drop hits ~4 s in) and runs
 * through up to 16 bars of the drop, kept within 15–45 s and snapped to bar lines.
 */
export function suggestShortWindow(map: MapLike, preBars = 2): { start: number; end: number } {
  const bar = (60 / map.bpm) * 4;
  const drop = biggestDropSection(map);
  const di = nearest(map.downbeats, drop.start);
  const start = map.downbeats[Math.max(0, di - preBars)] ?? Math.max(0, drop.start - preBars * bar);
  let end = Math.min(drop.end, drop.start + 16 * bar);
  if (end - start > 45) end = start + Math.floor(45 / bar) * bar;
  if (end - start < 15) end = Math.min(map.duration, start + Math.ceil(15 / bar) * bar);
  return { start, end: snapTo(map.downbeats, end, map.duration) };
}

export type SocialPreset = {
  id: string; label: string; platform: string; w: number; h: number;
  lengths: number[]; def: number; max: number; note: string; file: string;
};

/** Social formats. Lengths are seconds; "full" (max = Infinity) renders the whole track in that shape. */
export const SOCIAL_PRESETS: SocialPreset[] = [
  { id: "shorts", label: "YouTube Shorts", platform: "YouTube", w: 1080, h: 1920, lengths: [15, 30, 45, 60], def: 30, max: 180, note: "Up to 3 min. 30–60 s performs best.", file: "short" },
  { id: "tiktok", label: "TikTok", platform: "TikTok", w: 1080, h: 1920, lengths: [15, 30, 60, 90, 180], def: 30, max: 600, note: "Up to 10 min when uploaded. 20–60 s is the sweet spot.", file: "tiktok" },
  { id: "reels", label: "Instagram Reels", platform: "Instagram", w: 1080, h: 1920, lengths: [15, 30, 60, 90], def: 30, max: 180, note: "Up to 3 min. 15–30 s gets the most replays.", file: "reels" },
  { id: "feed", label: "Instagram / Facebook feed (4:5)", platform: "Instagram", w: 1080, h: 1350, lengths: [15, 30, 60], def: 30, max: 60, note: "Portrait post: takes the most space in the feed.", file: "feed-4x5" },
  { id: "square", label: "Square (1:1)", platform: "Any", w: 1080, h: 1080, lengths: [15, 30, 60], def: 30, max: 60, note: "Works everywhere, including X and Facebook.", file: "square" },
  { id: "full-vertical", label: "Full track, vertical", platform: "TikTok / YouTube", w: 1080, h: 1920, lengths: [], def: 0, max: Infinity, note: "The whole song in 9:16, for TikTok long videos or a vertical YouTube upload.", file: "full-vertical" },
];

/** A window of `seconds` that starts `preBars` before the biggest drop, snapped to bars and kept inside the track. */
export function windowForLength(map: MapLike, seconds: number, preBars = 2): { start: number; end: number } {
  if (!isFinite(seconds) || seconds <= 0 || seconds >= map.duration) return { start: 0, end: map.duration };
  const bar = (60 / map.bpm) * 4;
  const drop = biggestDropSection(map);
  const di = nearest(map.downbeats, drop.start);
  let start = map.downbeats[Math.max(0, di - preBars)] ?? Math.max(0, drop.start - preBars * bar);
  let end = start + Math.round(seconds / bar) * bar;
  if (end > map.duration) {
    end = map.duration;
    start = Math.max(0, snapTo(map.downbeats, end - seconds, end));
  }
  return { start, end: Math.min(map.duration, end) };
}

export function snapTo(sorted: number[], t: number, max: number): number {
  if (!sorted.length) return t;
  const v = sorted[nearest(sorted, t)];
  return Math.abs(max - t) < Math.abs(v - t) ? max : v;
}

function nearest(sorted: number[], t: number): number {
  let best = 0;
  for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i] - t) < Math.abs(sorted[best] - t)) best = i;
  return best;
}

/**
 * Thumbnail candidates: the most intense moments (high energy on drops), taken half a beat
 * after a kick so frames aren't washed out by kick flashes, spread across the track.
 */
export function thumbnailCandidates(map: MapLike, count = 8): number[] {
  const beat = 60 / map.bpm;
  const env = map.envelopes;
  const bar = beat * 4;
  // Drops score highest, then builds; quiet intros/breakdowns/outros only as a fallback.
  const weight: Record<string, number> = { drop: 1.3, build: 1, intro: 0.6, breakdown: 0.5, outro: 0.6 };
  const times: { t: number; score: number }[] = [];
  for (const s of map.sections) {
    for (const b of map.downbeats) {
      if (b < s.start || b >= s.end - beat) continue;
      const t = b + beat * 0.5;
      const e = env ? env.rms[Math.min(env.rms.length - 1, Math.floor(t * env.fps))] ?? 0 : s.energy;
      times.push({ t, score: e * (weight[s.type] ?? 1) });
    }
  }
  times.sort((a, b) => b.score - a.score);
  const picked: number[] = [];
  const minGap = Math.max(2 * bar, map.duration / (count * 4));
  for (const c of times) {
    if (picked.every((p) => Math.abs(p - c.t) > minGap)) picked.push(c.t);
    if (picked.length >= count) break;
  }
  return picked.sort((a, b) => a - b).map((t) => Math.round(t * 1000) / 1000);
}
