import type { ModelDef } from "../models";

export type GenRequest = {
  model: ModelDef;
  prompt: string;
  negative: string;
  seed: number;
  /** For image-to-video: local path of the keyframe image. */
  imagePath?: string;
  /** Character reference photos (local paths) for reference-image models. */
  referencePaths?: string[];
  /** First→last-frame video (AI morph between two shots): local path of the last frame. */
  endImagePath?: string;
  /** Upscale / cut-out: local path of the input video. */
  videoPath?: string;
  /** Called with a short status line while waiting on the provider. */
  onStatus?: (s: string) => void;
  signal?: AbortSignal;
};

/** Every adapter returns a URL to download (or a local file it already wrote). */
export type GenResult = { url?: string; file?: string };

export interface Provider {
  generateImage(r: GenRequest): Promise<GenResult>;
  imageToVideo(r: GenRequest): Promise<GenResult>;
  /** Video → higher-resolution video. */
  upscaleVideo?(r: GenRequest): Promise<GenResult>;
  /** Video → black/white subject mask video (same length). */
  matteVideo?(r: GenRequest): Promise<GenResult>;
}

export class ProviderError extends Error {
  constructor(message: string, public retryable = true) {
    super(message);
  }
}
