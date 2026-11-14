import { createProject } from "@/lib/projects";
import { enqueueJob } from "@/lib/jobs";
import { json } from "@/lib/http";

export const runtime = "nodejs";

/** Creates a demo project with the synthetic 128 BPM test track and analyzes it. */
export async function POST() {
  const project = createProject({ title: "Test Fixture (128 BPM)", artist: "Drop Studio", preset: "techno", vibe: "" });
  const job = enqueueJob("make_fixture", "python", project.id, {});
  return json({ project, job }, 201);
}
