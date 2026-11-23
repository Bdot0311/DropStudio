import { defaultMetadata, readMetadata, writeMetadata, type Metadata } from "@/lib/metadata";
import { getProject } from "@/lib/projects";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getProject(id)) return error("Project not found", 404);
  return json(readMetadata(id));
}

/** PUT a partial Metadata, or { reset: true } to rebuild it from the template and your Settings links. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getProject(id)) return error("Project not found", 404);
  const body = await readJson<Partial<Metadata> & { reset?: boolean }>(req);
  if (body.reset) return json(writeMetadata(id, defaultMetadata(id)));
  return json(writeMetadata(id, body));
}
