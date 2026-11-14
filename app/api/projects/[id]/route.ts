import { deleteProject, getProject, listAssets, readMusicMap, updateProject, PROJECT_FIELDS } from "@/lib/projects";
import { activeJob, latestJob } from "@/lib/jobs";
import { error, json, readJson } from "@/lib/http";
import { PRESETS } from "@/lib/presets";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return error("Project not found", 404);
  const map = readMusicMap(id);
  return json({
    project,
    assets: listAssets(id),
    hasMusicMap: !!map,
    analyzeJob: activeJob(id, "analyze") ?? latestJob(id, "analyze") ?? activeJob(id, "make_fixture"),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getProject(id)) return error("Project not found", 404);
  const body = await readJson(req);
  const fields: Record<string, unknown> = {};
  for (const k of PROJECT_FIELDS) if (typeof body[k] === "string") fields[k] = (body[k] as string).trim();
  if (fields.preset && !PRESETS.some((p) => p.id === fields.preset)) return error("Unknown preset");
  if (fields.mode && !["visualizer", "montage", "hybrid"].includes(fields.mode as string)) return error("Unknown mode");
  return json(updateProject(id, fields));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  deleteProject(id);
  return json({ ok: true });
}
