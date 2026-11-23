// Text for the artist formats, modelled on real artist posts:
//   Performance – a small persistent caption at the top ("I can't get this song outta my head…") and
//                 lyric words one at a time in the centre, in bold gold with a dark outline.
//   Teaser      – minimal text, ending on a black card with the release date and @handle.
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { lastIndexAtOrBefore } from "./lib/music";
import type { VideoProps } from "./types";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function ArtistCaptions(props: VideoProps & { t: number }) {
  const { map, t, style, startTime, duration, artist } = props;
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const vertical = height > width;
  const period = 60 / map.bpm;
  const bar = period * 4;
  const caps = style.captions;
  const end = startTime + duration;
  const nodes: React.ReactNode[] = [];
  const bandTop = style.frame === "band" && vertical ? (height - (width * 9) / 16) / 2 : 0;

  // Persistent top caption (white, sentence case): sits in the black area above the band, or near the top.
  if (caps.top) {
    nodes.push(
      <div key="top" style={{ position: "absolute", left: "6%", right: "6%", top: bandTop ? Math.max(height * 0.06, bandTop - base * 0.16) : height * 0.07, textAlign: "center", color: "#fff", fontFamily: "'Helvetica Neue', Arial, sans-serif", fontWeight: 500, fontSize: base * 0.045, lineHeight: 1.25, textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>
        {caps.top}
      </div>
    );
  }

  if (style.editStyle === "performance" && caps.lyrics.trim()) {
    // One word every N beats, starting on the first downbeat after the video starts.
    const words = caps.lyrics.trim().split(/\s+/);
    const di = lastIndexAtOrBefore(map.downbeats, startTime + 1e-3);
    const first = map.downbeats[Math.min(map.downbeats.length - 1, di + 1)] ?? startTime;
    const step = period * style.lyricBeats;
    if (t >= first && t < end - period) {
      const n = Math.floor((t - first) / step);
      const w = words[n % words.length];
      const q = (t - first) / step - n; // 0→1 within this word
      const pop = 1 + 0.08 * Math.pow(1 - clamp01(q * 6), 2);
      const size = base * (vertical ? 0.1 : 0.085);
      nodes.push(
        <AbsoluteFill key="lyric" style={{ alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              transform: `scale(${pop})`,
              fontFamily: "'Montserrat', 'Arial Black', Arial, sans-serif",
              fontWeight: 900,
              fontSize: size,
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              background: "linear-gradient(180deg, #ffe08a 0%, #f2b33d 55%, #d98a1c 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              WebkitTextStroke: `${Math.max(1.5, size * 0.035)}px rgba(40,20,0,0.85)`,
              filter: `drop-shadow(0 ${size * 0.04}px ${size * 0.12}px rgba(0,0,0,0.5))`,
              opacity: clamp01(q * 10) * clamp01((1 - q) * 8),
            }}
          >
            {w}
          </div>
        </AbsoluteFill>
      );
    }
  }

  if (style.editStyle === "teaser") {
    // Release-date card over the last 3 bars, then the handle on the final bar.
    const cardStart = end - 3 * bar;
    if ((caps.date || caps.handle) && t >= cardStart) {
      const q = clamp01((t - cardStart) / (period * 0.5));
      const last = t >= end - bar;
      nodes.push(
        <AbsoluteFill key="date" style={{ background: `rgba(0,0,0,${q})`, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: base * 0.03 }}>
          {!last && caps.date && (
            <div style={{ opacity: q, color: "#fff", fontFamily: "'Eurostile', 'Orbitron', 'Avenir Next', 'SF Mono', monospace", fontWeight: 700, letterSpacing: "0.08em", fontSize: base * 0.075 }}>{caps.date}</div>
          )}
          {last && (
            <div style={{ color: "#fff", fontFamily: "'Helvetica Neue', Arial, sans-serif", fontWeight: 600, letterSpacing: "0.04em", fontSize: base * 0.05, opacity: clamp01((t - (end - bar)) / (period * 0.5)) }}>
              {caps.handle || artist}
            </div>
          )}
        </AbsoluteFill>
      );
    }
  }
  return <>{nodes}</>;
}
