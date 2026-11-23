import { addShot, buildStoryboard, listShots, needsKeyframe } from "@/lib/shots";
import { budgetCap, projectSpend } from "@/lib/spend";
import { readModels, selectedModels, imageCost, clipCost } from "@/lib/models";
import { getProject } from "@/lib/projects";
import { getSetting } from "@/lib/settings";
import { activeJob, latestJob } from "@/lib/jobs";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getProject(id)) return error("Project not found", 404);
  const m = selectedModels();
  const shots = listShots(id);
  return json({
    shots,
    needKeyframes: shots.filter((s) => needsKeyframe(s, m.provider)).length,
    otherProviderKeyframes: shots.filter((s) => s.keyframe && needsKeyframe(s, m.provider)).length,
    spent: projectSpend(id),
    cap: budgetCap(),
    provider: { id: m.provider, label: readModels().providers[m.provider].label },
    keys: { fal: !!getSetting("fal_key"), replicate: !!getSetting("replicate_token") },
    prices: {
      image: { model: m.image.label, unit: imageCost(m.image) },
      draft: { model: m.draft.label, unit: clipCost(m.draft), seconds: m.draft.clip_seconds ?? 5 },
      final: { model: m.final.label, unit: clipCost(m.final), seconds: m.final.clip_seconds ?? 5 },
    },
    jobs: {
      keyframes: activeJob(id, "gen_keyframes") ?? latestJob(id, "gen_keyframes"),
      clips: activeJob(id, "gen_clips") ?? latestJob(id, "gen_clips"),
    },
  });
}

/** { action: "build", replace?: boolean } | { action: "add", sectionIndex: number } */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readJson<{ action?: string; replace?: boolean; sectionIndex?: number }>(req);
  try {
    if (body.action === "add") return json(addShot(id, Number(body.sectionIndex)));
    return json(buildStoryboard(id, { replace: body.replace ?? true }));
  } catch (e) {
    return error((e as Error).message, 409);
  }
}
