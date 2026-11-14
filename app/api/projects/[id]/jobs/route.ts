import { projectJobs } from "@/lib/jobs";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return json(projectJobs(id));
}
