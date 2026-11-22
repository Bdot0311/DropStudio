import { getProject, readMusicMap } from "@/lib/projects";
import { activeJob, enqueueJob, projectJobs } from "@/lib/jobs";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Latest render job per kind (main / short / loop) plus thumbnail jobs. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const jobs = projectJobs(id, 100).filter((j) => j.type === "render" || j.type === "thumbnails");
  const latest: Record<string, unknown> = {};
  for (const j of jobs) {
    const key = j.type === "render" ? String((j.params as { kind?: string }).kind ?? "main") : `thumbnails${(j.params as { final?: boolean }).final ? "_final" : ""}`;
    if (!latest[key]) latest[key] = j;
  }
  return json(latest);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = getProject(id);
  if (!p) return error("Project not found", 404);
  if (!readMusicMap(id)) return error("Analyze the track first", 409);
  const body = await readJson<Record<string, unknown>>(req);
  const kind = String(body.kind ?? "main");
  if (!["main", "short", "loop"].includes(kind)) return error("Unknown render kind");
  const running = activeJob(id, "render");
  if (running && (running.params as { kind?: string }).kind === kind) return json(running);
  const allowed = ["kind", "width", "height", "fps", "crf", "debug", "startTime", "duration", "loopBars"];
  const params_ = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  return json(enqueueJob("render", "node", id, params_), 202);
}
