import { AbsoluteFill } from "remotion";
import { presetConfig } from "../lib/presets/configs";
import { Visual } from "./Visual";
import type { VideoProps } from "./types";

/** YouTube thumbnail still: one frame of the video plus big preset typography. */
export function Thumb(props: VideoProps & { at: number; showText: boolean }) {
  const ty = presetConfig(props.preset).typography;
  return (
    <AbsoluteFill>
      <Visual {...props} t={props.at} frame={Math.round(props.at * 30)} titleMode="none" noCaptions style={{ ...props.style, debug: false }} />
      {props.showText && (
        <AbsoluteFill style={{ justifyContent: "flex-end", padding: 56, background: "linear-gradient(transparent 45%, rgba(0,0,0,0.65))" }}>
          <div style={{ color: "white", fontFamily: ty.family, fontWeight: Math.max(600, ty.weight), letterSpacing: ty.tracking, textTransform: ty.transform, fontStyle: ty.style ?? "normal", textShadow: "0 4px 30px rgba(0,0,0,0.8)" }}>
            <div style={{ fontSize: 92, lineHeight: 1 }}>{props.artist}</div>
            <div style={{ fontSize: 52, marginTop: 14, opacity: 0.92 }}>{props.title}</div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
