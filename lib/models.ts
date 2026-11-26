// Model IDs and prices live in config/models.json (edit it any time; read fresh on every call).
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./paths";
import { getSetting } from "./settings";

export type ProviderId = "fal" | "replicate" | "comfyui" | "mock";
export type ModelPrice = { per_image?: number; per_second?: number; per_video?: number; per_megapixel_frame?: number };
export type ModelDef = {
  id: string;
  label: string;
  tier?: "draft" | "final";
  price: ModelPrice;
  clip_seconds?: number;
  input?: Record<string, unknown>;
  fields?: Record<string, string>;
  output?: string;
  /** Shown as the recommended pick in Settings. */
  recommended?: boolean;
  /** Upscale models: output height (for the estimate). */
  target_height?: number;
};
export type ModelsConfig = { providers: Record<ProviderId, { label: string; image: ModelDef[]; image_to_video: ModelDef[]; character_image?: ModelDef[]; bridge?: ModelDef[]; upscale?: ModelDef[]; matte?: ModelDef[] }> };

export function readModels(): ModelsConfig {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "config", "models.json"), "utf8"));
}

export function activeProvider(): ProviderId {
  const p = getSetting("default_provider") as ProviderId;
  return (["fal", "replicate", "comfyui", "mock"] as ProviderId[]).includes(p) ? p : "mock";
}

/** The models the user picked in Settings (falls back to the first/tiered entry). */
export function selectedModels(provider = activeProvider()) {
  const cfg = readModels().providers[provider];
  if (!cfg) throw new Error(`Unknown provider "${provider}"`);
  const pick = (list: ModelDef[], id: string, tier?: string) =>
    list.find((m) => m.id === id) ?? list.find((m) => !tier || m.tier === tier) ?? list[0];
  return {
    provider,
    image: pick(cfg.image, getSetting(`${provider}_image_model` as never)),
    // Keyframes that feature the user's character use a reference-image model.
    character: pick(cfg.character_image?.length ? cfg.character_image : cfg.image, getSetting(`${provider}_character_model` as never)),
    draft: pick(cfg.image_to_video, getSetting(`${provider}_video_draft` as never), "draft"),
    final: pick(cfg.image_to_video, getSetting(`${provider}_video_final` as never), "final"),
    // Finishing passes (only some providers offer them).
    bridge: cfg.bridge?.[0] ?? null,
    upscale: cfg.upscale?.[0] ?? null,
    matte: cfg.matte?.[0] ?? null,
  };
}

export function imageCost(m: ModelDef): number {
  return m.price.per_image ?? 0;
}

export function clipCost(m: ModelDef): number {
  const secs = m.clip_seconds ?? 5;
  return m.price.per_video ?? (m.price.per_second ?? 0) * secs;
}

export const usd = (n: number) => `$${n < 0.1 && n > 0 ? n.toFixed(3) : n.toFixed(2)}`;
