"use client";
import { useMemo } from "react";
import { Player } from "@remotion/player";
import { Main } from "@/remotion/Main";
import type { VideoProps } from "@/remotion/types";

/** In-browser preview of the exact composition the renderer uses. */
export function PreviewPlayer({
  props, startTime = 0, duration, width = 1920, height = 1080, autoPlay = false, loop = false, glScale = 0.5, className,
}: {
  props: VideoProps; startTime?: number; duration?: number; width?: number; height?: number;
  autoPlay?: boolean; loop?: boolean; glScale?: number; className?: string;
}) {
  const fps = 30;
  const d = duration ?? Math.max(0.5, props.map.duration - startTime);
  const inputProps = useMemo(
    () => ({ ...props, startTime, duration: d, width, height, fps, glScale, titleMode: startTime > 0 ? ("none" as const) : props.titleMode }),
    [props, startTime, d, width, height, glScale]
  );
  return (
    <div className={className} style={{ aspectRatio: `${width} / ${height}` }}>
      <Player
        component={Main}
        inputProps={inputProps}
        durationInFrames={Math.max(1, Math.ceil(d * fps))}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        controls
        autoPlay={autoPlay}
        loop={loop}
        acknowledgeRemotionLicense
        style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden", background: "#000" }}
        numberOfSharedAudioTags={2}
        spaceKeyToPlayOrPause
      />
    </div>
  );
}
