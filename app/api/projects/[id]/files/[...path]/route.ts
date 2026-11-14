import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { projectFile } from "@/lib/paths";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac", ".aif": "audio/aiff", ".aiff": "audio/aiff",
  ".m4a": "audio/mp4", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".mp4": "video/mp4", ".zip": "application/zip", ".txt": "text/plain; charset=utf-8",
};

/** Serves project files with HTTP Range support (needed for seeking audio/video). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: parts } = await params;
  let file: string;
  try {
    file = projectFile(id, parts.join("/"));
  } catch {
    return new Response("Bad path", { status: 400 });
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error();
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-cache" };

  const range = req.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (!m[1] && m[2]) { start = stat.size - parseInt(m[2], 10); end = stat.size - 1; }
    if (start >= stat.size || start > end) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${stat.size}` } });
    }
    end = Math.min(end, stat.size - 1);
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "content-length": String(stat.size) } });
}
