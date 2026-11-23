// Video render jobs: chunked (resumable) Remotion render → FFmpeg concat → mux the ORIGINAL audio once.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { buildVideoProps } from "../lib/render-props";
import { projectDir, projectFile } from "../lib/paths";
import { probe, run, sampleRate } from "../lib/ffmpeg";
import type { Job } from "../lib/types";
import type { LoopProps, VideoProps } from "../remotion/types";
import { chromiumOptions, concurrency, getBrowser, getServeUrl } from "./remotion-host";
import { Cancelled, status } from "./queue";

export type Ctx = {
  progress: (p: number, message: string) => void;
  assetUrl: (projectId: string, rel: string) => string;
};

export type RenderKind = "main" | "short" | "loop";

type RenderParams = {
  kind?: RenderKind;
  width?: number;
  height?: number;
  fps?: number;
  crf?: number;
  debug?: boolean;
  startTime?: number; // short / loop
  duration?: number; // short
  loopBars?: number; // loop
  name?: string; // output file name for social cuts (renders/<name>.mp4)
};

const fmtEta = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

export async function handleRender(job: Job, ctx: Ctx) {
  const pid = job.project_id!;
  const p = job.params as RenderParams;
  const kind: RenderKind = p.kind ?? "main";
  const outName = (p.name ?? kind).replace(/[^a-z0-9_-]/gi, "").slice(0, 60) || kind;
  const fps = p.fps ?? 30;
  const [width, height] = kind === "main" ? [p.width ?? 1920, p.height ?? 1080] : [p.width ?? 1080, p.height ?? 1920];

  const { props: base, project, map } = buildVideoProps(pid, {
    assetUrl: (rel) => ctx.assetUrl(pid, rel),
    width, height, fps,
    startTime: p.startTime ?? 0,
    duration: p.duration,
    titleMode: kind === "main" ? "intro" : kind === "short" ? "persistent" : "none",
    debug: p.debug,
  });
  let compId = "Main";
  let props: VideoProps | LoopProps = base;
  if (kind === "loop") {
    const bar = (60 / map.bpm) * 4;
    const loopSeconds = (p.loopBars ?? 8) * bar;
    props = { ...base, loopSeconds, fadeSeconds: Math.min(bar, loopSeconds / 4), duration: loopSeconds } as LoopProps;
    compId = "Loop";
  }

  ctx.progress(0.01, "Preparing the video engine");
  const serveUrl = await getServeUrl((m) => ctx.progress(0.01, m));
  const browser = await getBrowser((m) => ctx.progress(0.02, m));
  const composition = await selectComposition({ serveUrl, id: compId, inputProps: props, puppeteerInstance: browser, chromiumOptions: chromiumOptions() });
  const total = composition.durationInFrames;

  // Same settings → same work folder, so a crashed or cancelled render resumes where it stopped.
  const hash = crypto.createHash("sha1").update(JSON.stringify({ props, compId, crf: p.crf ?? 18, serveUrl })).digest("hex").slice(0, 10);
  const work = projectFile(pid, `renders/.work/${outName}-${hash}`);
  fs.mkdirSync(work, { recursive: true });
  for (const d of fs.readdirSync(path.dirname(work))) if (d.startsWith(`${outName}-`) && d !== path.basename(work)) fs.rmSync(path.join(path.dirname(work), d), { recursive: true, force: true });

  const chunkFrames = fps * 20;
  const chunks: [number, number][] = [];
  for (let a = 0; a < total; a += chunkFrames) chunks.push([a, Math.min(total, a + chunkFrames) - 1]);
  const doneFrames = () => chunks.reduce((n, [a, b], i) => n + (fs.existsSync(path.join(work, `chunk-${i}.done`)) ? b - a + 1 : 0), 0);

  const startedAt = Date.now();
  const resumedFrames = doneFrames();
  if (resumedFrames) ctx.progress((resumedFrames / total) * 0.95, `Resuming: ${resumedFrames} of ${total} frames already rendered`);

  for (let i = 0; i < chunks.length; i++) {
    const [a, b] = chunks[i];
    const out = path.join(work, `chunk-${i}.mp4`);
    if (fs.existsSync(path.join(work, `chunk-${i}.done`))) continue;
    const before = doneFrames();
    const { cancelSignal, cancel } = makeCancelSignal();
    let cancelled = false;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: out,
      inputProps: props,
      frameRange: [a, b],
      crf: p.crf ?? 18,
      pixelFormat: "yuv420p",
      muted: true,
      enforceAudioTrack: false,
      concurrency: concurrency(),
      chromiumOptions: chromiumOptions(),
      puppeteerInstance: browser,
      timeoutInMilliseconds: 120_000,
      cancelSignal,
      onProgress: ({ renderedFrames }) => {
        const done = before + renderedFrames;
        const rate = (done - resumedFrames) / Math.max(0.001, (Date.now() - startedAt) / 1000);
        const eta = rate > 0 ? (total - done) / rate : 0;
        try {
          ctx.progress((done / total) * 0.95, `Rendering frame ${done} of ${total}${rate > 0 ? ` · ${rate.toFixed(1)} fps · about ${fmtEta(eta)} left` : ""}`);
        } catch (e) {
          if (e instanceof Cancelled && !cancelled) {
            cancelled = true;
            cancel();
          }
        }
      },
    }).catch((e) => {
      if (cancelled) throw new Cancelled();
      throw e;
    });
    fs.writeFileSync(path.join(work, `chunk-${i}.done`), "");
    if (status(job.id) === "cancelled") throw new Cancelled();
  }

  // Join chunks without re-encoding.
  ctx.progress(0.96, "Joining video");
  const list = path.join(work, "list.txt");
  fs.writeFileSync(list, chunks.map((_, i) => `file '${path.join(work, `chunk-${i}.mp4`).replace(/'/g, "'\\''")}'`).join("\n"));
  const video = path.join(work, "video.mp4");
  await run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", video]);

  fs.mkdirSync(projectFile(pid, "renders"), { recursive: true });
  const outRel = `renders/${outName}.mp4`;
  const output = projectFile(pid, outRel);
  const tmpOut = output + ".tmp.mp4";

  if (kind === "loop") {
    await run("ffmpeg", ["-v", "error", "-y", "-i", video, "-c", "copy", "-movflags", "+faststart", tmpOut]);
  } else {
    // Audio: encoded exactly once, from the original file, trimmed by sample count (sample-accurate).
    ctx.progress(0.97, "Adding your original audio (AAC 320 kbps)");
    const src = path.join(projectDir(pid), project.audio_file!);
    const sr = await sampleRate(src);
    const start = Math.round((props.startTime) * sr);
    const len = Math.round((total / fps) * sr);
    await run("ffmpeg", [
      "-v", "error", "-y", "-i", video, "-i", src,
      "-map", "0:v:0", "-map", "1:a:0",
      "-af", `atrim=start_sample=${start}:end_sample=${start + len},asetpts=PTS-STARTPTS`,
      "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", String(sr),
      "-movflags", "+faststart", tmpOut,
    ]);
  }
  fs.renameSync(tmpOut, output);
  const info = await probe(output);
  fs.rmSync(work, { recursive: true, force: true });
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  return {
    output: outRel,
    frames: total,
    fps,
    width,
    height,
    video_seconds: Number(v?.duration ?? 0),
    audio_seconds: a ? Number(a.duration ?? 0) : null,
    bytes: fs.statSync(output).size,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    startTime: props.startTime,
    name: outName,
  };
}

