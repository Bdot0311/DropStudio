// Every model on fal.ai, not just the curated ones in config/models.json.
//   • catalog(role): fal's live model list for a role (cached for a day in data/fal-catalog/)
//   • resolveFalModel(id, role): reads that model's OpenAPI schema and pricing and turns it into a
//     ModelDef (which input field takes the prompt, the image, the seed, which output holds the file,
//     sensible defaults for duration / aspect ratio / audio). Saved in data/fal-models.json so
//     selectedModels() can use it like a curated model.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";
import { getSetting } from "./settings";
import type { ModelDef } from "./models";

export type Role = "image" | "character" | "video" | "morph";
export const ROLE_CATEGORY: Record<Role, string> = { image: "text-to-image", character: "image-to-image", video: "image-to-video", morph: "image-to-video" };

export type CatalogItem = {
  id: string; name: string; description: string; thumb: string | null; animated: string | null;
  tags: string[]; group: string | null; date: string | null; license: string | null;
  price: { unit_price: number; unit: string } | null;
};

const API = process.env.DROP_FAL_API || "https://api.fal.ai/v1";
const CAT_DIR = path.join(DATA_DIR, "fal-catalog");
const DEFS_FILE = path.join(DATA_DIR, "fal-models.json");
const DAY = 24 * 3600 * 1000;

function headers(): Record<string, string> {
  const key = getSetting("fal_key");
  return key ? { Authorization: `Key ${key}` } : {};
}

async function get(url: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: headers() });
    const body = await res.json().catch(() => null);
    // fal rate-limits catalog calls (more without a key): back off and retry
    if (res.status === 429 && attempt < 6) { await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(body?.error?.message ?? `fal.ai catalog: HTTP ${res.status}`);
    return body;
  }
}

/** Models with their OpenAPI schemas (fal allows 10 per request with schemas). */
export async function fetchSchemas(ids: string[]): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 10) {
    const q = ids.slice(i, i + 10).map((id) => `endpoint_id=${encodeURIComponent(id)}`).join("&");
    try {
      const d = await get(`${API}/models?${q}&expand=openapi-3.0&limit=10`);
      for (const m of d.models ?? []) out[m.endpoint_id] = m;
    } catch {
      // one unknown id fails the whole batch: fetch them one by one
      for (const id of ids.slice(i, i + 10)) {
        try {
          const d = await get(`${API}/models?endpoint_id=${encodeURIComponent(id)}&expand=openapi-3.0`);
          if (d.models?.[0]) out[id] = d.models[0];
        } catch { /* not found */ }
      }
    }
  }
  return out;
}

/** Prices for up to 50 models per call (needs the fal key; without it prices stay unknown). */
async function prices(ids: string[]): Promise<Record<string, { unit_price: number; unit: string }>> {
  if (!getSetting("fal_key")) return {};
  const out: Record<string, { unit_price: number; unit: string }> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const q = ids.slice(i, i + 50).map((id) => `endpoint_id=${encodeURIComponent(id)}`).join("&");
    try {
      const d = await get(`${API}/models/pricing?${q}`);
      for (const p of d.prices ?? []) out[p.endpoint_id] = { unit_price: Number(p.unit_price), unit: String(p.unit) };
    } catch { /* pricing is best effort */ }
  }
  return out;
}

