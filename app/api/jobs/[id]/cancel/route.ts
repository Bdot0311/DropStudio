import { cancelJob } from "@/lib/jobs";
import { getProject, readMusicMap, updateProject } from "@/lib/projects";
import { error, json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = cancelJob(id);
  if (!job) return error("Job not found", 404);
  if (job.project_id && getProject(job.project_id)?.status === "analyzing") {
    updateProject(job.project_id, { status: readMusicMap(job.project_id) ? "analyzed" : "uploaded" });
  }
  return json(job);
}
