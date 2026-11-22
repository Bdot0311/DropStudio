import { AbsoluteFill, Html5Audio, useCurrentFrame, useVideoConfig } from "remotion";
import { Visual } from "./Visual";
import type { VideoProps } from "./types";

/** The music video (16:9 main, 9:16 Shorts, previews). Final renders are muted; FFmpeg adds the original audio. */
export function Main(props: VideoProps & { glScale?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = props.startTime + frame / fps;
  return (
    <AbsoluteFill>
      <Visual {...props} t={t} frame={frame} />
      {props.audioSrc && <Html5Audio src={props.audioSrc} trimBefore={Math.round(props.startTime * fps)} />}
    </AbsoluteFill>
  );
}
