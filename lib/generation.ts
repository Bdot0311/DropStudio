// Shared by the API (estimates) and the worker (actual generation), so the estimate shown
// before you confirm uses exactly the same cache keys and prices as the real run.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";
import { clipCost, imageCost, selectedModels, type ModelDef, type ProviderId } from "./models";
import { characterPaths, fullPrompt, type Shot } from "./shots";
import { cacheGet, cacheKey } from "./spend";

export type Tier = "draft" | "final";

function fileHash(rel: string | null): string {
  if (!rel) return "";
  const p = path.join(DATA_DIR, rel);
  return fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex").slice(0, 16) : rel;
}

/** Character shots use the reference-image model; everything else the normal image model. */
export function keyframeModel(m: ReturnType<typeof selectedModels>, shot: Shot): { model: ModelDef; refs: string[] } {
  const refs = shot.character ? characterPaths(shot.project_id) : [];
  return refs.length ? { model: m.character, refs } : { model: m.image, refs: [] };
}

export function keyframeKey(provider: ProviderId, model: ModelDef, shot: Shot, refs: string[] = []): string {
  const { prompt, negative } = fullPrompt(shot.project_id, shot);
  const refHash = refs.map((f) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex").slice(0, 12));
  return cacheKey({ kind: "image", provider, model: model.id, input: model.input ?? {}, prompt, negative, seed: shot.seed, ...(refHash.length ? { refs: refHash } : {}) });
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
  let model = kind === "keyframes" ? m.image : m[tier];
  let unit = kind === "keyframes" ? imageCost(model) : clipCost(model);
  let cached = 0, total = 0, withCharacter = 0;
  for (const s of shots) {
    let key: string, u = unit;
    if (kind === "keyframes") {
      const km = keyframeModel(m, s);
      key = keyframeKey(m.provider, km.model, s, km.refs);
      u = imageCost(km.model);
      if (km.refs.length) withCharacter++;
    } else key = clipKey(m.provider, model, s);
    if (cacheGet(key)) cached++;
    else total += u;
  }
  if (kind === "keyframes" && withCharacter === shots.length && shots.length) { model = m.character; unit = imageCost(model); }
  const paid = shots.length - cached;
  const secs = model.clip_seconds ?? 5;
  const unitText =
    kind === "keyframes" ? `$${unit.toFixed(3)} each`
    : model.price.per_second !== undefined ? `${secs}s × $${model.price.per_second.toFixed(3)}/s`
    : `$${unit.toFixed(2)} each`;
  const mixed = kind === "keyframes" && withCharacter > 0 && withCharacter < shots.length;
  const summary = mixed
    ? `${paid} images (${withCharacter} featuring your character at $${imageCost(m.character).toFixed(3)}, the rest at $${imageCost(m.image).toFixed(3)}) ≈ $${total.toFixed(2)}${cached ? ` (${cached} already generated: free)` : ""}`
    : `${paid} ${kind === "keyframes" ? "image" : "clip"}${paid === 1 ? "" : "s"} × ${unitText} ≈ $${total.toFixed(2)}${cached ? ` (${cached} already generated: free)` : ""}`;
  return { kind, provider: m.provider, model: mixed ? `${m.character.label} + ${m.image.label}` : model.label, count: shots.length, cached, unitCost: unit, total, summary };
}
