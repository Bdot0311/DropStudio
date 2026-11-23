// Cut transitions ported from the HyperFrames registry (Apache-2.0, github.com/heygen-com/hyperframes):
//   whip-pan-cut            → whipPan()
//   zoom-through-transition → zoomThrough()
// Re-implemented as pure functions of the transition's progress (no GSAP), with the same motion
// values, scaled from HyperFrames' 1920-wide reference to the current video size.
import React from "react";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** GSAP power3.inOut */
export const power3InOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const power2InOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

/**
 * Whip pan: both scenes ride one strip (B docked one frame-width beyond A) on a single
 * power3.inOut move, so the seam velocity matches by construction. Horizontal-only motion blur,
 * capped at 16 px (at 1920 wide), peaks at mid-whip and is 0 at both ends. A thin accent seam
 * rides the boundary while the whip runs.
 */
export function whipPan(p: number, dir: 1 | -1, width: number, accent: string, id: string) {
  const e = power3InOut(p);
  const k = width / 1920;
  const blur = 16 * k * (p < 0.5 ? Math.pow(p * 2, 3) : Math.pow(2 - p * 2, 3));
  const filter = blur > 0.05 ? `url(#${id})` : undefined;
  // dir -1 = travel left: A goes 0 → -100%, B comes +100% → 0.
  const prevStyle: React.CSSProperties = { transform: `translateX(${dir * e * 100}%)`, filter };
  const curStyle: React.CSSProperties = { transform: `translateX(${dir * (e - 1) * 100}%)`, filter };
  const seamX = dir < 0 ? (1 - e) * 100 : e * 100; // boundary position, % from the left
  const seamOpacity = Math.sin(clamp01(p) * Math.PI);
  const extras = (
    <React.Fragment key={`${id}-fx`}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id={id} x="-10%" y="0" width="120%" height="100%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={`${blur.toFixed(2)} 0`} />
        </filter>
      </svg>
      {seamOpacity > 0.01 && (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${seamX}%`, width: Math.max(1, 2 * k), marginLeft: -Math.max(1, k), background: accent, opacity: seamOpacity * 0.9, boxShadow: `0 0 ${12 * k}px ${accent}` }} />
      )}
    </React.Fragment>
  );
  return { prevStyle, curStyle, extras };
}

/**
 * Zoom through: over a push of `D` seconds the incoming scene is wiped in from the right
 * (clip-path), sliding from +60 px and settling from 1.04× scale, while the outgoing scene drifts
 * back to -70 px, 0.96× and a 5 px blur. A white light band sweeps across, then a short RGB
 * flicker (4 steps of ±16 px). HyperFrames' 0.9 s push is stretched/shrunk to `D` (beat-locked).
 */
export function zoomThrough(p: number, D: number, width: number, key: string) {
  const k = width / 1920;
  const s = D / 0.9; // HyperFrames timing → this transition's length
  const e = power3InOut(p);
  const prevStyle: React.CSSProperties = {
    transform: `translateX(${-70 * k * e}px) scale(${1 - 0.04 * e})`,
    filter: e > 0.01 ? `blur(${(5 * k * e).toFixed(2)}px)` : undefined,
  };
  const curStyle: React.CSSProperties = {
    transform: `translateX(${60 * k * (1 - e)}px) scale(${1.04 - 0.04 * e})`,
    clipPath: `inset(0% ${(100 * (1 - e)).toFixed(3)}% 0% 0%)`,
  };
  const tl = p * D; // seconds into the transition
  const bandP = clamp01((tl - 0.18 * s) / (0.58 * s));
  const bandX = -110 + 220 * power2InOut(bandP);
  const extras =
    bandP > 0 && bandP < 1 ? (
      <div key={`${key}-band`} style={{ position: "absolute", inset: 0, mixBlendMode: "screen", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)", transform: `translateX(${bandX}%)` }} />
    ) : null;
  // RGB flicker: from 0.32 s, four 0.07 s steps alternating -16 / +16 px.
  const step = Math.floor((tl - 0.32 * s) / (0.07 * s));
  const rgb = step >= 0 && step < 4 ? Math.round(16 * k * (step % 2 ? 1 : -1)) : 0;
  return { prevStyle, curStyle, extras, rgb };
}
