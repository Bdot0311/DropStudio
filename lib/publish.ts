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
