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
