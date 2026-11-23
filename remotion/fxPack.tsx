// A pack of effects ported from the HyperFrames registry (Apache-2.0, github.com/heygen-com/hyperframes),
// re-implemented as pure functions of song time for Remotion:
//   camera moves  – parallax-zoom (push), parallax-unzoom (pull), camera-dolly-zoom (dolly)
//   transitions   – chromatic-aberration-wipe, directional-wipe (push), grid-pixelate-wipe,
//                   beat-freeze-cut, fade-through / flash-through-white, cinematic-zoom (zoom blur)
//   looks         – vfx-anamorphic-flare, organic-light-leak-overlay, glitch (VHS/CRT), halftone-field
//   overlay       – waveform (equalizer bars driven by the track's energy envelopes)
import React from "react";
import { AbsoluteFill } from "remotion";
import { envAt, rand } from "./lib/music";
import type { LiteMap } from "./types";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const power3InOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const power2InOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};
const rgba = (c: number[], a: number, lift = 0) => `rgba(${c.map((v) => Math.round(255 * (lift + (1 - lift) * v))).join(",")},${a})`;

// ================================================================ camera moves

export type CameraMove = "off" | "push" | "pull" | "alternate" | "dolly";

/**
 * Per-segment camera move. `u` is progress through the current cut (0..1). Returns transforms for
 * the background (the visuals) and the foreground (cover art), which moves faster: that difference
 * is the parallax. Dolly zoom (Vertigo): the background rushes in while the subject holds its size.
 */
export function cameraMove(mode: CameraMove, u: number, segIndex: number, sectionType: string) {
  if (mode === "off") return { bg: "", fg: "" };
  const e = power2InOut(u);
  let m = mode;
  if (m === "alternate") m = segIndex % 2 ? "pull" : "push";
  if (m === "dolly") {
    if (sectionType === "build") {
      const bg = 1 + 0.35 * e; // background collapses toward the viewer…
      return { bg: `scale(${bg})`, fg: `scale(${1 / Math.sqrt(bg)})` }; // …the subject holds (slightly) still
    }
    m = "push";
  }
  // parallax-zoom: background 1 → 1.12, foreground 1 → 1.25 (pull reverses it)
  const p = m === "push" ? e : 1 - e;
  return { bg: `scale(${1 + 0.12 * p})`, fg: `scale(${1 + 0.25 * p})` };
}

// ================================================================ transitions

export type Dir = "left" | "right" | "up" | "down";
export const dirFromSeed = (seed: number): Dir => (["left", "right", "up", "down"] as Dir[])[Math.floor(rand(seed * 31) * 4)];
const axis = (d: Dir) => (d === "left" || d === "right" ? "X" : "Y");
const sign = (d: Dir) => (d === "left" || d === "up" ? -1 : 1);

/** Clip-path that reveals from one side: progress e = 0 hidden, 1 fully shown. */
function revealClip(d: Dir, e: number) {
  const h = (100 * (1 - e)).toFixed(3) + "%";
  // travel "left" = new scene comes in from the right edge
  if (d === "left") return `inset(0 0 0 ${h})`;
  if (d === "right") return `inset(0 ${h} 0 0)`;
  if (d === "up") return `inset(${h} 0 0 0)`;
  return `inset(0 0 ${h} 0)`;
}

/** chromatic-aberration-wipe: slide wipe with an RGB split on its peak frames and a white sheen. */
export function chromaWipe(p: number, D: number, width: number, d: Dir) {
  const k = width / 1920, s = D / 0.9, e = power3InOut(p), ax = axis(d), sg = sign(d);
  const prev: React.CSSProperties = { transform: `translate${ax}(${sg * 70 * k * e}px) scale(${1 - 0.04 * e})`, filter: e > 0.01 ? `blur(${(5 * k * e).toFixed(2)}px)` : undefined };
  const cur: React.CSSProperties = { transform: `translate${ax}(${-sg * 60 * k * (1 - e)}px) scale(${1.04 - 0.04 * e})`, clipPath: revealClip(d, e) };
  const tl = p * D;
  const bp = clamp01((tl - 0.18 * s) / (0.58 * s));
  const sheen = bp > 0 && bp < 1 ? <div key="cw-sheen" style={{ position: "absolute", inset: 0, mixBlendMode: "screen", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)", transform: `translateX(${-110 + 220 * power2InOut(bp)}%)` }} /> : null;
  const step = Math.floor((tl - 0.32 * s) / (0.07 * s));
  const rgb = step >= 0 && step < 4 ? Math.round(16 * k * 1.4) : 0;
  return { prev, cur, extras: sheen, rgb };
}

/** directional-wipe: one panel pushes the other out of frame (power3.inOut, no blur). */
export function pushWipe(p: number, d: Dir) {
  const e = power3InOut(p), ax = axis(d), sg = sign(d);
  return {
    prev: { transform: `translate${ax}(${sg * 100 * e}%)` } as React.CSSProperties,
    cur: { transform: `translate${ax}(${-sg * 100 * (1 - e)}%)` } as React.CSSProperties,
  };
}

/** grid-pixelate-wipe: cells cover the frame from the centre outward, the scene swaps, then they uncover. */
export function PixelateGrid({ p, width, height, color }: { p: number; width: number; height: number; color: string }) {
  const cols = width >= height ? 16 : 9, rows = width >= height ? 9 : 16;
  const cells: React.ReactNode[] = [];
  const maxD = Math.hypot(cols / 2, rows / 2);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const dist = Math.hypot(c + 0.5 - cols / 2, r + 0.5 - rows / 2) / maxD; // 0 centre … 1 corner
      // cover during the first half (centre first), uncover during the second (centre first again)
      const cover = clamp01((p * 2 - dist * 0.5) / 0.5);
      const uncover = clamp01(((p - 0.5) * 2 - dist * 0.5) / 0.5);
      const sc = p < 0.5 ? power2InOut(cover) : 1 - power2InOut(uncover);
      if (sc <= 0.001) continue;
      cells.push(<div key={`${r}-${c}`} style={{ position: "absolute", left: `${(c / cols) * 100}%`, top: `${(r / rows) * 100}%`, width: `${100 / cols + 0.05}%`, height: `${100 / rows + 0.05}%`, background: color, transform: `scale(${sc})` }} />);
    }
  return <AbsoluteFill key="pix" style={{ pointerEvents: "none" }}>{cells}</AbsoluteFill>;
}

