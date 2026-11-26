// Props shared by every composition. Relative imports only (bundled by Remotion's webpack).
import type { PresetConfig, StyleConfig } from "../lib/presets/configs";
import type { RenderMode, Section } from "../lib/types";

/** The parts of music_map.json the renderer needs (keeps render props small). */
export type LiteMap = {
  duration: number;
  bpm: number;
  beats: number[];
  downbeats: number[];
  sections: Section[];
  env: { fps: number; rms: number[]; low: number[]; mid: number[]; high: number[]; kick: number[]; bass: number[]; other: number[] };
  kicks: number[];
  hats: number[];
  claps: number[];
};

export type ClipRef = {
  id: string;
  src: string; // URL of an MP4
  duration: number; // seconds
  section: Section["type"]; // the section type it was generated for
  character?: boolean; // features the user's character
  matteSrc?: string; // transparent cut-out of the subject (VP9 alpha WebM), for text-behind-you
};

/** An AI morph clip that goes from shot `from` (its last frame) to shot `to` (its keyframe). */
export type BridgeRef = { from: string; to: string; src: string; duration: number };

export type VideoProps = {
  map: LiteMap;
  preset: PresetConfig["id"];
  style: StyleConfig;
  mode: RenderMode;
  title: string;
  artist: string;
  audioSrc: string | null; // preview only; final renders are muted and muxed by FFmpeg
  coverSrc: string | null;
  clips: ClipRef[];
  bridges?: BridgeRef[];
  fps: number;
  width: number;
  height: number;
  startTime: number; // seconds into the song where this composition starts
  duration: number; // seconds
  titleMode: "intro" | "persistent" | "none";
};

export type LoopProps = VideoProps & { loopSeconds: number; fadeSeconds: number };
