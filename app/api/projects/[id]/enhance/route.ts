import { planCost, planEnhance } from "@/lib/enhance-plan";
import type { EnhKind } from "@/lib/enhance";
import { getProject } from "@/lib/projects";
import { assertBudget, BudgetError, budgetCap, projectSpend } from "@/lib/spend";
import { activeJob, enqueueJob, latestJob } from "@/lib/jobs";
import { readStyle } from "@/lib/style";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const KINDS: EnhKind[] = ["bridge", "upscale", "matte"];

/** Status of the finishing passes: how many are done, what the rest would cost. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getProject(id)) return error("Project not found", 404);
  const plans = await Promise.all(KINDS.map((k) => planEnhance(id, k)));
  const style = readStyle(id);
  return json({
    passes: Object.fromEntries(plans.map((p) => [p.kind, {
      done: p.done, total: p.total, pending: p.items.length, cost: planCost(p), model: p.model?.label ?? null, unavailable: p.unavailable ?? null,
    }])),
    style: { morph: style.morph ?? "off", textBehind: !!style.textBehind },
    job: activeJob(id, "enhance") ?? latestJob(id, "enhance"),
  });
}

/** POST { kind, confirm? }: without confirm returns the estimate only; with confirm queues the job. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readJson<{ kind?: string; confirm?: boolean }>(req);
  const kind = (KINDS as string[]).includes(body.kind ?? "") ? (body.kind as EnhKind) : null;
  if (!kind) return error("Unknown pass", 400);
  const plan = await planEnhance(id, kind);
  if (plan.unavailable) return error(plan.unavailable, 409);
  if (!plan.items.length) return error(plan.total ? "Everything is already done." : kind === "bridge" ? "No morphs to make: you need AI clips on both sides of a section change." : kind === "upscale" ? "All your clips are already 1080p." : "No clips yet.", 409);
  const total = planCost(plan);
  const spent = projectSpend(id);
  const cap = budgetCap();
  const estimate = { summary: plan.summary, total, model: plan.model!.label, provider: plan.provider, count: plan.items.length, cached: plan.items.filter((i) => i.cached).length };
  if (!body.confirm) return json({ estimate, spent, cap, fits: spent + total <= cap + 1e-9, shotIds: [] });
  if (activeJob(id, "enhance")) return error("A finishing pass is already running. Wait for it to finish.", 409);
  try {
    assertBudget(id, total);
  } catch (e) {
    if (e instanceof BudgetError) return error(e.message, 402);
    throw e;
  }
  const job = enqueueJob("enhance", "node", id, { kind, items: plan.items, estimate_usd: total });
  return json({ job, estimate }, 202);
}
