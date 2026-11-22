// Node worker: renders video (Remotion + FFmpeg) and, from Phase 3, runs AI generation and uploads.
// Started by `npm run dev`. Polls the shared SQLite job table for jobs with worker='node'.
import { db, nowIso } from "../lib/db";
import type { Job } from "../lib/types";
import { startAssetServer } from "./asset-server";
import { Cancelled, claim, failOrphans, status, update } from "./queue";
import { handleRender, handleThumbnails, type Ctx } from "./render";
import { closeBrowser } from "./remotion-host";
import { EXTRA_HANDLERS } from "./handlers";

type Handler = (job: Job, ctx: Ctx) => Promise<unknown>;
const HANDLERS: Record<string, Handler> = {
  render: handleRender,
  thumbnails: handleThumbnails,
  ...EXTRA_HANDLERS,
};

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const assets = await startAssetServer();
  const orphans = failOrphans();
  if (orphans) log(`Marked ${orphans} interrupted job(s) as failed (Retry resumes them).`);
  log("Render worker ready");
  // Heartbeat for the Health page.
  const beat = () => db().prepare("INSERT INTO settings (key, value) VALUES ('_render_worker_heartbeat', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(nowIso());
  beat();
  setInterval(() => { try { beat(); } catch { /* db busy */ } }, 5000).unref();

  let stopping = false;
  const stop = async () => {
    stopping = true;
    await closeBrowser();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    let job: Job | null = null;
    try {
      job = claim();
    } catch (e) {
      log("Could not read the job queue:", (e as Error).message);
    }
    if (!job) {
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }
    const id = job.id;
    let last = 0;
    const ctx: Ctx = {
      assetUrl: assets.url,
      progress: (p, message) => {
        const now = Date.now();
        if (now - last < 400 && p < 0.99) return;
        last = now;
        if (status(id) === "cancelled") throw new Cancelled();
        update(id, { progress: Math.round(p * 1000) / 1000, message });
      },
    };
    log(`Job ${id} (${job.type}) started`);
    try {
      const handler = HANDLERS[job.type];
      if (!handler) throw new Error(`Unknown job type: ${job.type}`);
      const result = await handler(job, ctx);
      update(id, { status: "done", progress: 1, message: "Done", result, finished_at: nowIso() });
      log(`Job ${id} done`);
    } catch (e) {
      if (e instanceof Cancelled || status(id) === "cancelled") {
        update(id, { message: "Cancelled", finished_at: nowIso() });
        log(`Job ${id} cancelled`);
      } else {
        const msg = (e as Error).message || String(e);
        log(`Job ${id} failed:`, (e as Error).stack || msg);
        update(id, { status: "error", error: friendly(msg), finished_at: nowIso() });
      }
    }
  }
}

function friendly(msg: string): string {
  if (/WebGL|webgl2|getContext/i.test(msg)) return `${msg} → In Settings → Rendering, try a different GL backend (swangle always works, just slower).`;
  if (/ENOSPC|no space/i.test(msg)) return "The disk is full. Free some space and click Retry (finished parts are reused).";
  return msg;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
