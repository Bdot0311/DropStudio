// Full genre presets: the "creative brain". Read by the renderer (remotion/) and the
// AI prompt builder. Relative imports only (this file is also bundled by Remotion).
import type { SectionType } from "../types";

export type SceneId = "tunnel" | "particles" | "liquid" | "lasers" | "terrain" | "kaleido";
export type TransitionId = "crossfade" | "cut" | "flash" | "whip" | "glitch" | "zoom";

export type PresetConfig = {
  id: "melodic" | "tech_house" | "techno" | "future_rave";
  name: string;
  palette: [string, string, string, string]; // dark → light-ish accents
  background: string;
  /** Shader scenes to rotate through per section type (free mode + hybrid intros/breakdowns). */
  scenes: Record<SectionType, SceneId[]>;
  /** Beats per cut, per section type (4 = one bar). */
  cutBeats: Record<SectionType, number>;
  /** On the biggest drop's second half, cut this often (beats). */
  peakCutBeats: number;
  /** Transition used inside a section, and when entering each section type. */
  transitions: { within: TransitionId[]; enter: Record<SectionType, TransitionId>; beats: number };
  /** Audio → visual mapping strengths (0..1). */
  reactive: {
    kickFlash: number; // white flash on kicks
    kickZoom: number; // scale punch on kicks
    kickShake: number; // camera shake on kicks
    chroma: number; // chromatic aberration on kicks
    bassBloom: number; // glow / bloom from bass
    hatFlicker: number; // brightness flicker from hats
    grain: number; // film grain amount
    glitch: number; // probability of glitch transitions
    drift: number; // colour drift from pads / mids
    speed: number; // base motion speed
  };
  typography: { family: string; weight: number; tracking: string; transform: "uppercase" | "none"; style?: "italic" | "normal" };
  /** AI prompt templates per section; {vibe} is replaced with the project's vibe text. */
  prompts: Record<SectionType, string[]>;
  look: string; // appended to every prompt
  negative: string;
};

const NEGATIVE_BASE =
  "text, letters, words, typography, logo, watermark, signature, brand, trademark, real person, celebrity, face of a real person, recognizable people, copyrighted character, low quality, blurry, jpeg artifacts, deformed";

