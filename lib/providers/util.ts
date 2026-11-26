import fs from "node:fs";
import path from "node:path";
import { ProviderError } from "./types";

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(new ProviderError("Cancelled", false)); });
  });

export function dataUri(file: string): string {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

/** Read "a.b.0.c" from a JSON object; "" returns the value itself (or its first element). */
export function getPath(obj: unknown, p: string | undefined): unknown {
  if (!p) return Array.isArray(obj) ? obj[0] : obj;
  return p.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

export async function httpJson(url: string, init: RequestInit & { what: string }): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new ProviderError(`${init.what}: network error (${(e as Error).message})`);
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (res.status === 401 || res.status === 403) throw new ProviderError(`${init.what}: the API key was rejected (${res.status}). Check it in Settings.`, false);
  if (res.status === 402) throw new ProviderError(`${init.what}: your provider account is out of credit (402).`, false);
  if (res.status === 422 || res.status === 400) throw new ProviderError(`${init.what}: the model rejected the request (${res.status}): ${JSON.stringify(body).slice(0, 300)}`, false);
  if (!res.ok) throw new ProviderError(`${init.what}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`, res.status >= 500 || res.status === 429);
  return body;
}

/** Build the model input from the config's `input` + `fields` mapping. */
export function buildInput(model: { input?: Record<string, unknown>; fields?: Record<string, string> }, values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(model.input ?? {}) };
  const fields = model.fields ?? { prompt: "prompt" };
  for (const [ours, theirs] of Object.entries(fields)) if (values[ours] !== undefined && values[ours] !== "") out[theirs] = values[ours];
  return out;
}
