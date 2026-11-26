import { catalog, readDefs, resolveFalModel, mapPrice, type Role } from "@/lib/fal-catalog";
import { readModels, selectedModels, clipCost, imageCost, type ModelDef } from "@/lib/models";
import { getSetting, saveSettings } from "@/lib/settings";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

const ROLES: Role[] = ["image", "character", "video", "morph"];
/** Which setting each picker writes. Video has two slots (draft and final). */
const SETTING: Record<string, string> = { image: "fal_image_model", character: "fal_character_model", final: "fal_video_final", draft: "fal_video_draft", morph: "fal_bridge_model" };

const curatedFor = (role: Role): ModelDef[] => {
  const p = readModels().providers.fal;
  return role === "image" ? p.image : role === "character" ? p.character_image ?? [] : role === "morph" ? p.bridge ?? [] : p.image_to_video;
};

/** A price as people read it: "$0.04 / image", "$0.56 / 5 s clip". */
function priceText(m: Pick<ModelDef, "price" | "clip_seconds">, video: boolean): string {
  if (video) return `$${clipCost(m as ModelDef).toFixed(2)} / ${m.clip_seconds ?? 5} s clip`;
  return `$${imageCost(m as ModelDef).toFixed(3)} / image`;
}

/**
 * GET ?role=image|character|video|morph[&refresh=1]
 * fal's whole catalog for that role, with Drop Studio's featured picks marked and what's selected now.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const role = u.searchParams.get("role") as Role;
  if (!ROLES.includes(role)) return error("Unknown role", 400);
  const video = role === "video" || role === "morph";
  const curated = curatedFor(role);
  let items: Awaited<ReturnType<typeof catalog>>["items"] = [];
  let fetchedAt: string | null = null;
  let warning: string | null = null;
  try {
    const c = await catalog(role, u.searchParams.get("refresh") === "1");
    items = c.items;
    fetchedAt = c.fetchedAt;
  } catch (e) {
    warning = `Couldn't load fal's catalog (${(e as Error).message}). Showing Drop Studio's picks only.`;
  }
  const defs = readDefs();
  const byId = new Map(items.map((i) => [i.id, i]));
  // Featured picks first (with their thumbnails from the catalog when available), then everything else.
  const featured = curated.map((m) => {
    const it = byId.get(m.id);
    return { id: m.id, name: m.label, description: it?.description ?? "", thumb: it?.thumb ?? null, animated: it?.animated ?? null, date: it?.date ?? null, featured: true, recommended: !!m.recommended, price: priceText(m, video), tier: m.tier ?? null };
  });
  const rest = items.filter((i) => !curated.some((m) => m.id === i.id)).map((i) => {
    const d = defs[`${role}:${i.id}`];
    const mapped = d?.price ?? mapPrice(i.price, role, 5);
    const price = mapped ? priceText({ price: mapped, clip_seconds: d?.clip_seconds ?? 5 }, video) : i.price ? `$${i.price.unit_price} / ${i.price.unit}` : null;
    return { id: i.id, name: i.name, description: i.description, thumb: i.thumb, animated: i.animated, date: i.date, featured: false, recommended: false, price, tier: null };
  });
  const sel = selectedModels("fal");
  const selected = role === "image" ? { image: sel.image.id } : role === "character" ? { character: sel.character.id } : role === "morph" ? { morph: sel.bridge?.id ?? null } : { draft: sel.draft.id, final: sel.final.id };
  return json({ role, models: [...featured, ...rest], selected, fetchedAt, warning, priced: !!getSetting("fal_key") });
}

/** POST { role, slot?: "draft"|"final", id }: check the model can be driven, then select it. */
export async function POST(req: Request) {
  const b = await readJson<{ role?: Role; slot?: string; id?: string }>(req);
  if (!b.role || !ROLES.includes(b.role) || !b.id) return error("role and id are required", 400);
  const slot = b.role === "video" ? (b.slot === "draft" ? "draft" : "final") : b.role;
  let label: string;
  const cur = curatedFor(b.role).find((m) => m.id === b.id);
  if (cur) label = cur.label;
  else {
    try {
      label = (await resolveFalModel(b.id, b.role)).label;
    } catch (e) {
      return error(`Can't use ${b.id}: ${(e as Error).message}`, 422);
    }
  }
  saveSettings({ [SETTING[slot]]: b.id });
  return json({ ok: true, slot, id: b.id, label });
}
