import { getProject, updateProject } from "@/lib/projects";
import { readStyle, writeStyle } from "@/lib/style";
import { PRESETS } from "@/lib/presets";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = getProject(id);
  if (!p) return error("Project not found", 404);
  return json({ style: readStyle(id), mode: p.mode, preset: p.preset });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = getProject(id);
  if (!p) return error("Project not found", 404);
  const body = await readJson<{ style?: Record<string, unknown>; mode?: string; preset?: string }>(req);
  const fields: Record<string, string> = {};
  if (body.mode && ["visualizer", "montage", "hybrid"].includes(body.mode)) fields.mode = body.mode;
  if (body.preset && PRESETS.some((x) => x.id === body.preset)) fields.preset = body.preset;
  if (Object.keys(fields).length) updateProject(id, fields);
  const style = body.style ? writeStyle(id, body.style) : readStyle(id);
  const np = getProject(id)!;
  return json({ style, mode: np.mode, preset: np.preset });
}
