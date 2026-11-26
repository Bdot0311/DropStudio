// Finishing passes check, run against the running app with the free test provider:
//   node scripts/checks/finishing-check.mjs <projectId>   (a project with clips, e.g. from check:pipeline)
// Upscale → cut-out → AI morph; spend matches each estimate; re-running is free; the morph and the
// cut-outs reach the editor; a render with both switched on succeeds.
const BASE = process.env.DROP_URL || "http://localhost:3000";
const PID = process.argv[2];
if (!PID) { console.error("usage: node scripts/checks/finishing-check.mjs <projectId>"); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, method = "GET", body) {
  const res = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status}: ${data?.error}`), { status: res.status });
  return data;
}
async function waitJob(id, label) {
  for (;;) {
    const j = (await api(`/api/projects/${PID}/jobs`)).find((x) => x.id === id);
    if (j?.status === "done") return j;
    if (j?.status === "error" || j?.status === "cancelled") throw new Error(`${label} failed: ${j.error}`);
    await sleep(1500);
  }
}
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) process.exitCode = 1; };

await api(`/api/projects/${PID}/style`, "PUT", { style: { morph: "sections", textBehind: true, editStyle: "capcut", captions: { drop: "DROP" } } });
for (const kind of ["upscale", "matte", "bridge"]) {
  const est = await api(`/api/projects/${PID}/enhance`, "POST", { kind });
  const { job } = await api(`/api/projects/${PID}/enhance`, "POST", { kind, confirm: true });
  const done = await waitJob(job.id, kind);
  ok(done.result.failed === 0, `${kind}: ${done.result.made} made, ${done.result.cached} cached, ${done.result.failed} failed`);
  ok(Math.abs(done.result.spent_usd - est.estimate.total) < 1e-6, `${kind}: billed $${done.result.spent_usd.toFixed(3)} = estimate $${est.estimate.total.toFixed(3)}`);
  const again = await api(`/api/projects/${PID}/enhance`, "POST", { kind }).catch((e) => e);
  ok(again.status === 409, `${kind}: asking again finds nothing left to pay for`);
}
const props = await api(`/api/projects/${PID}/video-props`);
const p = props.props ?? props;
ok((p.bridges ?? []).length > 0, `editor sees ${(p.bridges ?? []).length} AI morph(s)`);
ok(p.clips.every((c) => c.matteSrc), `editor sees cut-outs for all ${p.clips.length} clips`);
ok(p.clips.every((c) => /\/cache\/[0-9a-f]+\.mp4/.test(c.src)), "editor uses the upscaled clips");
const job = await api(`/api/projects/${PID}/render`, "POST", { kind: "main", width: 640, height: 360, fps: 30, name: "finishing" });
const r = await waitJob(job.id, "render");
ok(Math.abs(r.result.video_seconds - r.result.audio_seconds) < 0.05, `render with morphs + text behind you: ${r.result.output}, ${r.result.video_seconds.toFixed(2)}s video / ${r.result.audio_seconds.toFixed(2)}s audio`);
console.log(process.exitCode ? "FAIL" : `PASS (project ${PID})`);