export const PRESET_CONFIGS: Record<PresetConfig["id"], PresetConfig> = {
  melodic: {
    id: "melodic",
    name: "Melodic house / techno",
    palette: ["#0b1d3a", "#127c84", "#f2a65a", "#ff7e5f"],
    background: "#050b16",
    scenes: {
      intro: ["liquid", "terrain"],
      build: ["tunnel", "terrain"],
      drop: ["terrain", "kaleido", "particles", "tunnel"],
      breakdown: ["liquid", "particles"],
      outro: ["liquid", "terrain"],
    },
    cutBeats: { intro: 64, build: 32, drop: 16, breakdown: 64, outro: 64 },
    peakCutBeats: 8,
    transitions: { within: ["crossfade"], enter: { intro: "crossfade", build: "crossfade", drop: "flash", breakdown: "crossfade", outro: "crossfade" }, beats: 8 },
    reactive: { kickFlash: 0.08, kickZoom: 0.015, kickShake: 0, chroma: 0.15, bassBloom: 0.8, hatFlicker: 0.05, grain: 0.06, glitch: 0, drift: 0.9, speed: 0.5 },
    typography: { family: "'Helvetica Neue', Helvetica, Arial, sans-serif", weight: 200, tracking: "0.35em", transform: "uppercase" },
    prompts: {
      intro: ["vast misty landscape at blue hour, lone monolith on the horizon, {vibe}", "calm ocean under a low fog bank, soft first light, {vibe}"],
      build: ["camera gliding over endless dunes toward a glowing horizon, {vibe}", "aerial flight over a mountain ridge as clouds part, {vibe}"],
      drop: ["colossal ancient monolith glowing amber in a cosmic desert, {vibe}", "sunset light bursting through clouds over a vast lake, golden god rays, {vibe}", "aurora sweeping over a frozen sea of glass, {vibe}"],
      breakdown: ["still water reflecting a single star, deep teal haze, {vibe}", "slow drifting clouds inside a cathedral of light, {vibe}"],
      outro: ["the sun sinking into a calm sea, long amber afterglow, {vibe}"],
    },
    look: "cinematic wide shot, ethereal, volumetric fog, slow camera drift, anamorphic, deep blues, teal and amber, warm sunset gradient, 35mm film, highly detailed",
    negative: NEGATIVE_BASE,
  },
  tech_house: {
    id: "tech_house",
    name: "Tech house",
    palette: ["#2a0f2e", "#e83f6f", "#ff8c42", "#ffd166"],
    background: "#140812",
    scenes: {
      intro: ["liquid", "lasers"],
      build: ["particles", "lasers"],
      drop: ["lasers", "kaleido", "particles", "liquid"],
      breakdown: ["liquid"],
      outro: ["liquid", "lasers"],
    },
    cutBeats: { intro: 16, build: 8, drop: 4, breakdown: 16, outro: 16 },
    peakCutBeats: 4,
    transitions: { within: ["cut", "whip", "zoom"], enter: { intro: "crossfade", build: "whip", drop: "zoom", breakdown: "crossfade", outro: "crossfade" }, beats: 1 },
    reactive: { kickFlash: 0.12, kickZoom: 0.05, kickShake: 0.002, chroma: 0.25, bassBloom: 0.5, hatFlicker: 0.35, grain: 0.18, glitch: 0.05, drift: 0.5, speed: 0.9 },
    typography: { family: "'Futura', 'Avenir Next', 'Trebuchet MS', sans-serif", weight: 800, tracking: "0.04em", transform: "uppercase", style: "italic" },
    prompts: {
      intro: ["empty rooftop pool at golden hour, palm shadows, {vibe}", "retro warehouse doors opening onto warm evening light, {vibe}"],
      build: ["disco ball spinning over a sunlit terrace, light flecks everywhere, {vibe}", "vintage sports car under neon palm trees, {vibe}"],
      drop: ["packed warehouse dance floor seen from above, silhouettes, warm haze, {vibe}", "magenta and orange light beams cutting through smoke in a brick warehouse, {vibe}", "spinning vinyl record macro shot, warm glow, {vibe}"],
      breakdown: ["slow motion pool water ripples with sunset reflections, {vibe}"],
      outro: ["sunrise over a city rooftop after the party, {vibe}"],
    },
    look: "groovy, warm, 1970s film stock, film grain, golden hour, warm oranges and magenta, retro, swagger, shallow depth of field",
    negative: NEGATIVE_BASE,
  },
  techno: {
    id: "techno",
    name: "Techno",
    palette: ["#050505", "#3a3a3a", "#d9d9d9", "#ff1e1e"],
    background: "#000000",
    scenes: {
      intro: ["tunnel", "terrain"],
      build: ["tunnel", "lasers"],
      drop: ["lasers", "tunnel", "kaleido", "terrain"],
      breakdown: ["particles", "terrain"],
      outro: ["tunnel"],
    },
    cutBeats: { intro: 16, build: 8, drop: 4, breakdown: 32, outro: 16 },
    peakCutBeats: 2,
    transitions: { within: ["cut", "cut", "glitch"], enter: { intro: "cut", build: "glitch", drop: "flash", breakdown: "cut", outro: "cut" }, beats: 1 },
    reactive: { kickFlash: 0.55, kickZoom: 0.03, kickShake: 0.006, chroma: 0.35, bassBloom: 0.25, hatFlicker: 0.25, grain: 0.3, glitch: 0.2, drift: 0.1, speed: 1.0 },
    typography: { family: "'Helvetica Neue', 'Arial Narrow', Arial, sans-serif", weight: 700, tracking: "0.6em", transform: "uppercase" },
    prompts: {
      intro: ["endless concrete corridor lit by a single flickering strip light, {vibe}", "brutalist tower in thick fog at night, {vibe}"],
      build: ["industrial tunnel with red warning lights racing past, {vibe}", "smoke rolling through an abandoned power station, {vibe}"],
      drop: ["white laser beams slicing through dense smoke in a dark bunker, {vibe}", "massive brutalist concrete hall with a single red light, strobing, {vibe}", "rows of industrial machinery pulsing in darkness, {vibe}"],
      breakdown: ["dust floating in a single shaft of white light, concrete room, {vibe}"],
      outro: ["empty bunker after dawn, grey light, settling smoke, {vibe}"],
    },
    look: "dark, industrial, monochrome, high contrast black and white with a single red accent, brutalist architecture, smoke, lasers, gritty, 16mm grain",
    negative: NEGATIVE_BASE + ", colorful, pastel, cheerful",
  },
  future_rave: {
    id: "future_rave",
    name: "Future rave",
    palette: ["#0b0020", "#7b2cff", "#ff00d4", "#00f0ff"],
    background: "#05000f",
    scenes: {
      intro: ["particles", "terrain"],
      build: ["tunnel", "lasers"],
      drop: ["kaleido", "lasers", "tunnel", "terrain"],
      breakdown: ["particles", "liquid"],
      outro: ["terrain"],
    },
    cutBeats: { intro: 8, build: 4, drop: 4, breakdown: 16, outro: 8 },
    peakCutBeats: 1,
    transitions: { within: ["cut", "zoom", "flash"], enter: { intro: "crossfade", build: "zoom", drop: "flash", breakdown: "crossfade", outro: "crossfade" }, beats: 1 },
    reactive: { kickFlash: 0.3, kickZoom: 0.06, kickShake: 0.003, chroma: 0.8, bassBloom: 0.6, hatFlicker: 0.2, grain: 0.08, glitch: 0.1, drift: 0.6, speed: 1.3 },
    typography: { family: "'Eurostile', 'Orbitron', 'Avenir Next', sans-serif", weight: 800, tracking: "0.2em", transform: "uppercase" },
    prompts: {
      intro: ["neon futuristic city skyline at night seen from a hovering drone, {vibe}", "chrome sculpture floating in a dark void, cyan rim light, {vibe}"],
      build: ["hyperspace tunnel of cyan and magenta light streaks, {vibe}", "spaceship cockpit view accelerating toward a neon megacity, {vibe}"],
      drop: ["giant sci-fi stage with laser arrays firing into the sky, chrome and neon, {vibe}", "liquid chrome waves under violet lasers, {vibe}", "neon grid landscape with a massive glowing portal, {vibe}"],
      breakdown: ["floating crystals refracting violet light in zero gravity, {vibe}"],
      outro: ["neon city fading into dawn haze, {vibe}"],
    },
    look: "futuristic, neon, chrome, electric cyan, magenta and violet, lasers, hyperspace, sci-fi, glossy, ultra detailed, cinematic lighting",
    negative: NEGATIVE_BASE,
  },
};

export const presetConfig = (id: string): PresetConfig =>
  PRESET_CONFIGS[id as PresetConfig["id"]] ?? PRESET_CONFIGS.melodic;

/** Per-project style choices (saved as projects/<id>/style.json). */
export type StyleConfig = {
  intensity: number; // 0..1.5 multiplier on all reactive effects
  cutRate: number; // 0.5 (slower) .. 2 (faster) multiplier on cut frequency
  hueShift: number; // degrees, rotates the preset palette
  titleCard: boolean;
  useCover: boolean;
  debug: boolean; // beat/bar overlay for checking sync
};

export const DEFAULT_STYLE: StyleConfig = { intensity: 1, cutRate: 1, hueShift: 0, titleCard: true, useCover: true, debug: false };
