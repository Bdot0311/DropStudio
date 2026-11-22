// Bundles the Remotion project once (cached on disk) and keeps one headless browser open.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, openBrowser } from "@remotion/renderer";
import { DATA_DIR, ROOT } from "../lib/paths";
import { getSetting } from "../lib/settings";

type Browser = Awaited<ReturnType<typeof openBrowser>>;
let serveUrl: string | null = null;
let serveHash = "";
let browser: Browser | null = null;
let browserGl = "";

function sourceHash(): string {
  const h = crypto.createHash("sha1");
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, f);
      const s = fs.statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(f)) h.update(p + s.mtimeMs + s.size);
    }
  };
  walk(path.join(ROOT, "remotion"));
  walk(path.join(ROOT, "lib", "presets"));
  h.update(fs.statSync(path.join(ROOT, "lib", "types.ts")).mtimeMs.toString());
  return h.digest("hex").slice(0, 12);
}

export async function getServeUrl(log: (m: string) => void): Promise<string> {
  const hash = sourceHash();
  const outDir = path.join(DATA_DIR, "remotion-bundle", hash);
  if (serveUrl && serveHash === hash) return serveUrl;
  if (fs.existsSync(path.join(outDir, "index.html"))) {
    serveUrl = outDir;
    serveHash = hash;
    return outDir;
  }
  log("Preparing the video engine (first render after an update takes ~30 s)");
  fs.rmSync(path.join(DATA_DIR, "remotion-bundle"), { recursive: true, force: true });
  serveUrl = await bundle({ entryPoint: path.join(ROOT, "remotion", "index.ts"), outDir, onProgress: () => {} });
  serveHash = hash;
  return serveUrl;
}

export function glBackend(): "angle" | "egl" | "swiftshader" | "swangle" | "vulkan" | "angle-egl" {
  const s = getSetting("gl_backend");
  if (s && ["angle", "egl", "swiftshader", "swangle", "vulkan", "angle-egl"].includes(s)) return s as ReturnType<typeof glBackend>;
  return process.platform === "darwin" ? "angle" : "swangle";
}

export function concurrency(): number {
  const n = parseInt(getSetting("render_concurrency"), 10);
  if (n > 0) return n;
  return Math.max(1, Math.floor(os.cpus().length / 2));
}

export function chromiumOptions() {
  return { gl: glBackend() };
}

export async function getBrowser(log: (m: string) => void): Promise<Browser> {
  const gl = glBackend();
  if (browser && browserGl === gl) return browser;
  if (browser) await browser.close({ silent: true }).catch(() => {});
  const executable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  if (!executable) {
    log("Checking the headless browser (downloads once, ~100 MB)");
    await ensureBrowser();
  }
  browser = await openBrowser("chrome", { browserExecutable: executable, chromiumOptions: { gl } });
  browserGl = gl;
  return browser;
}

export async function closeBrowser() {
  if (browser) await browser.close({ silent: true }).catch(() => {});
  browser = null;
}
