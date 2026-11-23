import { getShot, removeShot, updateShot, type ShotStatus } from "@/lib/shots";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; shotId: string }> };

/** Edit a prompt, approve/reject a keyframe, or ask for a new variation (new seed). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, shotId } = await params;
  const shot = getShot(shotId);
  if (!shot || shot.project_id !== id) return error("Shot not found", 404);
  const body = await readJson<{ prompt?: string; decision?: "approve" | "reject" | "undo"; reseed?: boolean; reseedClip?: boolean }>(req);
  const f: Parameters<typeof updateShot>[1] = {};
  if (typeof body.prompt === "string" && body.prompt.trim() && body.prompt !== shot.prompt) {
    f.prompt = body.prompt.trim().slice(0, 1000);
    // A new prompt invalidates the old images (they stay in the cache in case you change it back).
    if (shot.keyframe) Object.assign(f, { keyframe: null, clip: null, clip_duration: null, status: "draft" as ShotStatus });
  }
  if (body.reseed) {
    f.seed = Math.floor(Math.random() * 2 ** 31);
    Object.assign(f, { keyframe: null, clip: null, clip_duration: null, status: "draft" as ShotStatus, error: null });
  }
  if (body.reseedClip && shot.keyframe) {
    f.clip_seed = shot.clip_seed + 1;
    Object.assign(f, { clip: null, clip_duration: null, status: "approved" as ShotStatus, error: null });
  }
  if (body.decision === "approve" && shot.keyframe) f.status = shot.clip ? "clip_ready" : "approved";
  if (body.decision === "reject") f.status = "rejected";
  if (body.decision === "undo") f.status = shot.keyframe ? "keyframe_ready" : "draft";
  updateShot(shotId, f);
  return json(getShot(shotId));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, shotId } = await params;
  const shot = getShot(shotId);
  if (!shot || shot.project_id !== id) return error("Shot not found", 404);
  removeShot(shotId);
  return json({ ok: true });
}
