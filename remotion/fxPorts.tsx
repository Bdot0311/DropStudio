// Effects ported from the HyperFrames registry (Apache-2.0, github.com/heygen-com/hyperframes):
//   shutter-slam     → <ShutterSlam>  (drop text animation, beat-locked)
//   light-sweep-pass → <LightSweep>   (key-light band once per phrase, then a resting key)
// Re-implemented as pure functions of song time, keeping HyperFrames' motion values.
import React from "react";
import { AbsoluteFill } from "remotion";
import { StyledCaption, type CaptionStyle } from "./captionStyles";
import type { LiteMap } from "./types";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const power2InOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};
const sineInOut = (x: number) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;
const power2Out = (x: number) => 1 - Math.pow(1 - clamp01(x), 2);

// ---------------------------------------------------------------- shutter slam

type Pose = { x: number; y: number; s: number; rx: number; ry: number; rz: number };

/** A chain of power2.inOut tweens starting at `t0`, each `dur` long, through `values`. */
function chain(tau: number, t0: number, dur: number, from: number, values: number[]): number {
  let v = from;
  for (let i = 0; i < values.length; i++) {
    const a = t0 + i * dur;
    if (tau < a) return v;
    const q = (tau - a) / dur;
    if (q < 1) return v + (values[i] - v) * power2InOut(q);
    v = values[i];
  }
  return v;
}

/**
 * HyperFrames' six beats, with one "slam" = half a musical beat:
 *   1. X slams out and back twice (+32.1%, -32.1%, +32.1%, 0 of the frame width)
 *   2. Y slams, up first (-30.5%, +30.5%, -30.5%, 0 of the frame height)
 *   3. scale punch 4.04 → 0.466 → 4.04 → 1
 *   4-6. one full turn about X, then Y (1 beat each), then Z (1.22 beats)
 */
export function shutterPose(tau: number, period: number): Pose {
  const slam = period / 2;
  const turn = period;
  const turnZ = period * 1.22;
  const c = [0, 4 * slam, 8 * slam, 12 * slam, 12 * slam + turn, 12 * slam + 2 * turn];
  return {
    x: chain(tau, c[0], slam, 0, [32.1, -32.1, 32.1, 0]),
    y: chain(tau, c[1], slam, 0, [-30.5, 30.5, -30.5, 0]),
    s: chain(tau, c[2], slam, 1, [4.04, 0.466, 4.04, 1]),
    rx: chain(tau, c[3], turn, 0, [360]),
    ry: chain(tau, c[4], turn, 0, [360]),
    rz: chain(tau, c[5], turnZ, 0, [360]),
  };
}

export const shutterSeconds = (period: number) => 12 * (period / 2) + 2 * period + 1.22 * period;

/**
 * The word, integrated over a 720° shutter (HyperFrames' default: two frames wide, centred on the
 * frame) with 6 samples. Each copy is weighted so the stack averages evenly.
 */
