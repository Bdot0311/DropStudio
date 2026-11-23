// "CapCut-style" edit effects: velocity surges, beat punches, build-up strobes into a drop slam,
// RGB split on claps, light leaks, letterbox, and TikTok-style kinetic captions.
// Everything is computed from the song time, so previews and renders match frame for frame.
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { PresetConfig, StyleConfig } from "../lib/presets/configs";
import { beatInfo, lastIndexAtOrBefore, rand } from "./lib/music";
import type { LiteMap, VideoProps } from "./types";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const backOut = (x: number) => {
  const c = 1.9;
  const y = clamp01(x) - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
};

export const isCapcut = (s: StyleConfig) => s.editStyle === "capcut";

/**
 * Velocity edit: extra seconds of "motion" that surge right after every beat and glide before
 * the next one. Added to shader time and clip time (a beat-synced speed ramp).
 */
export function velocityOffset(map: LiteMap, t: number, amount: number): number {
  if (amount <= 0) return 0;
  const b = beatInfo(map, t);
  if (b.beatIndex < 0) return 0;
  const period = 60 / map.bpm;
  return amount * period * (b.beatIndex + easeOut(b.phase * 1.6));
}

function nextDropStart(map: LiteMap, t: number): number | null {
  for (const s of map.sections) if (s.type === "drop" && s.start > t + 1e-4) return s.start;
  return null;
}
function lastDropStart(map: LiteMap, t: number): number | null {
  let r: number | null = null;
  for (const s of map.sections) if (s.type === "drop" && s.start <= t + 1e-4) r = s.start;
  return r;
}

/** Camera move for the whole picture in CapCut mode. */
export function capcutCamera(map: LiteMap, t: number, frame: number, intensity: number, sectionType: string) {
  const period = 60 / map.bpm;
  const bar = period * 4;
  const b = beatInfo(map, t);
  const active = sectionType === "drop" || sectionType === "build";
  // Beat punches: a hard zoom on the one, a smaller one on other beats.
  const punch = active ? (b.beatInBar === 0 ? 0.09 : 0.035) * Math.pow(1 - b.phase, 3) : 0.012 * Math.pow(1 - b.phase, 3);
  // Alternating twist per bar (snaps on the downbeat).
  const dir = b.bar % 2 === 0 ? 1 : -1;
  const twist = active && b.beatInBar === 0 ? dir * 2.2 * Math.pow(1 - b.phase, 4) : 0;
  const tilt = active ? 5 * Math.pow(1 - b.phase, 4) * (b.beatInBar % 2 === 0 ? 1 : -1) : 0;

  // Build-up: last 2 bars before a drop zoom in, blur and strobe faster and faster…
  let ramp = 0, strobe = 0, blur = 0;
  const nd = nextDropStart(map, t);
  if (nd !== null && nd - t < 2 * bar) {
    const q = 1 - (nd - t) / (2 * bar);
    ramp = 0.22 * q * q;
    blur = 3 * q * q;
    const div = q < 0.5 ? 2 : 4; // 8th notes, then 16th notes
    const sub = (b.phase * div) % 1;
    strobe = q * Math.pow(1 - sub, 6) * 0.8;
  }
  // …then the drop slams: big punch + shake for one beat.
  let slam = 0;
  const ld = lastDropStart(map, t);
  if (ld !== null && t - ld < period) slam = 1 - (t - ld) / period;
  const shake = slam * 0.025;
  const sx = (rand(frame * 3.1) - 0.5) * shake * 100;
  const sy = (rand(frame * 4.7) - 0.5) * shake * 100;

  const k = Math.min(1.5, intensity);
  return {
    transform: `perspective(1200px) translate(${sx}%, ${sy}%) scale(${1 + (punch + ramp + slam * 0.18) * k}) rotateZ(${twist * k}deg) rotateY(${tilt * k}deg)`,
    blur: blur * k,
    strobe: strobe * k,
    slam,
  };
}

/** Clap/snare hits → RGB split amount (px). */
export function clapSplit(claps: number[], t: number, width: number, extra: number): number {
  const i = lastIndexAtOrBefore(claps, t);
  const since = i >= 0 ? t - claps[i] : 9;
  const a = since < 0.14 ? 1 - since / 0.14 : 0;
  return Math.round((a + extra) * width * 0.006);
}

export function RgbSplitFilter({ id, dx }: { id: string; dx: number }) {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
        <feOffset in="r" dx={dx} dy="0" result="r2" />
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
        <feOffset in="b" dx={-dx} dy="0" result="b2" />
        <feBlend in="r2" in2="g" mode="screen" result="rg" />
        <feBlend in="rg" in2="b2" mode="screen" />
      </filter>
    </svg>
  );
}

/** Warm light leak sweeping across for one bar after each section change. */
export function LightLeak({ map, t, colors }: { map: LiteMap; t: number; colors: number[][] }) {
  const bar = (60 / map.bpm) * 4;
  const s = [...map.sections].reverse().find((x) => x.start <= t + 1e-4);
  if (!s || s.start === 0) return null;
  const q = (t - s.start) / bar;
  if (q < 0 || q > 1) return null;
  const o = Math.sin(q * Math.PI) * 0.75;
  const c1 = colors[3].map((c) => Math.round(255 * (0.6 + 0.4 * c))).join(",");
  const c2 = colors[2].map((c) => Math.round(255 * c)).join(",");
  const x = -30 + q * 160;
  return (
    <AbsoluteFill
      style={{
        mixBlendMode: "screen",
        opacity: o,
        background: `radial-gradient(ellipse 60% 90% at ${x}% 40%, rgba(${c1},0.95), rgba(${c2},0.45) 35%, transparent 70%)`,
      }}
    />
  );
}

