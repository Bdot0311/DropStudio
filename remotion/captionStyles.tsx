// Caption looks ported from the HyperFrames registry (Apache-2.0, github.com/heygen-com/hyperframes):
// caption-kinetic-slam, caption-glitch-rgb, caption-pill-karaoke, caption-neon-glow,
// caption-gradient-fill, caption-matrix-decode and char-slam-explode. Re-implemented as pure
// functions of time for Remotion (no GSAP), so previews and renders match frame for frame.
import React from "react";
import { rand } from "./lib/music";

export const CAPTION_STYLES = ["slam", "glitch", "karaoke", "neon", "gradient", "decode"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const CAPTION_STYLE_LABELS: Record<CaptionStyle, string> = {
  slam: "Kinetic slam",
  glitch: "RGB glitch",
  karaoke: "Karaoke pill",
  neon: "Neon glow",
  gradient: "Gradient bounce",
  decode: "Matrix decode",
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const backOut = (x: number) => {
  const c = 1.9;
  const y = clamp01(x) - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
};
const elasticOut = (x: number) => {
  const t = clamp01(x);
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

const rgbStr = (c: number[], a = 1) => `rgba(${c.map((v) => Math.round(v * 255)).join(",")},${a})`;
const FONT = "'Montserrat', 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=?";

export type CaptionProps = {
  text: string;
  size: number;
  variant: CaptionStyle;
  /** 0→1 entrance progress of this caption (drives bounce / decode / glitch settle). */
  enter: number;
  frame: number;
  colors: number[][]; // preset palette, 0..1 RGB
  scale?: number;
  opacity?: number;
  rotate?: number;
  /** Karaoke: this word is the one being "sung" right now. */
  active?: boolean;
};

/** One caption line/word in the chosen style. */
export function StyledCaption(p: CaptionProps) {
  const { text, size, variant, enter, frame, colors } = p;
  const accent = colors[3], accent2 = colors[2], deep = colors[1];
  const base: React.CSSProperties = {
    fontFamily: FONT,
    fontWeight: 900,
    fontSize: size,
    lineHeight: 1.05,
    textTransform: "uppercase",
    textAlign: "center",
    letterSpacing: "0.01em",
    transform: `scale(${p.scale ?? 1}) rotate(${p.rotate ?? 0}deg)`,
    opacity: p.opacity ?? 1,
    maxWidth: "90%",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  };

  switch (variant) {
    case "glitch": {
      // RGB chromatic aberration that settles as the caption lands, plus CRT scanlines.
      const j = (1 - clamp01(enter)) * 0.06 + 0.012;
      const dx = (rand(frame * 1.7) - 0.5) * size * j * 2 + size * 0.02;
      const dy = (rand(frame * 2.3) - 0.5) * size * j;
      return (
        <div style={{ ...base, position: "relative", color: "#fff", textShadow: `${dx}px ${dy}px 0 rgba(255,0,60,0.85), ${-dx}px ${-dy}px 0 rgba(0,240,255,0.85), 0 0 ${size * 0.3}px rgba(0,0,0,0.6)` }}>
          {text}
          <span aria-hidden style={{ position: "absolute", inset: "-4% -2%", background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 2px, transparent 2px 5px)", mixBlendMode: "multiply", pointerEvents: "none" }} />
        </div>
      );
    }
    case "karaoke":
      return (
        <div style={{ ...base, display: "inline-block", maxWidth: "none", padding: `${size * 0.12}px ${size * 0.32}px`, borderRadius: size, background: p.active ? rgbStr(accent, 0.95) : "rgba(0,0,0,0.62)", color: p.active ? "#0a0a0a" : "#fff", boxShadow: p.active ? `0 0 ${size * 0.5}px ${rgbStr(accent, 0.6)}` : "none", fontSize: size * 0.8 }}>
          {text}
        </div>
      );
    case "neon": {
      const flicker = enter < 1 ? (rand(frame * 5.1) > 0.35 ? 1 : 0.35) : 0.92 + 0.08 * rand(frame * 0.7);
      const c1 = rgbStr([0, 0.94, 1]), c2 = rgbStr([1, 0, 0.83]);
      return (
        <div style={{ ...base, color: "#fff", opacity: (p.opacity ?? 1) * flicker, textShadow: `0 0 ${size * 0.05}px #fff, 0 0 ${size * 0.15}px ${c1}, 0 0 ${size * 0.35}px ${c1}, 0 0 ${size * 0.6}px ${c2}, 0 0 ${size}px ${c2}` }}>
          {text}
        </div>
      );
    }
    case "gradient":
      return (
        <div
          style={{
            ...base,
            transform: `scale(${(p.scale ?? 1) * (0.4 + 0.6 * elasticOut(enter))}) rotate(${p.rotate ?? 0}deg)`,
            background: `linear-gradient(100deg, #ffffff, ${rgbStr(accent)} 45%, ${rgbStr(accent2)} 80%, ${rgbStr(deep)})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            WebkitTextStroke: `${Math.max(1.5, size * 0.035)}px rgba(0,0,0,0.9)`,
            filter: `drop-shadow(0 ${size * 0.05}px ${size * 0.12}px rgba(0,0,0,0.6))`,
          }}
        >
          {text}
        </div>
      );
    case "decode": {
      // Characters scramble, then lock in left to right.
      const locked = Math.floor(clamp01(enter) * (text.length + 1));
      const out = text
        .split("")
        .map((ch, i) => (i < locked || ch === " " ? ch : GLYPHS[Math.floor(rand(frame * 13.1 + i * 7.7) * GLYPHS.length)]))
        .join("");
      return (
        <div style={{ ...base, fontFamily: "'SF Mono', Menlo, 'Courier New', monospace", color: "#eafff0", textShadow: `0 0 ${size * 0.2}px rgba(60,255,140,0.75), 0 2px ${size * 0.15}px rgba(0,0,0,0.7)` }}>
          {out}
        </div>
      );
    }
    default:
      // Kinetic slam: big white type with a black outline (the TikTok/CapCut look).
      return (
        <div style={{ ...base, color: "#fff", WebkitTextStroke: `${Math.max(2, size * 0.07)}px #000`, paintOrder: "stroke fill", textShadow: `0 ${size * 0.06}px ${size * 0.25}px rgba(0,0,0,0.55)` }}>
          {text}
        </div>
      );
  }
}

/**
 * char-slam-explode: glyphs start scattered (deterministic table), hold, then reassemble with an
 * overshooting slam and a short landing shake. `t` is seconds since the slam lands (negative = before).
 */
export function CharSlam({ text, size, t, variant, frame, colors }: { text: string; size: number; t: number; variant: CaptionStyle; frame: number; colors: number[][] }) {
  const chars = text.split("");
  const settle = 0.32; // seconds to reassemble after the landing
  const shake = t > settle && t < settle + 0.1 ? (rand(frame * 9.3) - 0.5) * size * 0.08 : 0;
  return (
    <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", transform: `translate(${shake}px, ${-shake * 0.6}px)` }}>
      {chars.map((ch, i) => {
        const sx = (rand(i * 3.17 + 0.5) - 0.5) * size * 7;
        const sy = (rand(i * 5.91 + 1.3) - 0.5) * size * 5;
        const sr = (rand(i * 7.37 + 2.1) - 0.5) * 140;
        const q = clamp01((t - i * 0.015) / settle);
        const e = backOut(q);
        const k = 1 - e;
        return (
          <span key={i} style={{ display: "inline-block", transform: `translate(${sx * k}px, ${sy * k}px) rotate(${sr * k}deg) scale(${1 + 0.5 * k})`, opacity: clamp01(q * 4) }}>
            <StyledCaption text={ch === " " ? " " : ch} size={size} variant={variant === "karaoke" ? "slam" : variant} enter={q} frame={frame} colors={colors} />
          </span>
        );
      })}
    </div>
  );
}
