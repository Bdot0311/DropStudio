// Placeholder props so the compositions render in Remotion Studio without a project.
import { DEFAULT_STYLE } from "../lib/presets/configs";
import type { LiteMap, VideoProps } from "./types";

function demoMap(): LiteMap {
  const bpm = 128, beat = 60 / bpm, duration = 64 * beat * 4;
  const beats = Array.from({ length: Math.floor(duration / beat) }, (_, i) => +(i * beat).toFixed(4));
  const downbeats = beats.filter((_, i) => i % 4 === 0);
  const n = Math.ceil(duration * 60);
  const kick = Array.from({ length: n }, (_, i) => Math.exp(-((i / 60) % beat) / 0.09));
  const ramp = Array.from({ length: n }, (_, i) => 0.4 + 0.4 * Math.sin(i / 600));
  const sec = (type: VideoProps["map"]["sections"][number]["type"], a: number, b: number, energy: number) => ({ type, start: downbeats[a], end: b < downbeats.length ? downbeats[b] : duration, energy });
  return {
    duration, bpm, beats, downbeats,
    sections: [sec("intro", 0, 16, 0.4), sec("build", 16, 24, 0.6), sec("drop", 24, 40, 0.95), sec("breakdown", 40, 56, 0.2), sec("outro", 56, 64, 0.5)],
    env: { fps: 60, rms: ramp, low: ramp, mid: ramp, high: ramp, kick, bass: ramp, other: ramp },
    kicks: beats, hats: [],
  };
}

export const DEMO_PROPS: VideoProps = {
  map: demoMap(), preset: "future_rave", style: DEFAULT_STYLE, mode: "visualizer", title: "Demo", artist: "Drop Studio",
  audioSrc: null, coverSrc: null, clips: [], fps: 30, width: 1920, height: 1080, startTime: 0, duration: 30, titleMode: "intro",
};
