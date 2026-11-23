// Shared types (client + server). Keep in sync with db/schema.sql and the worker.

export const SECTION_TYPES = ["intro", "build", "drop", "breakdown", "outro"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export type Section = { start: number; end: number; type: SectionType; energy: number; bars?: number };
export type Phrase = { start: number; bars: number; section?: SectionType };

export type MusicMap = {
  version: number;
  duration: number;
  source?: { sample_rate: number; channels: number; codec: string };
  bpm: number;
  key: string | null;
  camelot?: string | null;
  beats: number[];
  downbeats: number[];
  phrases: Phrase[];
  sections: Section[];
  drops: number[];
  envelopes: { fps: number; rms: number[]; low: number[]; mid: number[]; high: number[]; kick: number[]; bass: number[]; drums: number[]; other: number[] };
  onsets: { kick: number[]; snare_clap: number[]; hats: number[] };
  analysis: {
    engine: string;
    beat_confidence: number;
    constant_tempo: boolean;
    key_confidence?: number;
    stems: boolean;
    first_downbeat: number;
    manual_downbeat: boolean;
    seconds: number;
    notes: string[];
    edited: boolean;
  };
};

export type ProjectStatus = "new" | "uploaded" | "analyzing" | "analyzed" | "error";
export type RenderMode = "visualizer" | "montage" | "hybrid";

export type Project = {
  id: string;
  title: string;
  artist: string;
  preset: string;
  mode: RenderMode;
  vibe: string;
  audio_file: string | null;
  playback_file: string | null;
  duration: number | null;
  bpm: number | null;
  musical_key: string | null;
  status: ProjectStatus;
  spend_usd: number;
  created_at: string;
  updated_at: string;
};

export type Asset = { id: string; project_id: string; kind: "cover" | "photo" | "character"; filename: string; created_at: string };

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";
export type Job = {
  id: string;
  project_id: string | null;
  type: string;
  worker: "python" | "node";
  status: JobStatus;
  progress: number;
  message: string;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string | null;
};
