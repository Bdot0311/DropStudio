import { buildInput, dataUri, getPath, httpJson, sleep } from "./util";
import { ProviderError, type GenRequest, type GenResult, type Provider } from "./types";

/** Replicate predictions API (official models endpoint). */
export function replicateProvider(token: string): Provider {
  if (!token) throw new ProviderError("Add your Replicate API token in Settings first.", false);
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

  async function run(r: GenRequest, values: Record<string, unknown>): Promise<GenResult> {
    let pred = (await httpJson(`https://api.replicate.com/v1/models/${r.model.id}/predictions`, {
      method: "POST", headers, body: JSON.stringify({ input: buildInput(r.model, values) }), what: "Replicate submit", signal: r.signal,
    })) as { status: string; urls: { get: string }; output: unknown; error?: string };
    const started = Date.now();
    while (!["succeeded", "failed", "canceled"].includes(pred.status)) {
      await sleep(2500, r.signal);
      pred = (await httpJson(pred.urls.get, { headers, what: "Replicate status", signal: r.signal })) as typeof pred;
      r.onStatus?.(`${pred.status === "starting" ? "Starting model" : "Generating"}… ${Math.round((Date.now() - started) / 1000)}s`);
      if (Date.now() - started > 20 * 60_000) throw new ProviderError("Replicate took longer than 20 minutes.");
    }
    if (pred.status !== "succeeded") throw new ProviderError(`Replicate: ${pred.error ?? pred.status}`, pred.status === "failed");
    const url = getPath(pred.output, r.model.output);
    if (typeof url !== "string") throw new ProviderError("Replicate returned no file URL. Check \"output\" in config/models.json.", false);
    return { url };
  }

  return {
    generateImage: (r) => run(r, { prompt: r.prompt, negative: r.negative, seed: r.seed }),
    imageToVideo: (r) => run(r, { prompt: r.prompt, negative: r.negative, seed: r.seed, image: dataUri(r.imagePath!) }),
  };
}
