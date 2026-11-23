import { readModels } from "@/lib/models";
import { json } from "@/lib/http";

export const runtime = "nodejs";

/** The editable model list (config/models.json), for the Settings dropdowns. */
export async function GET() {
  const cfg = readModels();
  return json(
    Object.fromEntries(
      Object.entries(cfg.providers).map(([id, p]) => [id, { label: p.label, image: p.image.map(({ id, label, price }) => ({ id, label, price })), video: p.image_to_video.map(({ id, label, price, tier, clip_seconds }) => ({ id, label, price, tier, clip_seconds })) }])
    )
  );
}
