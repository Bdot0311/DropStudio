// AI generation jobs. Order of operations for every item:
//   cache hit? → use it, $0 │ else budget check → provider call (retries w/ backoff) → save → record spend
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../lib/paths";
import { clipCost, imageCost, selectedModels, type ModelDef } from "../lib/models";
import { getProvider } from "../lib/providers";
import { ProviderError, type GenResult } from "../lib/providers/types";
import { fullPrompt, getShot, updateShot, type Shot } from "../lib/shots";
import { assertBudget, BudgetError, cacheGet, cachePut, recordSpend } from "../lib/spend";
import { clipKey, clipPrompt, keyframeKey, keyframeModel, type Tier } from "../lib/generation";
import { probe } from "../lib/ffmpeg";
import type { Job } from "../lib/types";
import type { Ctx } from "./render";
import { Cancelled, status } from "./queue";

const CACHE_DIR = path.join(DATA_DIR, "cache");

export async function save(result: GenResult, key: string, ext: string): Promise<string> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const target = path.join(CACHE_DIR, `${key}.${ext}`);
  if (result.file) {
    fs.copyFileSync(result.file, target);
    fs.rmSync(result.file, { force: true });
  } else if (result.url) {
    const res = await fetch(result.url);
    if (!res.ok) throw new ProviderError(`Downloading the result failed (${res.status})`);
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  } else throw new ProviderError("The provider returned nothing to download.", false);
  return `cache/${key}.${ext}`;
}

export async function withRetries<T>(fn: () => Promise<T>, onRetry: (n: number, e: Error) => void, tries = 3): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = !(e instanceof ProviderError) || e.retryable;
      if (n >= tries || !retryable) throw e;
      onRetry(n, e as Error);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (n - 1)));
    }
  }
}

/** Run `fn` over items with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

type Kind = "keyframes" | "clips";

async function generate(job: Job, ctx: Ctx, kind: Kind) {
  const pid = job.project_id!;
  const params = job.params as { shot_ids: string[]; tier?: Tier };
  const m = selectedModels();
  const model: ModelDef = kind === "keyframes" ? m.image : m[params.tier ?? "draft"];
  const provider = getProvider(m.provider);
  const unit = kind === "keyframes" ? imageCost(model) : clipCost(model);
  const shots = params.shot_ids.map(getShot).filter(Boolean) as Shot[];
  let done = 0, paid = 0, cachedHits = 0, failed = 0, spentTotal = 0;
  const label = kind === "keyframes" ? "keyframe" : "clip";

  await pool(shots, kind === "keyframes" ? 4 : 3, async (shot) => {
    if (status(job.id) === "cancelled") {
      updateShot(shot.id, { status: kind === "keyframes" ? (shot.keyframe ? "keyframe_ready" : "draft") : "approved" });
      return;
    }
    const fresh = getShot(shot.id)!;
    // Character shots: reference-image model + your photos.
    const km = kind === "keyframes" ? keyframeModel(m, fresh) : { model, refs: [] as string[] };
    const itemModel = km.model;
    const itemUnit = kind === "keyframes" ? imageCost(itemModel) : unit;
    const key = kind === "keyframes" ? keyframeKey(m.provider, itemModel, fresh, km.refs) : clipKey(m.provider, model, fresh);
    const hit = cacheGet(key);
    const ok = (rel: string, duration?: number | null) =>
      kind === "keyframes"
        ? updateShot(shot.id, { keyframe: rel, status: "keyframe_ready", error: null, clip: null, clip_duration: null })
        : updateShot(shot.id, { clip: rel, clip_duration: duration ?? 5, status: "clip_ready", error: null });

    try {
      if (hit && fs.existsSync(path.join(DATA_DIR, hit.file))) {
        ok(hit.file, hit.duration);
        cachedHits++;
      } else {
        if (kind === "clips" && !fresh.keyframe) throw new ProviderError("This shot has no keyframe yet.", false);
        assertBudget(pid, itemUnit); // per item, so a batch can never overshoot the cap
        updateShot(shot.id, { status: kind === "keyframes" ? "keyframe_running" : "clip_running", error: null });
        const { prompt, negative } = kind === "clips" ? clipPrompt(fresh) : fullPrompt(pid, fresh);
        const req = {
          model: itemModel, prompt, negative, referencePaths: km.refs, seed: kind === "clips" ? fresh.seed + fresh.clip_seed : fresh.seed,
          imagePath: fresh.keyframe ? path.join(DATA_DIR, fresh.keyframe) : undefined,
        };
        const result = await withRetries(
          () => (kind === "keyframes" ? provider.generateImage(req) : provider.imageToVideo(req)),
          (n, e) => updateShot(shot.id, { error: `Retrying (${n}/2): ${e.message}` })
        );
        const rel = await save(result, key, kind === "keyframes" ? "png" : "mp4");
        let duration: number | null = null;
        if (kind === "clips") duration = (await probe(path.join(DATA_DIR, rel))).duration || model.clip_seconds || 5;
        cachePut({ key, file: rel, kind: kind === "keyframes" ? "image" : "video", provider: m.provider, model: itemModel.id, usd: itemUnit, duration });
        recordSpend({ projectId: pid, shotId: shot.id, kind: kind === "keyframes" ? "image" : "video", provider: m.provider, model: itemModel.id, usd: itemUnit, cacheKey: key });
        paid++;
        spentTotal += itemUnit;
        ok(rel, duration);
      }
    } catch (e) {
      failed++;
      const msg = e instanceof BudgetError ? e.message : (e as Error).message;
      updateShot(shot.id, { status: "error", error: msg });
      if (e instanceof Cancelled) throw e;
    }
    done++;
    try {
      ctx.progress(done / shots.length, `${done} of ${shots.length} ${label}s · ${paid} generated, ${cachedHits} from cache${failed ? `, ${failed} failed` : ""}`);
    } catch (e) {
      if (e instanceof Cancelled) return;
      throw e;
    }
  });

  if (status(job.id) === "cancelled") throw new Cancelled();
  if (shots.length && failed === shots.length) {
    const first = shots.map((s) => getShot(s.id)?.error).find(Boolean);
    throw new Error(`All ${shots.length} ${label}s failed. ${first ?? ""}`.trim());
  }
  return { generated: paid, cached: cachedHits, failed, spent_usd: +spentTotal.toFixed(4), model: model.id, provider: m.provider };
}

export const GENERATE_HANDLERS = {
  gen_keyframes: (job: Job, ctx: Ctx) => generate(job, ctx, "keyframes"),
  gen_clips: (job: Job, ctx: Ctx) => generate(job, ctx, "clips"),
};
