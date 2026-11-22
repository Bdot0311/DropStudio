// Pure helpers for reading the music map at a point in time.
import type { LiteMap } from "../types";

export function envAt(arr: number[], fps: number, t: number): number {
  if (!arr.length) return 0;
  const i = Math.min(arr.length - 1, Math.max(0, Math.floor(t * fps + 1e-6)));
  return arr[i];
}

/** Max of an envelope over [t, t + span): a hit anywhere inside a video frame shows on that frame. */
export function envMax(arr: number[], fps: number, t: number, span: number): number {
  if (!arr.length) return 0;
  const a = Math.max(0, Math.floor(t * fps + 1e-6));
  const b = Math.min(arr.length - 1, Math.max(a, Math.ceil((t + span) * fps - 1e-6) - 1));
  let m = 0;
  for (let i = a; i <= b; i++) if (arr[i] > m) m = arr[i];
  return m;
}

/** Index of the last element <= t (binary search), or -1. */
export function lastIndexAtOrBefore(sorted: number[], t: number): number {
  let lo = 0, hi = sorted.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t + 1e-6) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function beatInfo(map: LiteMap, t: number) {
  const bi = lastIndexAtOrBefore(map.beats, t);
  const period = 60 / map.bpm;
  const b0 = bi >= 0 ? map.beats[bi] : 0;
  const b1 = bi + 1 < map.beats.length ? map.beats[bi + 1] : b0 + period;
  const phase = bi >= 0 ? Math.min(1, (t - b0) / (b1 - b0)) : 0;
  const bar = lastIndexAtOrBefore(map.downbeats, t); // 0-based, -1 before bar 1
  const firstDb = map.downbeats[0] ?? 0;
  const dbBeat = lastIndexAtOrBefore(map.beats, firstDb + 1e-3);
  const beatInBar = bi >= 0 ? (((bi - dbBeat) % 4) + 4) % 4 : 0;
  return { beatIndex: bi, phase, bar, beatInBar };
}

/** Cumulative "motion time": the visuals move faster when the music is louder. */
const motionCache = new WeakMap<number[], Float32Array>();
export function motionTime(map: LiteMap, t: number): number {
  const rms = map.env.rms;
  let cum = motionCache.get(rms);
  if (!cum) {
    cum = new Float32Array(rms.length + 1);
    for (let i = 0; i < rms.length; i++) cum[i + 1] = cum[i] + (0.45 + 0.9 * rms[i]) / map.env.fps;
    motionCache.set(rms, cum);
  }
  const x = t * map.env.fps;
  const i = Math.min(cum.length - 1, Math.max(0, Math.floor(x)));
  const frac = Math.min(1, Math.max(0, x - i));
  const next = Math.min(cum.length - 1, i + 1);
  return cum[i] + (cum[next] - cum[i]) * frac;
}

export function sectionAt(map: LiteMap, t: number): number {
  for (let i = map.sections.length - 1; i >= 0; i--) if (map.sections[i].start <= t + 1e-6) return i;
  return 0;
}

/** Deterministic pseudo-random in [0,1). */
export function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Rotate a colour's hue by `deg` (same maths as CSS hue-rotate). */
export function hueRotate([r, g, b]: [number, number, number], deg: number): [number, number, number] {
  if (!deg) return [r, g, b];
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const m = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  return [cl(m[0] * r + m[1] * g + m[2] * b), cl(m[3] * r + m[4] * g + m[5] * b), cl(m[6] * r + m[7] * g + m[8] * b)];
}
