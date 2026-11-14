import { createProject, listProjects, PROJECT_FIELDS } from "@/lib/projects";
import { json, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  return json(listProjects());
}

export async function POST(req: Request) {
  const body = await readJson(req);
  const input = Object.fromEntries(PROJECT_FIELDS.filter((k) => typeof body[k] === "string").map((k) => [k, body[k]]));
  return json(createProject(input), 201);
}