/** Renders candidate thumbnail frames (JPG) for the picker, or the final thumbnail. */
export async function handleThumbnails(job: Job, ctx: Ctx) {
  const pid = job.project_id!;
  const params = job.params as { times: number[]; showText?: boolean; final?: boolean };
  const { props } = buildVideoProps(pid, { assetUrl: (rel) => ctx.assetUrl(pid, rel), width: 1280, height: 720 });
  const serveUrl = await getServeUrl((m) => ctx.progress(0.02, m));
  const browser = await getBrowser((m) => ctx.progress(0.03, m));
  fs.mkdirSync(projectFile(pid, "thumbs"), { recursive: true });
  const outputs: string[] = [];
  for (let i = 0; i < params.times.length; i++) {
    const at = params.times[i];
    const inputProps = { ...props, at, showText: params.showText ?? true };
    const composition = await selectComposition({ serveUrl, id: "Thumb", inputProps, puppeteerInstance: browser, chromiumOptions: chromiumOptions() });
    const rel = params.final ? "renders/thumbnail.jpg" : `thumbs/cand-${i}-${Math.round(at * 1000)}.jpg`;
    // Keep the JPG under YouTube's 2 MB limit.
    for (const q of [92, 85, 75, 60]) {
      await renderStill({ composition, serveUrl, output: projectFile(pid, rel), inputProps, imageFormat: "jpeg", jpegQuality: q, puppeteerInstance: browser, chromiumOptions: chromiumOptions(), overwrite: true });
      if (fs.statSync(projectFile(pid, rel)).size < 1.9e6) break;
    }
    outputs.push(rel);
    ctx.progress((i + 1) / params.times.length, `Rendered ${i + 1} of ${params.times.length} frames`);
  }
  return { outputs, times: params.times };
}