/** beat-freeze-cut: the outgoing shot freezes on the cut with a punch-in and desaturation, then hard-cuts. */
export function freezeCut(p: number) {
  const e = clamp01(p / 0.85);
  return {
    prev: { transform: `scale(${1 + 0.06 * Math.sqrt(e)})`, filter: `saturate(${1 - 0.7 * e}) contrast(${1 + 0.25 * e})` } as React.CSSProperties,
    showPrev: p < 0.85,
    flash: p < 0.1 ? 0.6 * (1 - p / 0.1) : 0,
  };
}

/** fade-through / flash-through-white: out to a white wash, in from it. */
export function whiteThrough(p: number) {
  return { wash: p < 0.5 ? power2InOut(p * 2) : 1 - power2InOut((p - 0.5) * 2), showPrev: p < 0.5 };
}

/** cinematic-zoom: both shots zoom-blur through the cut, with a per-channel split at the peak. */
export function zoomBlur(p: number, width: number) {
  const k = width / 1920;
  if (p < 0.5) {
    const e = power2InOut(p * 2);
    return { showPrev: true, prev: { transform: `scale(${1 + 0.6 * e})`, filter: `blur(${(9 * k * e).toFixed(2)}px)` } as React.CSSProperties, cur: {} as React.CSSProperties, rgb: Math.round(12 * k * e) };
  }
  const e = power2InOut((p - 0.5) * 2);
  return { showPrev: false, prev: {}, cur: { transform: `scale(${1.35 - 0.35 * e})`, filter: e < 0.99 ? `blur(${(9 * k * (1 - e)).toFixed(2)}px)` : undefined } as React.CSSProperties, rgb: Math.round(12 * k * (1 - e)) };
}

// ================================================================ looks

export type Looks = { flare: boolean; leaks: boolean; vhs: boolean; halftone: boolean };

/** vfx-anamorphic-flare: a few bright points throwing long horizontal blue-violet streaks, pumping with the kick. */
export function AnamorphicFlare({ t, kick, energy, width, height, seed }: { t: number; kick: number; energy: number; width: number; height: number; seed: number }) {
  const n = 5;
  const tint = "122,138,255"; // 0x7a8aff
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const x = (rand(seed * 3 + i * 1.7) * 0.8 + 0.1 + 0.03 * Math.sin(t * 0.3 + i)) * width;
    const y = (rand(seed * 5 + i * 2.3) * 0.7 + 0.15 + 0.02 * Math.cos(t * 0.25 + i * 2)) * height;
    const a = clamp01((0.18 + 0.82 * kick) * (0.35 + 0.65 * energy) * (0.6 + 0.4 * rand(i * 9.1)));
    const len = width * (0.5 + 0.7 * a);
    const th = Math.max(1, height * 0.004);
    nodes.push(
      <React.Fragment key={i}>
        <div style={{ position: "absolute", left: x - len / 2, top: y - th / 2, width: len, height: th, opacity: a, background: `linear-gradient(90deg, transparent, rgba(${tint},0.55) 30%, rgba(235,240,255,0.95) 50%, rgba(${tint},0.55) 70%, transparent)`, filter: `blur(${th * 0.6}px)` }} />
        <div style={{ position: "absolute", left: x - th * 6, top: y - th * 6, width: th * 12, height: th * 12, borderRadius: "50%", opacity: a, background: `radial-gradient(circle, rgba(255,255,255,0.95), rgba(${tint},0.5) 40%, transparent 70%)` }} />
      </React.Fragment>
    );
  }
  return <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none" }}>{nodes}</AbsoluteFill>;
}