export function Letterbox() {
  const { width, height } = useVideoConfig();
  if (height >= width) return null;
  const h = Math.round(height * 0.1);
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: h, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: "#000" }} />
    </>
  );
}

/** Big bold white text with a black outline: the TikTok / CapCut caption look. */
function CaptionText({ text, size, scale = 1, opacity = 1, rotate = 0 }: { text: string; size: number; scale?: number; opacity?: number; rotate?: number }) {
  return (
    <div
      style={{
        fontFamily: "'Montserrat', 'Arial Black', 'Helvetica Neue', Arial, sans-serif",
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.05,
        color: "#fff",
        textTransform: "uppercase",
        textAlign: "center",
        letterSpacing: "0.01em",
        WebkitTextStroke: `${Math.max(2, size * 0.07)}px #000`,
        paintOrder: "stroke fill",
        textShadow: `0 ${size * 0.06}px ${size * 0.25}px rgba(0,0,0,0.55)`,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        opacity,
        maxWidth: "90%",
        wordBreak: "break-word",
      }}
    >
      {text}
    </div>
  );
}

/**
 * Captions relative to this video's own window (works for full renders and social cuts):
 *   hook   – words pop in one per beat at the start
 *   3·2·1  – countdown on the last 3 beats before the drop, then the drop text slams in
 *   CTA    – end card in the last 2 bars
 */
export function Captions(props: VideoProps & { t: number; presetCfg: PresetConfig }) {
  const { map, t, style, startTime, duration, title, artist } = props;
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const vertical = height > width;
  const period = 60 / map.bpm;
  const bar = period * 4;
  const caps = style.captions;
  const end = startTime + duration;
  const nodes: React.ReactNode[] = [];
  const top = vertical ? "28%" : "50%";

  // The drop we count into: the biggest drop inside this window.
  const drops = map.sections.filter((s) => s.type === "drop" && s.start > startTime + 3 * period && s.start < end);
  const drop = [...drops].sort((a, b) => b.energy - a.energy)[0];

  // Hook: first 2 bars of the video, one word per beat (gives way to the countdown).
  const hook = (caps.hook || `${artist} – ${title}`).trim();
  let hookEnd = startTime + 2 * bar;
  if (drop && drop.start - 3 * period < hookEnd) hookEnd = Math.max(startTime + period, drop.start - 3 * period);
  if (hook && t < hookEnd) {
    const words = hook.split(/\s+/);
    const firstBeat = map.beats[Math.max(0, lastIndexAtOrBefore(map.beats, startTime))] ?? startTime;
    const beatsIn = Math.floor((t - firstBeat) / period + 1e-6);
    const shown = Math.min(words.length, Math.max(1, beatsIn + 1));
    const sinceBeat = (t - firstBeat) / period - beatsIn;
    const fadeOut = clamp01((hookEnd - t) / (period * 0.5));
    nodes.push(
      <AbsoluteFill key="hook" style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: top }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${base * 0.025}px`, maxWidth: "88%", opacity: fadeOut, transform: "translateY(-50%)" }}>
          {words.slice(0, shown).map((w, i) => (
            <CaptionText key={i} text={w} size={base * (vertical ? 0.085 : 0.075)} scale={i === shown - 1 && beatsIn < words.length ? backOut(sinceBeat * 5) : 1} />
          ))}
        </div>
      </AbsoluteFill>
    );
  }

  // Countdown + drop slam.
  if (drop) {
    const dt = drop.start - t;
    if (dt > 0 && dt <= 3 * period) {
      const n = Math.ceil(dt / period - 1e-6); // 3, 2, 1
      const into = 1 - (dt / period - (n - 1)); // 0→1 within that beat
      nodes.push(
        <AbsoluteFill key="cd" style={{ alignItems: "center", justifyContent: "center" }}>
          <CaptionText text={String(n)} size={base * 0.28} scale={backOut(into * 4) * (1 + 0.1 * (3 - n))} opacity={clamp01((1 - into) * 3)} />
        </AbsoluteFill>
      );
    } else if (caps.drop && dt <= 0 && -dt < bar) {
      const q = -dt / bar;
      nodes.push(
        <AbsoluteFill key="drop" style={{ alignItems: "center", justifyContent: "center" }}>
          <CaptionText text={caps.drop} size={base * 0.13} scale={1 + 0.6 * Math.pow(1 - clamp01(q * 6), 3)} opacity={clamp01((1 - q) * 3)} rotate={-4} />
        </AbsoluteFill>
      );
    }
  }

  // CTA end card: last 2 bars.
  if (caps.cta && end - t < 2 * bar && duration > 6 * bar) {
    const q = clamp01((t - (end - 2 * bar)) / period);
    nodes.push(
      <AbsoluteFill key="cta" style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: base * 0.02, background: `rgba(0,0,0,${0.35 * q})` }}>
        <CaptionText text={caps.cta} size={base * 0.11} scale={backOut(q)} />
        <div style={{ opacity: q, color: "white", fontFamily: props.presetCfg.typography.family, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", fontSize: base * 0.035, textShadow: "0 2px 12px rgba(0,0,0,0.7)", textAlign: "center" }}>
          {artist} · {title}
        </div>
      </AbsoluteFill>
    );
  }
  return <>{nodes}</>;
}
