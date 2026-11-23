// Export package (zip) and YouTube upload jobs.
import fs from "node:fs";
import path from "node:path";
import { run } from "../lib/ffmpeg";
import { metadataText, readMetadata } from "../lib/metadata";
import { projectDir, projectFile } from "../lib/paths";
import { getProject } from "../lib/projects";
import { accessToken, YT_API } from "../lib/youtube";
import type { Job } from "../lib/types";
import type { Ctx } from "./render";

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "track";

export async function handleExport(job: Job, ctx: Ctx) {
  const pid = job.project_id!;
  const p = getProject(pid)!;
  const dir = projectFile(pid, "renders");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "metadata.txt"), metadataText(pid));
  const cuts = fs.readdirSync(dir).filter((f) => f.endsWith(".mp4") && !["main.mp4", "loop.mp4"].includes(f)).sort();
  const files = ["main.mp4", ...cuts, "thumbnail.jpg", "loop.mp4", "metadata.txt"].filter((f) => fs.existsSync(path.join(dir, f)));
  if (!files.includes("main.mp4")) throw new Error("Render the main video first (Render step).");
  const name = `${slug(`${p.artist} ${p.title}`)}-youtube-package.zip`;
  const out = path.join(dir, name);
  fs.rmSync(out, { force: true });
  ctx.progress(0.2, `Zipping ${files.length} files`);
  // -0: store only (videos are already compressed); -j: no folder paths inside the zip.
  await run("zip", ["-0", "-j", out, ...files.map((f) => path.join(dir, f))]);
  return { output: `renders/${name}`, files, bytes: fs.statSync(out).size };
}

/** Resumable upload (YouTube Data API v3), private by default, then set the thumbnail. */
export async function handleYoutubeUpload(job: Job, ctx: Ctx) {
  const pid = job.project_id!;
  const params = job.params as { kind?: "main" | "short" };
  const kind = params.kind ?? "main";
  const file = projectFile(pid, `renders/${kind}.mp4`);
  if (!fs.existsSync(file)) throw new Error(`Render the ${kind === "main" ? "main video" : "Shorts cut"} first.`);
  const meta = readMetadata(pid);
  const size = fs.statSync(file).size;
  let token = await accessToken();

  ctx.progress(0.01, "Starting upload");
  const init = await fetch(YT_API + "/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size) },
    body: JSON.stringify({
      snippet: { title: kind === "short" ? meta.shortsTitle : meta.title, description: meta.description, tags: meta.tags, categoryId: "10" },
      status: { privacyStatus: meta.privacy, selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) throw new Error(youtubeError(init.status, await init.text()));
  const session = init.headers.get("location")!;

  const CHUNK = 16 * 1024 * 1024; // multiple of 256 KiB, as the API requires
  let offset = 0;
  let videoId: string | null = null;
  let failures = 0;
  const fd = fs.openSync(file, "r");
  try {
    while (offset < size) {
      const len = Math.min(CHUNK, size - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      let res: Response;
      try {
        res = await fetch(session, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "content-length": String(len), "content-range": `bytes ${offset}-${offset + len - 1}/${size}` }, body: buf });
      } catch {
        res = new Response(null, { status: 599 });
      }
      if (res.status === 308) {
        const range = res.headers.get("range");
        offset = range ? Number(range.split("-")[1]) + 1 : offset;
        failures = 0;
      } else if (res.ok) {
        videoId = ((await res.json()) as { id: string }).id;
        offset = size;
      } else if (res.status === 401) {
        token = await accessToken();
      } else if (res.status >= 500 || res.status === 599) {
        if (++failures > 6) throw new Error("YouTube kept failing mid-upload. Click Retry to try again.");
        await new Promise((r) => setTimeout(r, 2000 * 2 ** failures));
        // Ask where to resume from.
        const q = await fetch(session, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "content-range": `bytes */${size}` } }).catch(() => null);
        const range = q?.headers.get("range");
        offset = range ? Number(range.split("-")[1]) + 1 : 0;
      } else throw new Error(youtubeError(res.status, await res.text()));
      ctx.progress(0.02 + 0.9 * (offset / size), `Uploading ${(offset / 1e6).toFixed(0)} of ${(size / 1e6).toFixed(0)} MB`);
    }
  } finally {
    fs.closeSync(fd);
  }

  let thumbnail = "skipped";
  const thumb = projectFile(pid, "renders/thumbnail.jpg");
  if (kind === "main" && fs.existsSync(thumb)) {
    ctx.progress(0.95, "Setting the thumbnail");
    const t = await fetch(`${YT_API}/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "image/jpeg" }, body: fs.readFileSync(thumb) });
    thumbnail = t.ok ? "set" : `failed (${t.status}): custom thumbnails need a phone-verified channel`;
  }
  return { videoId, url: `https://youtu.be/${videoId}`, studio: `https://studio.youtube.com/video/${videoId}/edit`, privacy: meta.privacy, thumbnail, kind };
}

function youtubeError(status: number, body: string): string {
  if (/quotaExceeded/.test(body)) return "YouTube API daily quota used up (each upload costs a large share). Try again tomorrow, or upload the export package manually in YouTube Studio.";
  if (/uploadLimitExceeded/.test(body)) return "Your channel hit YouTube's daily upload limit. Try again tomorrow.";
  if (status === 401 || status === 403) return `YouTube refused the upload (${status}). Reconnect your channel in Settings → YouTube. Details: ${body.slice(0, 200)}`;
  return `YouTube error ${status}: ${body.slice(0, 300)}`;
}

export const PUBLISH_HANDLERS = {
  export: handleExport,
  youtube_upload: handleYoutubeUpload,
};

export { projectDir };
