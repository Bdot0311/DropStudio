import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../paths";
import { sleep } from "./util";
import { ProviderError, type GenRequest, type GenResult, type Provider } from "./types";

/**
 * Local ComfyUI. Export your workflow with "Save (API format)" to config/comfyui/image.json or
 * image_to_video.json and put these placeholders in its text fields:
 *   {{prompt}}  {{negative}}  {{seed}}  {{image}} (the uploaded keyframe's filename, for LoadImage)
 *   {{end_image}} (last frame, for first→last-frame morph workflows such as Wan 2.2 FLF2V)
 */
export function comfyProvider(baseUrl: string): Provider {
  const base = (baseUrl || "http://localhost:8188").replace(/\/$/, "");

  async function call<T>(url: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try { res = await fetch(base + url, init); } catch {
      throw new ProviderError(`ComfyUI isn't reachable at ${base}. Is it running?`);
    }
    if (!res.ok) throw new ProviderError(`ComfyUI error ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status >= 500);
    return res.json() as Promise<T>;
  }

  async function run(r: GenRequest, vars: Record<string, string>): Promise<GenResult> {
    const wfPath = path.join(ROOT, r.model.id);
    if (!fs.existsSync(wfPath)) throw new ProviderError(`Missing ComfyUI workflow: ${r.model.id}. Export yours in API format and save it there.`, false);
    let wf = fs.readFileSync(wfPath, "utf8");
    for (const [k, v] of Object.entries(vars)) wf = wf.split(`{{${k}}}`).join(JSON.stringify(v).slice(1, -1));
    wf = wf.replace(/"\{\{seed\}\}"/g, String(r.seed));
    const { prompt_id } = await call<{ prompt_id: string }>("/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: JSON.parse(wf) }) });
    const started = Date.now();
    for (;;) {
      await sleep(2000, r.signal);
      const hist = await call<Record<string, { outputs: Record<string, Record<string, { filename: string; subfolder: string; type: string }[]>> }>>(`/history/${prompt_id}`);
      const h = hist[prompt_id];
      r.onStatus?.(`ComfyUI working… ${Math.round((Date.now() - started) / 1000)}s`);
      if (!h) continue;
      for (const node of Object.values(h.outputs)) {
        const files = node.images ?? node.gifs ?? node.videos ?? Object.values(node).flat();
        const f = files.find((x) => x && typeof x === "object" && "filename" in x);
        if (f) return { url: `${base}/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder)}&type=${f.type}` };
      }
      throw new ProviderError("ComfyUI finished but produced no image/video output.", false);
    }
  }

  return {
    async generateImage(r) {
      if (!r.referencePaths?.length) return run(r, { prompt: r.prompt, negative: r.negative, seed: String(r.seed) });
      const form = new FormData();
      form.append("image", new Blob([fs.readFileSync(r.referencePaths[0])]), path.basename(r.referencePaths[0]));
      form.append("overwrite", "true");
      const up = await call<{ name: string }>("/upload/image", { method: "POST", body: form });
      return run(r, { prompt: r.prompt, negative: r.negative, seed: String(r.seed), image: up.name });
    },
    async imageToVideo(r) {
      const form = new FormData();
      form.append("image", new Blob([fs.readFileSync(r.imagePath!)]), path.basename(r.imagePath!));
      form.append("overwrite", "true");
      const up = await call<{ name: string }>("/upload/image", { method: "POST", body: form });
      let end = "";
      if (r.endImagePath) {
        const f2 = new FormData();
        f2.append("image", new Blob([fs.readFileSync(r.endImagePath)]), path.basename(r.endImagePath));
        f2.append("overwrite", "true");
        end = (await call<{ name: string }>("/upload/image", { method: "POST", body: f2 })).name;
      }
      return run(r, { prompt: r.prompt, negative: r.negative, seed: String(r.seed), image: up.name, end_image: end });
    },
  };
}
