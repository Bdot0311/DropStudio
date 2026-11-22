import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Visual } from "./Visual";
import type { LoopProps } from "./types";

/**
 * A seamless loop (Spotify Canvas / live visuals). Frame f shows the song at start+f, and during
 * the first `fadeSeconds` the picture from start+loop+f fades out on top, so the last frame
 * flows straight into the first.
 */
export function Loop(props: LoopProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame / fps;
  const t = props.startTime + local;
  const fade = local < props.fadeSeconds ? 1 - local / props.fadeSeconds : 0;
  return (
    <AbsoluteFill>
      <Visual {...props} t={t} frame={frame} slotPrefix="a" />
      {fade > 0 && (
        <AbsoluteFill style={{ opacity: fade }}>
          <Visual {...props} t={t + props.loopSeconds} frame={frame} slotPrefix="b" />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
