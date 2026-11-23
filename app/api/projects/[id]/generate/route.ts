import { estimate, type Tier } from "@/lib/generation";
import { getShot, listShots, updateShot, type Shot } from "@/lib/shots";
import { assertBudget, BudgetError, budgetCap, projectSpend } from "@/lib/spend";
import { activeJob, enqueueJob } from "@/lib/jobs";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

/**
 * POST { kind: "keyframes" | "clips", shotIds?: string[], tier?: "draft"|"final", confirm?: boolean }
 * Without confirm: returns the cost estimate only (nothing is spent).
 * With confirm: checks the budget cap, then queues the job.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ kind?: string; shotIds?: string[]; tier?: Tier; confirm?: boolean }>(req);
  const kind = body.kind === "clips" ? "clips" : "keyframes";
  const all = listShots(id);
  let shots: Shot[];
  if (body.shotIds?.length) shots = body.shotIds.map(getShot).filter((s): s is Shot => !!s && s.project_id === id);
  else if (kind === "keyframes") shots = all.filter((s) => !s.keyframe && s.status !== "rejected");
  else shots = all.filter((s) => s.status === "approved");
  if (kind === "clips") shots = shots.filter((s) => s.keyframe);
  if (!shots.length) return error(kind === "keyframes" ? "No shots need keyframes." : "Approve some keyframes first: clips are only made from approved keyframes.", 409);

  const est = estimate(kind, shots, body.tier ?? "draft");
  const spent = projectSpend(id);
  const cap = budgetCap();
  const fits = spent + est.total <= cap + 1e-9;
  if (!body.confirm) return json({ estimate: est, spent, cap, fits, shotIds: shots.map((s) => s.id) });

  const jobType = kind === "keyframes" ? "gen_keyframes" : "gen_clips";
  if (activeJob(id, jobType)) return error("A batch is already running. Wait for it to finish.", 409);
  try {
    assertBudget(id, est.total);
  } catch (e) {
    if (e instanceof BudgetError) return error(e.message, 402);
    throw e;
  }
  for (const s of shots) updateShot(s.id, { status: kind === "keyframes" ? "keyframe_queued" : "clip_queued", error: null });
  const job = enqueueJob(jobType, "node", id, { shot_ids: shots.map((s) => s.id), tier: body.tier ?? "draft", estimate_usd: est.total });
  return json({ job, estimate: est }, 202);
}