export function ShutterSlam({ text, size, tau, period, fps, width, height, variant, frame, colors }: {
  text: string; size: number; tau: number; period: number; fps: number; width: number; height: number;
  variant: CaptionStyle; frame: number; colors: number[][];
}) {
  const N = 6;
  const shutter = 2 / fps;
  const samples = Array.from({ length: N }, (_, k) => tau - shutter / 2 + (k / (N - 1)) * shutter);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: Math.min(width, height) * 1.4, overflow: "hidden" }}>
      {samples.map((ts, k) => {
        const p = shutterPose(Math.max(0, ts), period);
        return (
          <AbsoluteFill
            key={k}
            style={{
              alignItems: "center",
              justifyContent: "center",
              // Even weighting with "over" compositing: layer k (bottom = 0) gets 1/(k+1).
              opacity: 1 / (k + 1),
              transform: `translate(${(p.x / 100) * width}px, ${(p.y / 100) * height}px) scale(${p.s}) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg)`,
            }}
          >
            <StyledCaption text={text} size={size} variant={variant === "karaoke" ? "slam" : variant} enter={1} frame={frame} colors={colors} />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- light sweep

/** Phrase starts: every section start, plus every 8 bars inside a section. */
function lastPhraseStart(map: LiteMap, t: number): number | null {
  let best: number | null = null;
  for (const s of map.sections) {
    if (s.start > t + 1e-4) break;
    const inSec = map.downbeats.filter((d) => d >= s.start - 1e-3 && d < s.end - 1e-3);
    for (let i = 0; i < inSec.length; i += 8) if (inSec[i] <= t + 1e-4) best = inSec[i];
  }
  return best;
}

/**
 * HyperFrames light-sweep-pass: one scalar `x` (frame percent) owns the pass. It travels -35 → 118
 * (sine.inOut) while the 115° band crosses, then settles back to a resting key at 62 (power2.out).
 * Crossing = 0.85 bar, settle = 0.3 bar.
 */
export function LightSweep({ map, t, width, colors }: { map: LiteMap; t: number; width: number; colors: number[][] }) {
  const bar = (60 / map.bpm) * 4;
  const start = lastPhraseStart(map, t);
  const SWEEP = 0.85 * bar, SETTLE = 0.3 * bar;
  let x = 62; // resting key
  let band = 0;
  if (start !== null) {
    const tau = t - start;
    if (tau < SWEEP) {
      x = -35 + 153 * sineInOut(tau / SWEEP);
      band = Math.min(clamp01(tau / Math.min(0.3, SWEEP)), clamp01((SWEEP - tau) / 0.35));
    } else if (tau < SWEEP + SETTLE) {
      x = 118 + (62 - 118) * power2Out((tau - SWEEP) / SETTLE);
    }
  }
  const accent = colors[3].map((c) => Math.round(255 * (0.78 + 0.22 * c))).join(",");
  return (
    <>
      {/* resting key light: soft bloom from the upper third, following x */}
      <AbsoluteFill style={{ mixBlendMode: "soft-light", background: `radial-gradient(ellipse 55% 45% at ${x}% 22%, rgba(255,255,255,0.45), transparent 70%)` }} />
      {band > 0.001 && (
        <div
          style={{
            position: "absolute",
            inset: "-55%",
            mixBlendMode: "screen",
            opacity: band,
            background: `linear-gradient(115deg, transparent 36%, rgba(255,255,255,0.24) 46%, rgba(${accent},0.95) 50%, rgba(255,255,255,0.24) 54%, transparent 64%)`,
            transform: `translateX(${((x - 50) * 1.4 * width) / 100}px)`,
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- camera shake
// HyperFrames camera-shake: measured profiles, three octaves of value noise per rotation axis
// (amplitude in degrees, frequency in Hz), projected through a 28/50/85 mm lens. The handheld
// profiles are rotation only; the 6D rig adds position channels.

type Ch = [number, number] | null;
type PosCh = [number, number, number];
type ShakeProfile = { lens: "wide" | "normal" | "tele"; rot: Ch[][]; pos?: PosCh[][] };

export const SHAKE_PROFILES: Record<string, ShakeProfile> = {
  "handheld-normal-mild": { lens: "normal", rot: [[[7, 0.15], [5, 0.1], null], [[4, 0.8], [2, 0.75], null], [[1, 1.2], [0.8, 1.5], null]] },
  "handheld-normal-strong": { lens: "normal", rot: [[[10, 0.4], [10, 0.06], null], [[5, 1.44], [3, 0.73], null], [[3, 2.49], [1, 2.0], null]] },
  "handheld-normal-extreme": { lens: "normal", rot: [[[15, 0.2], [7, 0.25], null], [[5, 0.9], [3, 1.0], null], [[2, 2.0], null, null]] },
  "handheld-wideangle-mild": { lens: "wide", rot: [[[12, 0.15], [5, 0.1], null], [[5, 0.6], [4, 0.45], null], [[1, 1.5], [1, 1.2], null]] },
  "handheld-wideangle-strong": { lens: "wide", rot: [[[17.46, 0.5], [5, 0.25], null], [[12.47, 0.94], [4, 0.5], [1, 0.4]], [[4, 1.2], [2, 1.3], null]] },
  "handheld-tele-mild": { lens: "tele", rot: [[[4, 0.2], [2, 0.15], null], [[2, 0.4], [2, 0.5], null], [[1, 0.7], [1, 0.6], null]] },
  "handheld-tele-strong": { lens: "tele", rot: [[[6.19, 0.39], [4, 0.15], [1, 0.1]], [[1.84, 1.75], [0.5, 0.9], null], [[2.3, 2.0], [0.5, 1.4], null]] },
  "rig-6d-shake": {
    lens: "normal",
    rot: [[[0.09, 5.83], [0.059, 1.8], [0.017, 2.38]], [[0.14, 9.17], [0.041, 11.35], [0.009, 10.52]], [[0.15, 57.17], [0.048, 54.17], [0.016, 63.76]]],
    pos: [[[0.011, 3.2, 1], [0.059, 1.9, 1], [0.021, 3.33, 1]], [[0.009, 7.7, 1], [0.04, 9.1, 0], [0.009, 9.22, 1]], [[0.002, 51.51, 1], [0.05, 55.54, 1], [0.017, 58.55, 1]]],
  },
  "rig-6d-wobble": { lens: "normal", rot: [[[0.987, 5.2], [1.34, 5.39], [2, 2.23]], [[0.73, 9.17], [0.86, 11.35], [0.51, 8.31]], [[0.78, 13.52], [0.55, 27.66], [0.28, 18.91]]] },
};

export const SHAKE_LABELS: Record<string, string> = {
  off: "Off",
  "handheld-normal-mild": "Handheld",
  "handheld-normal-strong": "Handheld strong",
  "handheld-wideangle-strong": "Wide-angle run",
  "handheld-tele-mild": "Telephoto",
  "rig-6d-wobble": "Rig wobble",
};

const LENS_MM = { wide: 28, normal: 50, tele: 85 } as const;
/** HyperFrames' amplitudes are for whole-scene camera moves; full-frame music visuals read better at 35%
 *  (keeps the required overscan near 10%, so little of the picture is cropped). */
const AMP = 0.35;

function csHash(i: number, seed: number) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function csNoise(x: number, seed: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return csHash(i, seed) * (1 - u) + csHash(i + 1, seed) * u;
}
function csChannel(amp: number, freq: number, t: number, seed: number, constant: number) {
  const u = freq * t + seed * 7.13;
  if (constant) return Math.cos(u * 2 * Math.PI) * amp * 0.5;
  return (csNoise(u, seed) - 0.5) * amp;
}

/**
 * Camera transform at time t. `intensity` scales amplitude (we drive it from the music's loudness).
 * A constant overscan (from the profile's worst case at `maxIntensity`) keeps the frame covered.
 */
export function cameraShake(profileId: string, t: number, width: number, height: number, intensityIn: number, maxIntensityIn: number): string {
  const p = SHAKE_PROFILES[profileId];
  const intensity = intensityIn * AMP;
  const maxIntensity = maxIntensityIn * AMP;
  if (!p) return "";
  const RAD = Math.PI / 180;
  const rot = [0, 0, 0], pos = [0, 0, 0];
  p.rot.forEach((oct, o) => oct.forEach((ch, a) => { if (ch) rot[a] += csChannel(ch[0] * intensity, ch[1], t, o * 3 + a, 0); }));
  p.pos?.forEach((oct, o) => oct.forEach((ch, a) => { pos[a] += csChannel(ch[0] * intensity, ch[1], t, 32 + o * 3 + a, ch[2]); }));
  const D = (height / 2 / Math.tan(30 * RAD)) * (LENS_MM[p.lens] / 50);
  const unit = 240 * (height / 1080);
  const x = -D * Math.tan(rot[1] * RAD) + pos[0] * unit;
  const y = D * Math.tan(rot[0] * RAD) + pos[1] * unit;
  const roll = rot[2];
  const dolly = 1 + (pos[2] * unit) / D;
  // Worst case per axis: each noise channel spans ±amp/2.
  const worst = [0, 0, 0];
  p.rot.forEach((oct) => oct.forEach((ch, a) => { if (ch) worst[a] += (ch[0] * maxIntensity) / 2; }));
  const mx = D * Math.tan(Math.min(60, worst[1]) * RAD) + (p.pos ? unit * 0.1 : 0);
  const my = D * Math.tan(Math.min(60, worst[0]) * RAD) + (p.pos ? unit * 0.1 : 0);
  const rr = worst[2] * RAD;
  const overscan = Math.max(
    1 + (2 * mx) / width,
    1 + (2 * my) / height,
    (width * Math.cos(rr) + height * Math.sin(rr)) / width,
    (height * Math.cos(rr) + width * Math.sin(rr)) / height
  );
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${roll.toFixed(3)}deg) scale(${(overscan * dolly).toFixed(4)})`;
}

// ---------------------------------------------------------------- beat accent
// HyperFrames beat-accent: on a hit, the subject snaps up in scale (expo.out 0.12 s to 1+0.18·I, then
// power3.out 0.28 s back), a radial flash erupts (expo.out 0.08 s to scale 0.78+0.3·I, opacity
// 0.5+0.23·I, then power3.out 0.28 s to 1.08+0.32·I and 0) and the stage jolts
// (+0.9 / -0.63 / +0.27 % of width, -0.34 / +0.26 / -0.12 % of height, then settles in 0.12 s).

const expoOut = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(x)));
const power3Out = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

/** Hit times for the accent: the start of every drop, or every downbeat inside drops. */
export function accentHits(map: LiteMap, mode: "drops" | "bars"): number[] {
  const drops = map.sections.filter((s) => s.type === "drop");
  if (mode === "drops") return drops.map((s) => s.start);
  return map.downbeats.filter((d) => drops.some((s) => d >= s.start - 1e-3 && d < s.end - 1e-3));
}

export function beatAccentAt(hits: number[], t: number, intensity: number) {
  let h = -1;
  for (let i = hits.length - 1; i >= 0; i--) if (hits[i] <= t + 1e-4) { h = hits[i]; break; }
  const tau = h < 0 ? 9 : t - h;
  if (tau > 0.45) return null;
  const I = intensity;
  const peak = 1 + 0.18 * I;
  const scale = tau < 0.12 ? 1 + (peak - 1) * expoOut(tau / 0.12) : peak + (1 - peak) * power3Out((tau - 0.12) / 0.28);
  let fs: number, fo: number;
  const fPeakS = 0.78 + 0.3 * I, fEndS = 1.08 + 0.32 * I, fPeakO = Math.min(0.96, 0.5 + 0.23 * I);
  if (tau < 0.08) { const e = expoOut(tau / 0.08); fs = 0.25 + (fPeakS - 0.25) * e; fo = fPeakO * e; }
  else { const e = power3Out((tau - 0.08) / 0.28); fs = fPeakS + (fEndS - fPeakS) * e; fo = fPeakO * (1 - e); }
  // Jolt keyframes (percent of width / height).
  const kx = [0, 0.9, -0.63, 0.27, 0].map((v) => v * I), ky = [0, -0.34, 0.26, -0.12, 0].map((v) => v * I);
  const kt = [0, 0.04, 0.09, 0.14, 0.26];
  let sx = 0, sy = 0;
  for (let i = 0; i < kt.length - 1; i++) {
    if (tau >= kt[i] && tau < kt[i + 1]) {
      const q = (tau - kt[i]) / (kt[i + 1] - kt[i]);
      const e = i === kt.length - 2 ? power3Out(q) : q;
      sx = kx[i] + (kx[i + 1] - kx[i]) * e;
      sy = ky[i] + (ky[i + 1] - ky[i]) * e;
    }
  }
  return { scale, flashScale: fs, flashOpacity: Math.max(0, fo), sx, sy };
}

export function AccentFlash({ scale, opacity, color }: { scale: number; opacity: number; color: string }) {
  if (opacity < 0.005) return null;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div
        style={{
          width: "62vmax",
          aspectRatio: "1",
          borderRadius: "50%",
          opacity,
          transform: `scale(${scale})`,
          mixBlendMode: "screen",
          background: `radial-gradient(circle, rgba(${color},0.92) 0%, rgba(${color},0.54) 24%, rgba(${color},0.16) 48%, transparent 72%)`,
        }}
      />
    </AbsoluteFill>
  );
}
