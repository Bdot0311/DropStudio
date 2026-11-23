import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { addAsset, getProject, updateProject } from "@/lib/projects";
import { projectDir, projectFile } from "@/lib/paths";
import { error, json } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const AUDIO = [".wav", ".aif", ".aiff", ".mp3", ".flac"];
const IMAGE = [".jpg", ".jpeg", ".png", ".webp"];

function safeName(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name)).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "file";
  return base + ext;
}

/** PUT /api/projects/:id/upload?kind=audio|cover|photo&name=My Track.wav  (raw file body, streamed to disk) */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return error("Project not found", 404);
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const name = safeName(url.searchParams.get("name") || "upload");
  const ext = path.extname(name);
  if (!req.body) return error("Empty upload");

  let filename: string;
  if (kind === "audio") {
    if (!AUDIO.includes(ext)) return error(`Unsupported audio format "${ext}". Use WAV, AIFF, MP3 or FLAC.`);
    filename = `source${ext}`;
  } else if (kind === "cover" || kind === "photo" || kind === "character") {
    if (!IMAGE.includes(ext)) return error(`Unsupported image format "${ext}". Use JPG, PNG or WebP.`);
    fs.mkdirSync(path.join(projectDir(id), "images"), { recursive: true });
    filename = `images/${kind}-${Date.now().toString(36)}-${name}`;
  } else {
    return error("Unknown upload kind");
  }

  fs.mkdirSync(projectDir(id), { recursive: true });
  const target = projectFile(id, filename);
  const tmp = target + ".part";
  try {
    await pipeline(Readable.fromWeb(req.body as unknown as WebReadableStream), fs.createWriteStream(tmp));
    fs.renameSync(tmp, target);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    return error(`Upload failed: ${(e as Error).message}`, 500);
  }

  if (kind === "audio") {
    // Remove any older source file with a different extension.
    for (const f of fs.readdirSync(projectDir(id))) {
      if (f.startsWith("source.") && f !== filename) fs.rmSync(projectFile(id, f), { force: true });
    }
    const updated = updateProject(id, { audio_file: filename, playback_file: null, status: "uploaded", bpm: null, musical_key: null });
    return json({ project: updated });
  }
  return json({ asset: addAsset(id, kind as "cover" | "photo" | "character", filename) });
}
