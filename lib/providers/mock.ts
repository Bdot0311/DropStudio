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
      await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `gradients=s=1024x576:c0=${c1}:c1=${c2}:x0=0:y0=0:x1=1024:y1=576:seed=${r.seed % 1000}`, "-frames:v", "1", out]);
      return { file: out };
    },
    async imageToVideo(r: GenRequest): Promise<GenResult> {
      await sleep(500, r.signal);
      const out = path.join(os.tmpdir(), `drop-mock-${crypto.randomUUID()}.mp4`);
      const secs = r.model.clip_seconds ?? 5;
      // Slow push-in + drift: enough motion to judge the edit.
      await run("ffmpeg", [
        "-v", "error", "-y", "-loop", "1", "-i", r.imagePath!, "-t", String(secs),
        "-vf", `scale=2048:-2,zoompan=z='1+0.15*on/${secs * 24}':x='iw/2-(iw/zoom/2)+20*sin(on/20)':y='ih/2-(ih/zoom/2)':d=1:s=1024x576:fps=24,format=yuv420p`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", out,
      ]);
      return { file: out };
    },
  };
}