/** fal's live model list for a role. Cached for a day; `refresh` forces a new download. */
export async function catalog(role: Role, refresh = false): Promise<{ items: CatalogItem[]; fetchedAt: string }> {
  fs.mkdirSync(CAT_DIR, { recursive: true });
  const file = path.join(CAT_DIR, `${role}.json`);
  if (!refresh && fs.existsSync(file)) {
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    // re-download when stale, or when a key was added since (to fill in prices)
    if (Date.now() - Date.parse(c.fetchedAt) < DAY && (c.priced || !getSetting("fal_key"))) return c;
  }
  const items: CatalogItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 30; page++) {
    const d: any = await get(`${API}/models?category=${ROLE_CATEGORY[role]}&status=active&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    for (const m of d.models ?? []) {
      const md = m.metadata ?? {};
      if (md.kind === "training") continue;
      items.push({
        id: m.endpoint_id, name: md.display_name ?? m.endpoint_id, description: md.description ?? "",
        thumb: md.thumbnail_url ?? null, animated: md.thumbnail_animated_url ?? null, tags: md.tags ?? [],
        group: md.group?.label ?? null, date: md.date ?? null, license: md.license_type ?? null, price: null,
      });
    }
    cursor = d.next_cursor ?? null;
    if (!d.has_more || !cursor) break;
  }
  const pr = await prices(items.map((i) => i.id));
  for (const i of items) i.price = pr[i.id] ?? null;
  const c = { items, fetchedAt: new Date().toISOString(), priced: Object.keys(pr).length > 0 };
  fs.writeFileSync(file, JSON.stringify(c));
  return c;
}

// ---------- schema → ModelDef ----------

type Prop = { type?: string; enum?: unknown[]; default?: unknown; anyOf?: Prop[]; items?: Prop; minimum?: number; maximum?: number; $ref?: string };
type Schema = { properties?: Record<string, Prop>; required?: string[] };

const IMAGE_IN = ["image_url", "start_image_url", "first_image_url", "first_frame_url", "first_frame_image_url", "input_image_url", "image", "init_image_url", "frame0_image_url"];
const END_IN = ["end_image_url", "tail_image_url", "last_frame_url", "last_frame_image_url", "last_image_url", "end_frame_url"];
const REFS_IN = ["image_urls", "reference_image_urls", "reference_images", "input_image_urls", "ref_image_urls", "images"];
const REF_IN = ["image_url", "reference_image_url", "input_image_url", "image", "ref_image_url"];
const NEG = ["negative_prompt", "negative"];

function schemas(openapi: any): { input: Schema; output: Schema; all: Record<string, Schema> } {
  const all = openapi?.components?.schemas ?? {};
  const deref = (s: any): Schema => (s?.$ref ? all[s.$ref.split("/").pop()] ?? {} : s ?? {});
  let input: Schema = {}, output: Schema = {};
  for (const [p, ops] of Object.entries<any>(openapi?.paths ?? {})) {
    if (ops.post?.requestBody) input = deref(ops.post.requestBody.content?.["application/json"]?.schema);
    if (/\/requests\/\{request_id\}$/.test(p) && ops.get) output = deref(ops.get.responses?.["200"]?.content?.["application/json"]?.schema);
  }
  return { input, output, all };
}

const enumOf = (p: Prop | undefined): unknown[] => p?.enum ?? p?.anyOf?.flatMap((x) => x.enum ?? []) ?? [];
const isArray = (p: Prop | undefined) => p?.type === "array" || !!p?.anyOf?.some((x) => x.type === "array");

function pickDuration(p: Prop): { value: unknown; seconds: number } | null {
  const e = enumOf(p);
  if (e.length) {
    const num = (v: unknown) => parseFloat(String(v));
    const nums = e.filter((v) => Number.isFinite(num(v)));
    if (!nums.length) return { value: e[0], seconds: 5 };
    const best = [...nums].sort((a, b) => Math.abs(num(a) - 5) - Math.abs(num(b) - 5))[0];
    return { value: best, seconds: num(best) || 5 };
  }
  if (p.type === "integer" || p.type === "number") {
    const v = Math.min(p.maximum ?? 5, Math.max(p.minimum ?? 5, 5));
    return { value: v, seconds: v };
  }
  if (p.default != null) return { value: p.default, seconds: parseFloat(String(p.default)) || 5 };
  return null;
}

/** Turn fal's price into Drop Studio's price model (null when the unit can't be mapped). */
export function mapPrice(pr: { unit_price: number; unit: string } | null, role: Role, seconds: number): ModelDef["price"] | null {
  if (!pr) return null;
  const u = pr.unit.toLowerCase();
  if (/second/.test(u)) return { per_second: pr.unit_price };
  if (/video/.test(u)) return { per_video: pr.unit_price };
  const vid = role === "video" || role === "morph";
  if (/image/.test(u)) return vid ? { per_video: pr.unit_price } : { per_image: pr.unit_price };
  if (/megapixel/.test(u) && !vid) return { per_image: +(pr.unit_price * 2.1).toFixed(4) }; // ~1920×1080
  if (/minute/.test(u)) return { per_second: pr.unit_price / 60 };
  void seconds;
  return null;
}

export type ResolvedDef = ModelDef & { role: Role; price_estimated?: boolean; source: "catalog" };

/** Build a ModelDef from a fal model's schema. Throws a readable reason when it can't be driven. */
export async function resolveFalModel(id: string, role: Role, prefetched?: { model?: any; price?: { unit_price: number; unit: string } | null; save?: boolean }): Promise<ResolvedDef> {
  const m = prefetched?.model ?? (await fetchSchemas([id]))[id];
  if (!m?.openapi) throw new Error(`fal.ai has no schema for ${id}.`);
  const { input, output } = schemas(m.openapi);
  const props = input.properties ?? {};
  const has = (k: string) => k in props;
  const first = (list: string[]) => list.find(has);
  const fields: Record<string, string> = {};
  const inp: Record<string, unknown> = {};

  if (!has("prompt")) throw new Error("This model doesn't take a text prompt, so Drop Studio can't direct it.");
  fields.prompt = "prompt";
  const neg = first(NEG);
  if (neg) fields.negative = neg;
  if (has("seed")) fields.seed = "seed";

  if (role === "video" || role === "morph") {
    const img = first(IMAGE_IN.filter((k) => !isArray(props[k])));
    const imgs = REFS_IN.find((k) => has(k) && isArray(props[k]));
    // start-image models get the keyframe; reference-to-video models get [keyframe, your photos…]
    if (img) fields.image = img;
    else if (imgs) fields.images = imgs;
    else throw new Error("This model doesn't take a start image.");
    const end = first(END_IN);
    if (role === "video" && end && (input.required ?? []).includes(end)) throw new Error("This model only makes transitions between two images.");
    if (role === "morph" && (!end || !img)) throw new Error("This model can't start and end on given frames, so it can't morph between shots.");
    if (end) fields.end_image = end;
  } else if (role === "character") {
    const refs = REFS_IN.find((k) => has(k) && isArray(props[k]));
    const ref = first(REF_IN.filter((k) => !isArray(props[k])));
    if (refs) fields.references = refs;
    else if (ref) fields.reference = ref;
    else throw new Error("This model doesn't take a reference photo.");
  }

  // Sensible defaults for a music video.
  let seconds = 5;
  if ((role === "video" || role === "morph") && props.duration) {
    const dur = pickDuration(props.duration);
    if (dur) { inp.duration = dur.value; seconds = dur.seconds; }
  }
  for (const k of ["generate_audio", "enable_audio", "with_audio", "audio"]) if (props[k]?.type === "boolean") inp[k] = false; // your track is the soundtrack
  const ar = enumOf(props.aspect_ratio);
  if (ar.includes("16:9")) inp.aspect_ratio = "16:9";
  const sz = enumOf(props.image_size);
  if (sz.includes("landscape_16_9")) inp.image_size = "landscape_16_9";
  const res = enumOf(props.resolution);
  for (const r of ["1080p", "720p"]) if (res.includes(r)) { inp.resolution = r; break; }
  if (has("num_images")) inp.num_images = 1;

  const filled = new Set([...Object.values(fields), ...Object.keys(inp)]);
  const missing = (input.required ?? []).filter((k) => !filled.has(k) && props[k]?.default === undefined);
  if (missing.length) throw new Error(`This model also needs ${missing.join(", ")}, which Drop Studio can't provide.`);

  const out = output.properties ?? {};
  const outPath = role === "video" || role === "morph"
    ? ("video" in out ? "video.url" : "videos" in out ? "videos.0.url" : null)
    : ("images" in out ? "images.0.url" : "image" in out ? "image.url" : null);
  if (!outPath) throw new Error(`This model doesn't return ${role === "video" ? "a video" : "an image"} Drop Studio can read.`);

  const pr = prefetched && "price" in prefetched ? prefetched.price ?? null : (await prices([id]))[id] ?? null;
  const mapped = mapPrice(pr, role, seconds);
  const price = mapped ?? (role === "video" || role === "morph" ? { per_second: 0.15 } : { per_image: 0.06 });
  const md = m.metadata ?? {};
  const def: ResolvedDef = {
    id, label: `${md.display_name ?? id}${mapped ? "" : " (price estimated)"}`, role, source: "catalog",
    price, clip_seconds: role === "video" || role === "morph" ? seconds : undefined, input: inp, fields, output: outPath,
    ...(mapped ? {} : { price_estimated: true }),
  };
  if (prefetched?.save === false) return def;
  const all = readDefs();
  all[`${role}:${id}`] = def;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DEFS_FILE, JSON.stringify(all, null, 2));
  return def;
}

export function readDefs(): Record<string, ResolvedDef> {
  try { return JSON.parse(fs.readFileSync(DEFS_FILE, "utf8")); } catch { return {}; }
}

/** Catalog models you picked, for one role (used next to the curated list). */
export function customDefs(role: Role): ResolvedDef[] {
  return Object.values(readDefs()).filter((d) => d.role === role);
}
