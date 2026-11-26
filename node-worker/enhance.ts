// Finishing passes: AI morphs between shots, 1080p upscales, subject cut-outs (text behind you).
// Same rules as generation: cache hit → $0; otherwise budget check per item → provider → save → spend.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../lib/paths";
import { run, probe } from "../lib/ffmpeg";
import { selectedModels } from "../lib/models";
import { getProvider } from "../lib/providers";
import { ProviderError } from "../lib/providers/types";
import { getShot } from "../lib/shots";
import { enhancementIndex, putEnhancement, type EnhKind } from "../lib/enhance";
import { bridgePrompt, KIND_LABEL, type EnhItem } from "../lib/enhance-plan";
import { assertBudget, cacheGet, cachePut, recordSpend } from "../lib/spend";
import { fileHash } from "../lib/generation";
import type { Job } from "../lib/types";
import type { Ctx } from "./render";
import { Cancelled, status } from "./queue";
import { save, withRetries } from "./generate";

const abs = (rel: string) => path.join(DATA_DIR, rel);

/** Last frame of a clip, cached next to it (the start of a morph). */
async function lastFrame(rel: string): Promise<string> {
  const out = path.join(DATA_DIR, "cache", `${fileHash(rel)}-last.png`);
  if (!fs.existsSync(out)) await run("ffmpeg", ["-v", "error", "-y", "-sseof", "-0.25", "-i", abs(rel), "-frames:v", "1", "-update", "1", out]);
  return out;
}

/** Clip + black/white mask → VP9 WebM with alpha (just the subject, transparent elsewhere). */
async function cutOut(clipRel: string, maskFile: string, key: string): Promise<string> {
  const rel = `cache/${key}.webm`;
  await run("ffmpeg", [
    "-v", "error", "-y", "-i", abs(clipRel), "-i", maskFile,
    "-filter_complex", "[1:v][0:v]scale2ref[m][c];[m]format=gray[g];[c][g]alphamerge,format=yuva420p",
    "-shortest", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "28", "-deadline", "good", "-cpu-used", "4", abs(rel),
  ]);
  return rel;
}

async function downloadTmp(r: { url?: string; file?: string }): Promise<string> {
  if (r.file) return r.file;
  if (!r.url) throw new ProviderError("The provider returned nothing to download.", false);
  const res = await fetch(r.url);
  if (!res.ok) throw new ProviderError(`Downloading the result failed (${res.status})`);
  const f = path.join(os.tmpdir(), `drop-${crypto.randomUUID()}.mp4`);
  fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  return f;
}

async function enhance(job: Job, ctx: Ctx) {
  const pid = job.project_id!;
  const { kind, items } = job.params as { kind: EnhKind; items: EnhItem[] };
  const m = selectedModels();
  const model = m[kind];
  if (!model) throw new Error(`${KIND_LABEL[kind]}s aren't available with this provider.`);
  const provider = getProvider(m.provider);
  let done = 0, paid = 0, cached = 0, failed = 0, spent = 0;
  const errors: string[] = [];

  for (const it of items) {
    if (status(job.id) === "cancelled") throw new Cancelled();
    const ix = enhancementIndex(pid);
    const a = getShot(it.shotId);
    const b = it.toShotId ? getShot(it.toShotId) : null;
    try {
      if (!a?.clip) throw new ProviderError("This shot has no clip.", false);
      const clipRel = ix.clipOf(a)!;
      const source = kind === "bridge" ? ix.bridgeSource(a, b!) : kind === "upscale" ? a.clip : clipRel;
      const hit = cacheGet(it.key);
      let file: string, duration: number | null = null;
      if (hit && fs.existsSync(abs(hit.file))) {
        file = hit.file;
        duration = hit.duration;
        cached++;
      } else {
        assertBudget(pid, it.cost);
        const onRetry = (n: number, e: Error) => ctx.progress(done / items.length, `Retrying (${n}/2): ${e.message}`);
        if (kind === "bridge") {
          if (!b?.keyframe) throw new ProviderError("The next shot has no keyframe.", false);
          const { prompt, negative } = bridgePrompt(pid);
          const first = await lastFrame(clipRel);
          const res = await withRetries(() => provider.imageToVideo({ model, prompt, negative, seed: a.seed, imagePath: first, endImagePath: abs(b.keyframe!) }), onRetry);
          file = await save(res, it.key, "mp4");
        } else if (kind === "upscale") {
          if (!provider.upscaleVideo) throw new ProviderError("This provider can't upscale video.", false);
          const res = await withRetries(() => provider.upscaleVideo!({ model, prompt: "", negative: "", seed: a.seed, videoPath: abs(a.clip!) }), onRetry);
          file = await save(res, it.key, "mp4");
        } else {
          if (!provider.matteVideo) throw new ProviderError("This provider can't cut out video.", false);
          const res = await withRetries(() => provider.matteVideo!({ model, prompt: "", negative: "", seed: a.seed, videoPath: abs(clipRel) }), onRetry);
          const mask = await downloadTmp(res);
          try { file = await cutOut(clipRel, mask, it.key); } finally { fs.rmSync(mask, { force: true }); }
        }
        duration = (await probe(abs(file))).duration || null;
        cachePut({ key: it.key, file, kind: "video", provider: m.provider, model: model.id, usd: it.cost, duration });
        recordSpend({ projectId: pid, shotId: a.id, kind: "video", provider: m.provider, model: model.id, usd: it.cost, cacheKey: it.key });
        paid++;
        spent += it.cost;
      }
      putEnhancement({ project_id: pid, kind, shot_id: a.id, to_shot_id: b?.id ?? "", source: source!, file, duration });
    } catch (e) {
      if (e instanceof Cancelled) throw e;
      failed++;
      errors.push((e as Error).message);
    }
    done++;
    ctx.progress(done / items.length, `${done} of ${items.length} ${KIND_LABEL[kind]}s · ${paid} made, ${cached} from cache${failed ? `, ${failed} failed` : ""}`);
  }
  if (items.length && failed === items.length) throw new Error(`All ${items.length} ${KIND_LABEL[kind]}s failed. ${errors[0] ?? ""}`.trim());
  return { kind, made: paid, cached, failed, errors: errors.slice(0, 3), spent_usd: +spent.toFixed(4), model: model.id };
}

export const ENHANCE_HANDLERS = { enhance: (job: Job, ctx: Ctx) => enhance(job, ctx) };
