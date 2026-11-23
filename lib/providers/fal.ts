import { buildInput, dataUri, getPath, httpJson, sleep } from "./util";
import { ProviderError, type GenRequest, type GenResult, type Provider } from "./types";

/** fal.ai queue API: submit, poll status, fetch result. */
export function falProvider(key: string): Provider {
  if (!key) throw new ProviderError("Add your fal.ai API key in Settings first.", false);
  const headers = { Authorization: `Key ${key}`, "content-type": "application/json" };

  async function run(r: GenRequest, values: Record<string, unknown>): Promise<GenResult> {
    const sub = (await httpJson(`https://queue.fal.run/${r.model.id}`, { method: "POST", headers, body: JSON.stringify(buildInput(r.model, values)), what: "fal.ai submit", signal: r.signal })) as { status_url: string; response_url: string };
    const started = Date.now();
    for (;;) {
      await sleep(2500, r.signal);
      const st = (await httpJson(sub.status_url, { headers, what: "fal.ai status", signal: r.signal })) as { status: string; queue_position?: number };
      if (st.status === "COMPLETED") break;
      r.onStatus?.(st.status === "IN_QUEUE" ? `In fal.ai queue${st.queue_position != null ? ` (position ${st.queue_position})` : ""}` : `Generating… ${Math.round((Date.now() - started) / 1000)}s`);
      if (Date.now() - started > 20 * 60_000) throw new ProviderError("fal.ai took longer than 20 minutes.");
    }
    const out = await httpJson(sub.response_url, { headers, what: "fal.ai result", signal: r.signal });
    const url = getPath(out, r.model.output);
    if (typeof url !== "string") throw new ProviderError(`fal.ai returned no file at "${r.model.output}". Check "output" for this model in config/models.json.`, false);
    return { url };
  }

  return {
    generateImage: (r) =>
      run(r, {
        prompt: r.prompt, negative: r.negative, seed: r.seed,
        reference: r.referencePaths?.length ? dataUri(r.referencePaths[0]) : undefined,
        references: r.referencePaths?.length ? r.referencePaths.slice(0, 4).map(dataUri) : undefined,
      }),
    imageToVideo: (r) => run(r, { prompt: r.prompt, negative: r.negative, seed: r.seed, image: dataUri(r.imagePath!) }),
  };
}
