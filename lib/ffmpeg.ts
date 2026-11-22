import { spawn } from "node:child_process";

export function run(cmd: string, args: string[], onStderr?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => {
      err += d;
      if (onStderr) String(d).split(/\r|\n/).forEach((l) => l && onStderr(l));
      if (err.length > 20000) err = err.slice(-10000);
    });
    p.on("error", (e) => reject(new Error(`${cmd} could not start: ${e.message}`)));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} failed (code ${code}): ${err.trim().split("\n").slice(-4).join(" | ")}`))));
  });
}

export async function probe(file: string): Promise<{ duration: number; streams: { codec_type: string; codec_name: string; duration?: string; nb_frames?: string; sample_rate?: string; width?: number; height?: number }[] }> {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(out);
  return { duration: Number(j.format?.duration ?? 0), streams: j.streams ?? [] };
}

export async function sampleRate(file: string): Promise<number> {
  const p = await probe(file);
  return Number(p.streams.find((s) => s.codec_type === "audio")?.sample_rate ?? 44100);
}
