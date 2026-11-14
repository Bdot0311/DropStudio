import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { db } from "./db";
import { DATA_DIR, WORKER_URL } from "./paths";

export type Check = {
  id: string;
  name: string;
  status: "ok" | "warn" | "error" | "off";
  detail: string;
  fix?: string;
  optional?: boolean;
};

function which(cmd: string): string | null {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().split("\n")[0] : null;
}

type WorkerHealth = {
  python: string;
  platform: string;
  worker_loop: { alive: boolean; current_job: string | null };
  ffmpeg: boolean;
  packages: Record<string, { installed: boolean; version: string | null }>;
  features: { stems: boolean; allin1: boolean; stems_device?: string };
};

export async function runHealthChecks(): Promise<{ checks: Check[]; system: Record<string, string> }> {
  const checks: Check[] = [];
  const isMac = process.platform === "darwin";

  // Web app / DB
  try {
    db().prepare("SELECT 1").get();
    checks.push({ id: "db", name: "Project database", status: "ok", detail: "SQLite at data/drop.db" });
  } catch (e) {
    checks.push({ id: "db", name: "Project database", status: "error", detail: String(e), fix: "Check that the data/ folder is writable." });
  }

  // FFmpeg
  const ff = which("ffmpeg");
  const ffprobe = which("ffprobe");
  if (ff && ffprobe) {
    const v = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).stdout.split("\n")[0].replace("ffmpeg version ", "");
    checks.push({ id: "ffmpeg", name: "FFmpeg", status: "ok", detail: v.split(" ")[0] });
  } else {
    checks.push({ id: "ffmpeg", name: "FFmpeg", status: "error", detail: "Not found on PATH", fix: isMac ? "brew install ffmpeg" : "Install FFmpeg from ffmpeg.org" });
  }

  // Python worker
  let w: WorkerHealth | null = null;
  try {
    const res = await fetch(`${WORKER_URL}/health?deep=1`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    w = (await res.json()) as WorkerHealth;
  } catch {
    /* worker down */
  }
  if (!w) {
    checks.push({
      id: "worker", name: "Python analysis worker", status: "error", detail: "Not reachable on port 8765",
      fix: "Start the app with `npm run dev` (it starts the worker). If it still fails, run `npm run setup` and read the errors in the terminal.",
    });
  } else {
    checks.push({
      id: "worker", name: "Python analysis worker", status: w.worker_loop.alive ? "ok" : "warn",
      detail: `Python ${w.python} · ${w.platform}${w.worker_loop.current_job ? ` · running: ${w.worker_loop.current_job}` : ""}`,
      fix: w.worker_loop.alive ? undefined : "The job loop looks stuck. Restart `npm run dev`.",
    });
    const lib = w.packages.librosa;
    checks.push({
      id: "librosa", name: "Beat & section analysis (librosa)", status: lib.installed ? "ok" : "error",
      detail: lib.installed ? `librosa ${lib.version}` : "Not installed", fix: lib.installed ? undefined : "npm run setup",
    });
    checks.push({
      id: "stems", name: "Stem separation (Demucs)", optional: true,
      status: w.features.stems ? "ok" : "off",
      detail: w.features.stems ? `demucs ${w.packages.demucs.version} on ${(w.features.stems_device || "cpu").toUpperCase()}` : "Not installed (optional)",
      fix: w.features.stems ? undefined : "npm run setup -- --with-stems   (≈1 GB; uses the Apple GPU on M-series Macs)",
    });
    checks.push({
      id: "allin1", name: "allin1 structure analyzer", optional: true,
      status: w.features.allin1 ? "ok" : "off",
      detail: w.features.allin1 ? `allin1 ${w.packages.allin1.version}` : "Not installed (optional; the built-in EDM analyzer is used)",
      fix: w.features.allin1 ? undefined : "npm run setup -- --with-allin1   (experimental on Mac; safe to skip)",
    });
    if (!w.ffmpeg && ff) {
      checks.push({ id: "worker-ffmpeg", name: "FFmpeg visible to worker", status: "warn", detail: "The worker can't see FFmpeg", fix: "Restart your terminal, then `npm run dev`." });
    }
  }

  // Phase 2+ components (shown so the page is complete from day one)
  checks.push({ id: "remotion", name: "Video renderer (Remotion)", status: "off", optional: true, detail: "Arrives in Phase 2" });

  // Disk
  try {
    const s = fs.statfsSync(DATA_DIR);
    const freeGb = (s.bavail * s.bsize) / 1e9;
    checks.push({
      id: "disk", name: "Free disk space", status: freeGb > 10 ? "ok" : freeGb > 3 ? "warn" : "error",
      detail: `${freeGb.toFixed(1)} GB free`, fix: freeGb > 10 ? undefined : "Renders need several GB. Free up space or delete old projects.",
    });
  } catch {
    /* ignore */
  }

  return {
    checks,
    system: {
      node: process.versions.node,
      platform: `${os.platform()} ${os.arch()}`,
      cpus: `${os.cpus().length} × ${os.cpus()[0]?.model ?? "CPU"}`,
      memory: `${(os.totalmem() / 1e9).toFixed(0)} GB`,
    },
  };
}
