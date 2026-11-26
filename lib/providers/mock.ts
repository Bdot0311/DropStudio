import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { run } from "../ffmpeg";
import { sleep } from "./util";
import type { GenRequest, GenResult, Provider } from "./types";

/**
 * Free test provider: makes abstract placeholder images/clips locally with FFmpeg so the whole
 * pipeline (budget, cache, approval, editing) can be tried without spending anything.
 */
export function mockProvider(): Provider {
  const hue = (s: string) => parseInt(crypto.createHash("md5").update(s).digest("hex").slice(0, 2), 16) / 255;
  return {
    async generateImage(r: GenRequest): Promise<GenResult> {
      await sleep(300, r.signal);
      const out = path.join(os.tmpdir(), `drop-mock-${crypto.randomUUID()}.png`);
      const h = hue(r.prompt + r.seed);
      const c1 = `0x${Math.round(40 + 180 * h).toString(16).padStart(2, "0")}2060`;
      const c2 = `0x20${Math.round(60 + 160 * (1 - h)).toString(16).padStart(2, "0")}c0`;
      if (r.referencePaths?.length) {
        // Character shot: put the reference photo in the frame so it's obvious it was used.
        await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `gradients=s=1024x576:c0=${c1}:c1=${c2}:x0=0:y0=0:x1=1024:y1=576:seed=${r.seed % 1000}`, "-i", r.referencePaths[0],
          "-filter_complex", "[1:v]scale=-2:400[f];[0:v][f]overlay=(W-w)/2:(H-h)/2", "-frames:v", "1", out]);
      } else {
        await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `gradients=s=1024x576:c0=${c1}:c1=${c2}:x0=0:y0=0:x1=1024:y1=576:seed=${r.seed % 1000}`, "-frames:v", "1", out]);
      }
      return { file: out };
    },
    async imageToVideo(r: GenRequest): Promise<GenResult> {
      await sleep(500, r.signal);
      const out = path.join(os.tmpdir(), `drop-mock-${crypto.randomUUID()}.mp4`);
      const secs = r.model.clip_seconds ?? 5;
      if (r.endImagePath) {
        // Morph placeholder: dissolve from the first frame to the last, with a push-in.
        await run("ffmpeg", [
          "-v", "error", "-y", "-loop", "1", "-t", String(secs), "-i", r.imagePath!, "-loop", "1", "-t", String(secs), "-i", r.endImagePath,
          "-filter_complex", `[0:v]scale=1024:576:force_original_aspect_ratio=increase,crop=1024:576,fps=24,format=yuv420p[a];[1:v]scale=1024:576:force_original_aspect_ratio=increase,crop=1024:576,fps=24,format=yuv420p[b];[a][b]xfade=transition=circleopen:duration=${secs - 1}:offset=0.5,format=yuv420p`,
          "-t", String(secs), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", out,
        ]);
        return { file: out };
      }
      // Slow push-in + drift: enough motion to judge the edit.
      await run("ffmpeg", [
        "-v", "error", "-y", "-loop", "1", "-i", r.imagePath!, "-t", String(secs),
        "-vf", `scale=2048:-2,zoompan=z='1+0.15*on/${secs * 24}':x='iw/2-(iw/zoom/2)+20*sin(on/20)':y='ih/2-(ih/zoom/2)':d=1:s=1024x576:fps=24,format=yuv420p`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", out,
      ]);
      return { file: out };
    },
    async upscaleVideo(r: GenRequest): Promise<GenResult> {
      await sleep(300, r.signal);
      const out = path.join(os.tmpdir(), `drop-mock-${crypto.randomUUID()}.mp4`);
      await run("ffmpeg", ["-v", "error", "-y", "-i", r.videoPath!, "-vf", "scale=-2:1080:flags=lanczos,format=yuv420p", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", out]);
      return { file: out };
    },
    async matteVideo(r: GenRequest): Promise<GenResult> {
      // Cut-out placeholder: a soft oval in the middle of the frame stands in for "the subject".
      await sleep(300, r.signal);
      const out = path.join(os.tmpdir(), `drop-mock-${crypto.randomUUID()}.mp4`);
      await run("ffmpeg", ["-v", "error", "-y", "-i", r.videoPath!, "-vf",
        "format=gray,geq=lum='255*clip(1.6-1.6*hypot((X-W/2)/(W*0.2),(Y-H*0.6)/(H*0.45)),0,1)',format=yuv420p", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", out]);
      return { file: out };
    },
  };
}
