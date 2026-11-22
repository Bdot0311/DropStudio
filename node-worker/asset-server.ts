// Serves project files and the clip cache to headless Chrome during renders (localhost only).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { DATA_DIR, PROJECTS_DIR } from "../lib/paths";

const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".json": "application/json" };

export function startAssetServer(): Promise<{ port: number; url: (projectId: string, rel: string) => string }> {
  const roots: Record<string, string> = { projects: PROJECTS_DIR, cache: path.join(DATA_DIR, "cache") };
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || "/").split("?")[0]);
    const [, rootName, ...rest] = u.split("/");
    const root = roots[rootName];
    const file = root ? path.resolve(root, rest.join("/")) : "";
    if (!root || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      res.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1, "accept-ranges": "bytes", "access-control-allow-origin": "*" });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes", "access-control-allow-origin": "*" });
      fs.createReadStream(file).pipe(res);
    }
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        port,
        // "cache/<file>" goes to the shared clip cache; anything else is inside the project folder.
        url: (projectId, rel) => (rel.startsWith("cache/") ? `http://127.0.0.1:${port}/${rel}` : `http://127.0.0.1:${port}/projects/${projectId}/${rel}`),
      });
    })
  );
}
