import { Composition, Still } from "remotion";
import { Loop } from "./Loop";
import { Main } from "./Main";
import { Thumb } from "./Thumb";
import { DEMO_PROPS } from "./demo";
import type { LoopProps, VideoProps } from "./types";

const meta = ({ props }: { props: VideoProps }) => ({
  durationInFrames: Math.max(1, Math.ceil(props.duration * props.fps)),
  fps: props.fps,
  width: props.width,
  height: props.height,
});

export function Root() {
  return (
    <>
      <Composition id="Main" component={Main} defaultProps={DEMO_PROPS} calculateMetadata={meta} durationInFrames={900} fps={30} width={1920} height={1080} />
      <Composition
        id="Loop"
        component={Loop}
        defaultProps={{ ...DEMO_PROPS, loopSeconds: 15, fadeSeconds: 2, duration: 15 } as LoopProps}
        calculateMetadata={({ props }: { props: LoopProps }) => meta({ props: { ...props, duration: props.loopSeconds } })}
        durationInFrames={450} fps={30} width={1080} height={1920}
      />
      <Still id="Thumb" component={Thumb} defaultProps={{ ...DEMO_PROPS, at: 20, showText: true }} width={1280} height={720} />
    </>
  );
}
