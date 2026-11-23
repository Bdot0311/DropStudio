// Phase 3 acceptance check, run against the running app (npm run dev) with the free test provider.
//   node scripts/checks/pipeline-check.mjs [projectId]
// Without a project id it creates the 128 BPM test track project.
// Checks: spend ≤ estimate shown; regenerating one clip bills exactly one clip; re-running is free (cache);
// a hybrid render with the clips succeeds.
const BASE = process.env.DROP_URL || "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, method = "GET", body) {
  const res = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data?.error}`);
  return data;
}
async function waitJob(id, label) {
  for (;;) {
    const jobs = await api(`/api/projects/${PID}/jobs`);
    const j = jobs.find((x) => x.id === id);
    if (j?.status === "done") return j;
    if (j?.status === "error" || j?.status === "cancelled") throw new Error(`${label} failed: ${j.error}`);
    await sleep(1500);
  }
}
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) process.exitCode = 1; };

let PID = process.argv[2];
const settings = await api("/api/settings");
if (settings.default_provider !== "mock") {
  console.error(`The AI provider is "${settings.default_provider}". This check only runs on the free test provider (Settings → AI provider → Test provider).`);
  process.exit(2);
}
if (!PID) {
  const { project, job } = await api("/api/fixture", "POST");
  PID = project.id;
  console.log(`Created test project ${PID}; analyzing…`);
  await waitJob(job.id, "fixture");
  for (;;) { const p = await api(`/api/projects/${PID}`); if (p.project.status === "analyzed") break; if (p.analyzeJob?.status === "error") throw new Error(p.analyzeJob.error); await sleep(1500); }
}
await api(`/api/projects/${PID}/style`, "PUT", { mode: "hybrid" });

// Storyboard + keyframes
const shots = await api(`/api/projects/${PID}/shots`, "POST", { action: "build", replace: true });
ok(shots.length >= 8 && shots.length <= 20, `storyboard has ${shots.length} shots (8–20)`);
const spent0 = (await api(`/api/projects/${PID}/shots`)).spent;
const kEst = await api(`/api/projects/${PID}/generate`, "POST", { kind: "keyframes" });
console.log(`  keyframe estimate: ${kEst.estimate.summary}`);
const k = await api(`/api/projects/${PID}/generate`, "POST", { kind: "keyframes", confirm: true });
await waitJob(k.job.id, "keyframes");
for (const s of (await api(`/api/projects/${PID}/shots`)).shots) await api(`/api/projects/${PID}/shots/${s.id}`, "PATCH", { decision: "approve" });

// Clips
const cEst = await api(`/api/projects/${PID}/generate`, "POST", { kind: "clips", tier: "draft" });
console.log(`  clip estimate: ${cEst.estimate.summary}`);
const c = await api(`/api/projects/${PID}/generate`, "POST", { kind: "clips", tier: "draft", confirm: true });
await waitJob(c.job.id, "clips");
const after = await api(`/api/projects/${PID}/shots`);
const shown = kEst.estimate.total + cEst.estimate.total;
ok(after.shots.every((s) => s.status === "clip_ready"), `all ${after.shots.length} clips ready`);
ok(after.spent - spent0 <= shown + 1e-9, `spent $${(after.spent - spent0).toFixed(3)} ≤ estimate shown $${shown.toFixed(3)}`);

// Regenerate one clip → exactly one clip billed.
const one = after.shots[0];
await api(`/api/projects/${PID}/shots/${one.id}`, "PATCH", { reseedClip: true });
const oneEst = await api(`/api/projects/${PID}/generate`, "POST", { kind: "clips", tier: "draft", shotIds: [one.id] });
const r = await api(`/api/projects/${PID}/generate`, "POST", { kind: "clips", tier: "draft", shotIds: [one.id], confirm: true });
await waitJob(r.job.id, "regenerate");
const after2 = await api(`/api/projects/${PID}/shots`);
ok(Math.abs(after2.spent - after.spent - oneEst.estimate.unitCost) < 1e-9, `regenerating one clip billed exactly one clip ($${(after2.spent - after.spent).toFixed(3)})`);

// Asking again for clips that already exist is free (served from the cache).
const two = after2.shots[1];
await api(`/api/projects/${PID}/shots/${two.id}`, "PATCH", { decision: "undo" });
await api(`/api/projects/${PID}/shots/${two.id}`, "PATCH", { decision: "approve" });
const cachedEst = await api(`/api/projects/${PID}/generate`, "POST", { kind: "clips", tier: "draft", shotIds: [two.id] });
ok(cachedEst.estimate.total === 0 && cachedEst.estimate.cached === 1, `re-requesting an existing clip costs $0 (cache): "${cachedEst.estimate.summary}"`);

// Render the hybrid video (small, fast) to prove the editor uses the clips.
const props = await api(`/api/projects/${PID}/video-props`);
ok(props.clips.length === after2.shots.length, `editor sees ${props.clips.length} clips`);
if (process.env.SKIP_RENDER !== "1") {
  const job = await api(`/api/projects/${PID}/render`, "POST", { kind: "main", width: 640, height: 360, fps: 30 });
  const done = await waitJob(job.id, "render");
  ok(Math.abs(done.result.video_seconds - done.result.audio_seconds) < 0.05, `hybrid render done: ${done.result.output}, ${done.result.video_seconds.toFixed(2)}s video / ${done.result.audio_seconds.toFixed(2)}s audio`);
}
console.log(process.exitCode ? "FAIL" : "PASS", `(project ${PID})`);
