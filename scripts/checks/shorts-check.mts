// Phase 4 acceptance check (run with the app running):  npx tsx scripts/checks/shorts-check.mts <projectId>
// The Shorts cut must start before the biggest drop, and the drop must land on a cut — both in the
// edit plan and in the rendered pixels (largest frame-to-frame change sits on the drop frame).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { suggestShortWindow, biggestDropSection } from "../../lib/publish";
import { presetConfig } from "../../lib/presets/configs";
import { buildTimeline } from "../../remotion/lib/timeline";
import type { VideoProps } from "../../remotion/types";

const BASE = process.env.DROP_URL || "http://localhost:3000";
const pid = process.argv[2];
if (!pid) throw new Error("usage: shorts-check.mts <projectId>");
const get = async (p: string, init?: RequestInit) => {
  const r = await fetch(BASE + p, init);
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r.json();
};
let failed = false;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };

const props = (await get(`/api/projects/${pid}/video-props`)) as VideoProps;
const map = props.map;
const win = suggestShortWindow(map);
const drop = biggestDropSection(map);
const len = win.end - win.start;
ok(win.start < drop.start && drop.start < win.end, `window ${win.start.toFixed(2)}–${win.end.toFixed(2)} s starts ${(drop.start - win.start).toFixed(2)} s before the drop at ${drop.start.toFixed(2)} s`);
ok(len >= 15 && len <= 45, `length ${len.toFixed(1)} s is within 15–45 s`);
const bar = (60 / map.bpm) * 4;
const lead = (drop.start - win.start) / bar;
ok(lead >= 1 - 1e-6 && lead <= 2 + 1e-6, `starts ${lead.toFixed(2)} bars before the drop (1–2 bars)`);

const segs = buildTimeline(map, presetConfig(props.preset), props.style, props.mode, props.clips);
ok(segs.some((s) => Math.abs(s.start - drop.start) < 1e-6), "the drop is a cut point in the edit plan");

const job = await get(`/api/projects/${pid}/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "short", startTime: win.start, duration: len, width: 360, height: 640, fps: 30 }) });
for (;;) {
  const r = (await get(`/api/projects/${pid}/render`)).short;
  if (r.id === job.id && r.status === "done") break;
  if (r.id === job.id && (r.status === "error" || r.status === "cancelled")) throw new Error(r.error);
  await new Promise((res) => setTimeout(res, 2000));
}
const file = path.join(process.cwd(), "projects", pid, "renders", "short.mp4");
const w = 36, h = 64;
const raw = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${w}:${h},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 }).stdout as Buffer;
const n = raw.length / (w * h);
const diff: number[] = [0];
for (let f = 1; f < n; f++) {
  let d = 0;
  for (let i = 0; i < w * h; i++) d += Math.abs(raw[f * w * h + i] - raw[(f - 1) * w * h + i]);
  diff.push(d / (w * h));
}
const dropFrame = Math.floor((drop.start - win.start) * 30 + 1e-6);
const lo = Math.max(1, dropFrame - 30), hi = Math.min(n - 1, dropFrame + 30);
let peak = lo;
for (let f = lo; f <= hi; f++) if (diff[f] > diff[peak]) peak = f;
ok(Math.abs(peak - dropFrame) <= 1, `biggest visual change within ±1 s of the drop is at frame ${peak} (drop frame ${dropFrame})`);
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,duration,width,height", "-of", "json", file]).stdout.toString();
const streams = JSON.parse(probe).streams as { codec_type: string; duration: string }[];
const v = streams.find((s) => s.codec_type === "video")!, a = streams.find((s) => s.codec_type === "audio")!;
ok(Math.abs(Number(v.duration) - Number(a.duration)) < 0.05, `video ${Number(v.duration).toFixed(2)} s / audio ${Number(a.duration).toFixed(2)} s`);
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
