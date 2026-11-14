import { enqueueJob, getJob } from "@/lib/jobs";
import { updateProject } from "@/lib/projects";
import { error, json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return error("Job not found", 404);
  if (job.type === "analyze" && job.project_id) updateProject(job.project_id, { status: "analyzing" });
  return json(enqueueJob(job.type, job.worker, job.project_id, job.params), 202);
}
