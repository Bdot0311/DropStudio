import fs from "node:fs";
import { getProject, readMusicMap } from "@/lib/projects";
import { activeJob, enqueueJob, projectJobs } from "@/lib/jobs";
import { projectFile } from "@/lib/paths";
import { thumbnailCandidates } from "@/lib/publish";
import { getSetting } from "@/lib/settings";
import { error, json, readJson } from "@/lib/http";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Latest publish-related jobs + which outputs exist. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getProject(id)) return error("Project not found", 404);
  const latest: Record<string, Job> = {};
  for (const j of projectJobs(id, 200)) {
    const p = j.params as { kind?: string; final?: boolean; name?: string };
    const key =
      j.type === "render" ? `render_${p.name ?? p.kind ?? "main"}`
      : j.type === "thumbnails" ? (p.final ? "thumbnail_final" : "thumbnails")
      : j.type === "youtube_upload" ? `upload_${p.kind ?? "main"}`
      : j.type;
    if (!latest[key]) latest[key] = j;
  }
  const exists = (f: string) => fs.existsSync(projectFile(id, `renders/${f}`));
  const dir = projectFile(id, "renders");
  const cuts = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".mp4") && f !== "main.mp4" && f !== "loop.mp4").map((f) => ({ name: f.replace(/\.mp4$/, ""), bytes: fs.statSync(`${dir}/${f}`).size, mtime: fs.statSync(`${dir}/${f}`).mtimeMs }))
    : [];
  return json({
    jobs: latest,
    cuts,
    outputs: { main: exists("main.mp4"), short: exists("short.mp4"), loop: exists("loop.mp4"), thumbnail: exists("thumbnail.jpg") },
    youtube: { configured: !!getSetting("youtube_client_id") && !!getSetting("youtube_client_secret"), connected: !!getSetting("youtube_refresh_token"), channel: getSetting("youtube_channel") },
  });
}

/**
 * { action: "thumbnails", times?: number[] }  render candidate frames
 * { action: "thumbnail", at: number }         render the final thumbnail.jpg
 * { action: "export" }                        zip everything for manual upload
 * { action: "upload", kind: "main"|"short" }  upload to YouTube (private by default)
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = getProject(id);
  if (!p) return error("Project not found", 404);
  const body = await readJson<{ action?: string; times?: number[]; at?: number; kind?: string }>(req);
  switch (body.action) {
    case "thumbnails": {
      const map = readMusicMap(id);
      if (!map) return error("Analyze the track first", 409);
      const times = body.times?.length ? body.times : thumbnailCandidates(map, 8);
      return json(enqueueJob("thumbnails", "node", id, { times, showText: true }), 202);
    }
    case "thumbnail":
      if (typeof body.at !== "number") return error("Pick a frame first");
      return json(enqueueJob("thumbnails", "node", id, { times: [body.at], showText: true, final: true }), 202);
    case "export":
      if (activeJob(id, "export")) return error("Already exporting", 409);
      return json(enqueueJob("export", "node", id, {}), 202);
    case "upload": {
      const kind = body.kind === "short" ? "short" : "main";
      if (!getSetting("youtube_refresh_token")) return error("Connect your YouTube channel in Settings → YouTube first.", 409);
      const running = activeJob(id, "youtube_upload");
      if (running) return error("An upload is already running.", 409);
      return json(enqueueJob("youtube_upload", "node", id, { kind }), 202);
    }
    default:
      return error("Unknown action");
  }
}
