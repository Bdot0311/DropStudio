// What each finishing pass would do and cost. Shared by the API (estimate) and the worker (run),
// so the confirm dialog and the bill use the same items, cache keys and prices.
import path from "node:path";
import { DATA_DIR } from "./paths";
import { clipCost, selectedModels, type ModelDef } from "./models";
import { presetConfig } from "./presets/configs";
import { getProject, readMusicMap } from "./projects";
import { liteMap } from "./render-props";
import { readStyle } from "./style";
import { listClipRefs, listShots, type Shot } from "./shots";
import { enhancementIndex, type EnhKind } from "./enhance";
import { fileHash } from "./generation";
import { cacheGet, cacheKey } from "./spend";
import { probe } from "./ffmpeg";
import { buildTimeline, morphPlan } from "../remotion/lib/timeline";

export type EnhItem = { shotId: string; toShotId: string; key: string; cost: number; cached: boolean; note: string };
export type EnhPlan = { kind: EnhKind; model: ModelDef | null; provider: string; items: EnhItem[]; done: number; total: number; summary: string; unavailable?: string };

export const KIND_LABEL: Record<EnhKind, string> = { bridge: "AI morph", upscale: "1080p upscale", matte: "cut-out" };

export function bridgePrompt(projectId: string): { prompt: string; negative: string } {
  const p = presetConfig(getProject(projectId)?.preset ?? "melodic");
  return {
    prompt: `seamless cinematic morph transition: the first scene flows and transforms continuously into the last scene, fluid camera move forward, particles and light carry the change, music video, ${p.look}`,
    negative: p.negative,
  };
}

/** Morph pairs (A → B) for the current edit; planned even while morphs are switched off. */
export function morphPairs(projectId: string): { a: Shot; b: Shot }[] {
  const project = getProject(projectId);
  const map = readMusicMap(projectId);
  if (!project || !map || project.mode === "visualizer") return [];
  const style = readStyle(projectId);
  const lite = liteMap(map);
  const clips = listClipRefs(projectId).map(({ matte: _m, ...c }) => c);
  if (clips.length < 2) return [];
  const segs = buildTimeline(lite, presetConfig(project.preset), style, project.mode, clips);
  const slots = morphPlan(segs, lite, style, style.morph && style.morph !== "off" ? style.morph : "sections");
  const shots = new Map(listShots(projectId).map((s) => [s.id, s]));
  const seen = new Set<string>();
  return slots.flatMap((s) => {
    const k = `${s.from}>${s.to}`;
    const a = shots.get(s.from), b = shots.get(s.to);
    if (seen.has(k) || !a || !b || !b.keyframe) return [];
    seen.add(k);
    return [{ a, b }];
  });
}

export async function planEnhance(projectId: string, kind: EnhKind): Promise<EnhPlan> {
  const m = selectedModels();
  const model = m[kind];
  const ix = enhancementIndex(projectId);
  const base: EnhPlan = { kind, model, provider: m.provider, items: [], done: 0, total: 0, summary: "" };
  if (!model) return { ...base, unavailable: `${KIND_LABEL[kind]}s need fal.ai (or the free Test provider). Switch provider in Settings.` };
  const shots = listShots(projectId).filter((s) => s.status !== "rejected" && s.clip);
  const item = (shotId: string, toShotId: string, key: string, cost: number, note = ""): EnhItem => {
    const cached = !!cacheGet(key);
    return { shotId, toShotId, key, cost: cached ? 0 : cost, cached, note };
  };

  if (kind === "bridge") {
    const pairs = morphPairs(projectId);
    base.total = pairs.length;
    const { prompt } = bridgePrompt(projectId);
    for (const { a, b } of pairs) {
      if (ix.bridgeOf(a, b)) { base.done++; continue; }
      const key = cacheKey({ kind: "bridge", provider: m.provider, model: model.id, input: model.input ?? {}, prompt, seed: a.seed, a: fileHash(ix.clipOf(a)), b: fileHash(b.keyframe) });
      base.items.push(item(a.id, b.id, key, clipCost(model)));
    }
  } else if (kind === "upscale") {
    const target = model.target_height ?? 1080;
    for (const s of shots) {
      if (ix.upscaled(s)) { base.total++; base.done++; continue; }
      const info = await probe(path.join(DATA_DIR, s.clip!)).catch(() => null);
      const v = info?.streams.find((x) => x.codec_type === "video");
      const h = v?.height ?? 0, w = v?.width ?? 0;
      if (!h || h >= target * 0.9) continue; // already sharp enough
      base.total++;
      const frames = Number(v?.nb_frames) || Math.round((info?.duration || s.clip_duration || 5) * 24);
      const mp = (((w * target) / h) * target) / 1e6;
      const cost = (model.price.per_megapixel_frame ?? 0) * mp * frames + (model.price.per_video ?? 0);
      const key = cacheKey({ kind: "upscale", provider: m.provider, model: model.id, input: model.input ?? {}, v: fileHash(s.clip) });
      base.items.push(item(s.id, "", key, cost, `${h}p → ${target}p`));
    }
  } else {
    for (const s of shots) {
      base.total++;
      if (ix.matteOf(s)) { base.done++; continue; }
      const key = cacheKey({ kind: "matte", provider: m.provider, model: model.id, input: model.input ?? {}, v: fileHash(ix.clipOf(s)) });
      base.items.push(item(s.id, "", key, model.price.per_video ?? (model.price.per_second ?? 0) * (s.clip_duration ?? 5)));
    }
  }
  const paid = base.items.filter((i) => !i.cached);
  const cost = paid.reduce((a, i) => a + i.cost, 0);
  const cachedN = base.items.length - paid.length;
  base.summary = `${paid.length} ${KIND_LABEL[kind]}${paid.length === 1 ? "" : "s"} ≈ $${cost.toFixed(2)}${cachedN ? ` (${cachedN} already made: free)` : ""}`;
  return base;
}

export const planCost = (p: EnhPlan) => p.items.reduce((a, i) => a + i.cost, 0);
