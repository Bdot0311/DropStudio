// Shared by the API (estimates) and the worker (actual generation), so the estimate shown
// before you confirm uses exactly the same cache keys and prices as the real run.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";
import { clipCost, imageCost, selectedModels, type ModelDef, type ProviderId } from "./models";
import { fullPrompt, type Shot } from "./shots";
import { cacheGet, cacheKey } from "./spend";

export type Tier = "draft" | "final";

function fileHash(rel: string | null): string {
  if (!rel) return "";
  const p = path.join(DATA_DIR, rel);
  return fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex").slice(0, 16) : rel;
}

export function keyframeKey(provider: ProviderId, model: ModelDef, shot: Shot): string {
  const { prompt, negative } = fullPrompt(shot.project_id, shot);
  return cacheKey({ kind: "image", provider, model: model.id, input: model.input ?? {}, prompt, negative, seed: shot.seed });
}

export function clipKey(provider: ProviderId, model: ModelDef, shot: Shot): string {
  const { prompt, negative } = fullPrompt(shot.project_id, shot);
  return cacheKey({ kind: "video", provider, model: model.id, input: model.input ?? {}, prompt, negative, seed: shot.seed, clipSeed: shot.clip_seed, image: fileHash(shot.keyframe) });
}

export type Estimate = {
  kind: "keyframes" | "clips";
  provider: ProviderId;
  model: string;
  count: number;
  cached: number;
  unitCost: number;
  total: number;
  summary: string;
};

export function estimate(kind: "keyframes" | "clips", shots: Shot[], tier: Tier = "draft"): Estimate {
  const m = selectedModels();
  const model = kind === "keyframes" ? m.image : m[tier];
  const unit = kind === "keyframes" ? imageCost(model) : clipCost(model);
  let cached = 0;
  for (const s of shots) {
    const key = kind === "keyframes" ? keyframeKey(m.provider, model, s) : clipKey(m.provider, model, s);
    if (cacheGet(key)) cached++;
  }
  const paid = shots.length - cached;
  const total = paid * unit;
  const secs = model.clip_seconds ?? 5;
  const unitText =
    kind === "keyframes" ? `$${unit.toFixed(3)} each`
    : model.price.per_second !== undefined ? `${secs}s × $${model.price.per_second.toFixed(3)}/s`
    : `$${unit.toFixed(2)} each`;
  const summary = `${paid} ${kind === "keyframes" ? "image" : "clip"}${paid === 1 ? "" : "s"} × ${unitText} ≈ $${total.toFixed(2)}${cached ? ` (${cached} already generated: free)` : ""}`;
  return { kind, provider: m.provider, model: model.label, count: shots.length, cached, unitCost: unit, total, summary };
}
