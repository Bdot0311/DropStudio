import { getProject, updateProject } from "@/lib/projects";
import { activeJob, enqueueJob } from "@/lib/jobs";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return error("Project not found", 404);
  if (!project.audio_file) return error("Upload a track first", 409);
  const running = activeJob(id, "analyze");
  if (running) return json(running);
  const body = await readJson<{ stems?: boolean; first_downbeat?: number; engine?: string }>(req);
  const params_: Record<string, unknown> = { stems: !!body.stems, engine: body.engine || "auto" };
  if (typeof body.first_downbeat === "number") params_.first_downbeat = body.first_downbeat;
  updateProject(id, { status: "analyzing" });
  return json(enqueueJob("analyze", "python", id, params_), 202);
}