/** organic-light-leak-overlay: slow drifting warm blooms from the frame edges. */
export function OrganicLeaks({ t, colors, bpm }: { t: number; colors: number[][]; bpm: number }) {
  const ph = t * (bpm / 60) * 0.06; // drifts with the tempo, very slowly
  const a = 0.5 + 0.5 * Math.sin(ph * 2.1);
  const b = 0.5 + 0.5 * Math.sin(ph * 1.3 + 2);
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none", opacity: 0.55 }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 45% 70% at ${-5 + 20 * a}% ${30 + 30 * b}%, ${rgba(colors[3], 0.55, 0.3)}, transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 40% 60% at ${105 - 18 * b}% ${70 - 35 * a}%, ${rgba(colors[2], 0.45, 0.2)}, transparent 70%)` }} />
    </AbsoluteFill>
  );
}

/** glitch (VHS/CRT): scanlines, a rolling tracking band, row tearing on claps and a slight colour bleed. */
export function VhsOverlay({ t, frame, height, clapHit }: { t: number; frame: number; height: number; clapHit: number }) {
  const bandY = ((t * 0.18) % 1.2) * 100 - 10;
  const tears: React.ReactNode[] = [];
  if (clapHit > 0.05) {
    for (let i = 0; i < 4; i++) {
      const y = rand(frame * 1.31 + i * 7) * 100;
      const h = 1 + rand(frame * 2.7 + i) * 4;
      tears.push(<div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${y}%`, height: `${h}%`, backdropFilter: `hue-rotate(${90 * clapHit}deg) saturate(2)`, transform: `translateX(${(rand(frame + i * 3) - 0.5) * 8 * clapHit}%)`, background: "rgba(255,255,255,0.04)" }} />);
    }
  }
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: `repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 ${Math.max(1, height / 540)}px, transparent ${Math.max(1, height / 540)}px ${Math.max(3, height / 270)}px)`, mixBlendMode: "multiply" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: `${bandY}%`, height: "7%", background: "linear-gradient(transparent, rgba(255,255,255,0.08), transparent)", mixBlendMode: "screen" }} />
      {tears}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.45) 100%)" }} />
    </AbsoluteFill>
  );
}

/** halftone-field: an LED-wall dot screen over the picture. */
export function HalftoneOverlay({ width, height }: { width: number; height: number }) {
  const cell = Math.max(4, Math.round(Math.min(width, height) / 120));
  return <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "multiply", backgroundImage: `radial-gradient(circle, transparent ${cell * 0.32}px, rgba(0,0,0,0.88) ${cell * 0.42}px)`, backgroundSize: `${cell}px ${cell}px` }} />;
}

// ================================================================ waveform overlay

/**
 * waveform: equalizer bars across the bottom of the frame (gradient from the palette), driven by the
 * track's low/mid/high envelopes so every bar moves with the actual music.
 */
export function WaveformBars({ map, t, width, height, colors, mode }: { map: LiteMap; t: number; width: number; height: number; colors: number[][]; mode: "bars" | "mirror" }) {
  const n = width >= height ? 48 : 28;
  const f = map.env.fps;
  const low = envAt(map.env.low, f, t), mid = envAt(map.env.mid, f, t), high = envAt(map.env.high, f, t), kick = envAt(map.env.kick, f, t), rms = envAt(map.env.rms, f, t);
  const maxH = height * (mode === "mirror" ? 0.16 : 0.2);
  const bw = width / n;
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    // low on the left, highs on the right, with per-bar wobble so neighbours differ
    const band = x < 0.33 ? low : x < 0.66 ? mid : high;
    const wobble = 0.55 + 0.45 * Math.sin(t * (3 + rand(i) * 5) + i * 1.7);
    const v = clamp01(0.08 + band * (0.55 + 0.45 * wobble) * (0.7 + 0.3 * rms) + (x < 0.25 ? kick * 0.35 : 0));
    const h = Math.max(2, v * maxH);
    const c0 = rgba(colors[3], 0.95, 0.15), c1 = rgba(colors[2], 0.95, 0.1);
    const style: React.CSSProperties = { position: "absolute", left: i * bw + bw * 0.18, width: bw * 0.64, borderRadius: bw * 0.3, background: `linear-gradient(0deg, ${c1}, ${c0})`, boxShadow: `0 0 ${bw * 0.6}px ${c0}` };
    if (mode === "mirror") {
      bars.push(<div key={i} style={{ ...style, top: height / 2 - h, height: h * 2 }} />);
    } else {
      bars.push(<div key={i} style={{ ...style, bottom: height * 0.04, height: h }} />);
    }
  }
  return <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: mode === "mirror" ? "screen" : "normal", opacity: mode === "mirror" ? 0.75 : 0.9 }}>{bars}</AbsoluteFill>;
}
