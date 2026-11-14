// Genre presets: the creative brain. Phase 1 uses the names/palettes for the UI; the renderer
// and prompt builder (Phases 2-3) read the full configs from this same folder.

export type PresetId = "melodic" | "tech_house" | "techno" | "future_rave";

export type PresetSummary = {
  id: PresetId;
  name: string;
  tagline: string;
  palette: string[];
};

export const PRESETS: PresetSummary[] = [
  { id: "melodic", name: "Melodic house / techno", tagline: "Cinematic, ethereal, vast landscapes, slow drift", palette: ["#0b1d3a", "#127c84", "#f2a65a", "#ff7e5f"] },
  { id: "tech_house", name: "Tech house", tagline: "Warm, groovy, warehouse and rooftop swagger", palette: ["#ff8c42", "#e83f6f", "#ffd166", "#7a2e8e"] },
  { id: "techno", name: "Techno", tagline: "Dark, industrial, concrete and lasers", palette: ["#0a0a0a", "#5c5c5c", "#e6e6e6", "#ff1e1e"] },
  { id: "future_rave", name: "Future rave", tagline: "Neon cities, chrome, lasers, hyperspace", palette: ["#00f0ff", "#ff00d4", "#7b2cff", "#ffffff"] },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
