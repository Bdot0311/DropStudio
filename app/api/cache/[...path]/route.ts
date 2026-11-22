import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { DATA_DIR } from "@/lib/paths";

export const runtime = "nodejs";

/** Serves the shared AI clip/image cache (data/cache) with Range support. */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const root = path.join(DATA_DIR, "cache");
  const file = path.resolve(root, parts.join("/"));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
  const size = fs.statSync(file).size;
  const type = file.endsWith(".mp4") ? "video/mp4" : file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, {
      status: 206, headers: { "content-type": type, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1), "accept-ranges": "bytes" },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { "content-type": type, "content-length": String(size), "accept-ranges": "bytes", "cache-control": "max-age=31536000, immutable" } });
}
