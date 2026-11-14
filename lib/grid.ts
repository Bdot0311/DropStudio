// Beat-grid helpers used by the waveform editor (client) and the API (server).
import type { Phrase, Section, SectionType } from "./types";

export function nearestIndex(sorted: number[], t: number): number {
  if (!sorted.length) return -1;
  let lo = 0, hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(sorted[lo - 1] - t) <= Math.abs(sorted[lo] - t)) return lo - 1;
  return lo;
}

export function snap(sorted: number[], t: number): number {
  const i = nearestIndex(sorted, t);
  return i < 0 ? t : sorted[i];
}

/** Bar number (1-based) and beat (1-4) at time t. */
export function barBeat(beats: number[], downbeats: number[], t: number): { bar: number; beat: number } {
  if (!downbeats.length) return { bar: 0, beat: 0 };
  let bar = 0;
  for (let i = 0; i < downbeats.length && downbeats[i] <= t + 1e-3; i++) bar = i + 1;
  const bi = nearestIndex(beats, t);
  const dbi = nearestIndex(beats, downbeats[0]);
  const beat = (((bi - dbi) % 4) + 4) % 4 + 1;
  return { bar, beat: bar === 0 ? 0 : beat };
}

/** Make every beat with index ≡ phase (mod 4) a downbeat, where phase comes from the beat nearest `t`. */
export function regridDownbeats(beats: number[], t: number): number[] {
  const i = nearestIndex(beats, t);
  const phase = ((i % 4) + 4) % 4;
  return beats.filter((_, j) => j % 4 === phase);
}

/** Snap all section boundaries to downbeats; keep the track fully covered and every section ≥ 1 bar. */
export function normalizeSections(sections: Section[], downbeats: number[], duration: number): Section[] {
  const s = [...sections].sort((a, b) => a.start - b.start).map((x) => ({ ...x }));
  for (let i = 1; i < s.length; i++) s[i].start = snap(downbeats, s[i].start);
  s[0].start = 0;
  const out: Section[] = [];
  for (const x of s) {
    if (out.length && x.start <= out[out.length - 1].start + 1e-3) continue; // collapsed to the same bar
    out.push(x);
  }
  for (let i = 0; i < out.length; i++) {
    out[i].end = i + 1 < out.length ? out[i + 1].start : duration;
    out[i].bars = countBars(downbeats, out[i].start, out[i].end);
  }
  return out;
}

export function countBars(downbeats: number[], start: number, end: number): number {
  return downbeats.filter((d) => d >= start - 1e-3 && d < end - 1e-3).length;
}

/** Same rule as the Python worker: 16-bar phrases, 8 when that's what fits, remainder otherwise. */
export function phrasesFromSections(sections: Section[], downbeats: number[]): Phrase[] {
  const out: Phrase[] = [];
  for (const s of sections) {
    const bars = downbeats.filter((t) => t >= s.start - 1e-3 && t < s.end - 1e-3);
    let i = 0;
    while (i < bars.length) {
      const rem = bars.length - i;
      const size = rem >= 16 ? 16 : rem >= 8 ? 8 : rem;
      out.push({ start: bars[i], bars: size, section: s.type });
      i += size;
    }
  }
  return out;
}

export const SECTION_COLORS: Record<SectionType, { fill: string; solid: string }> = {
  intro: { fill: "rgba(96, 165, 250, 0.16)", solid: "#60a5fa" },
  build: { fill: "rgba(251, 191, 36, 0.16)", solid: "#fbbf24" },
  drop: { fill: "rgba(244, 63, 94, 0.22)", solid: "#f43f5e" },
  breakdown: { fill: "rgba(45, 212, 191, 0.16)", solid: "#2dd4bf" },
  outro: { fill: "rgba(167, 139, 250, 0.16)", solid: "#a78bfa" },
};

export function fmtTime(t: number): string {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
