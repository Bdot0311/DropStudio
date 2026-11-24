import { addShot, buildStoryboard, characterPaths, listShots, needsKeyframe } from "@/lib/shots";
import { budgetCap, projectSpend } from "@/lib/spend";
import { readModels, selectedModels, imageCost, clipCost } from "@/lib/models";
import { getProject, updateProject } from "@/lib/projects";
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
    mode: getProject(id)!.mode,
    shots,
    needKeyframes: shots.filter((s) => needsKeyframe(s, m.provider)).length,
    keyframeCost: shots.filter((s) => needsKeyframe(s, m.provider)).reduce((a, s) => a + imageCost(s.character && characterPaths(id).length ? m.character : m.image), 0),
    otherProviderKeyframes: shots.filter((s) => s.keyframe && needsKeyframe(s, m.provider)).length,
    spent: projectSpend(id),
    cap: budgetCap(),
    provider: { id: m.provider, label: readModels().providers[m.provider].label },
    keys: { fal: !!getSetting("fal_key"), replicate: !!getSetting("replicate_token") },
    hasCharacter: characterPaths(id).length > 0,
    prices: {
      image: { model: m.image.label, unit: imageCost(m.image) },
      character: { model: m.character.label, unit: imageCost(m.character) },
      draft: { model: m.draft.label, unit: clipCost(m.draft), seconds: m.draft.clip_seconds ?? 5 },
      final: { model: m.final.label, unit: clipCost(m.final), seconds: m.final.clip_seconds ?? 5 },
    },
    jobs: {
      keyframes: activeJob(id, "gen_keyframes") ?? latestJob(id, "gen_keyframes"),
      clips: activeJob(id, "gen_clips") ?? latestJob(id, "gen_clips"),
    },
  });
}

/**
 * { action: "build", replace?: boolean } | { action: "add", sectionIndex: number }
 * | { action: "coverage", mode: "hybrid" | "montage" }  switch where AI footage goes; adds shots for
 *   newly covered sections and keeps every existing shot (nothing generated is lost or re-billed).
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readJson<{ action?: string; replace?: boolean; sectionIndex?: number; mode?: string }>(req);
  try {
    if (body.action === "add") return json(addShot(id, Number(body.sectionIndex)));
    if (body.action === "coverage") {
      const mode = body.mode === "montage" ? "montage" : "hybrid";
      updateProject(id, { mode });
      return json(buildStoryboard(id, { onlyMissing: true }));
    }
    return json(buildStoryboard(id, { replace: body.replace ?? true }));
  } catch (e) {
    return error((e as Error).message, 409);
  }
}
