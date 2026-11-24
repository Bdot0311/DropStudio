import { getShot, removeShot, updateShot, type ShotStatus } from "@/lib/shots";
import { error, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; shotId: string }> };

/** Edit a prompt, approve/reject a keyframe, or ask for a new variation (new seed). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id, shotId } = await params;
  const shot = getShot(shotId);
  if (!shot || shot.project_id !== id) return error("Shot not found", 404);
  const body = await readJson<{ prompt?: string; decision?: "approve" | "reject" | "undo"; reseed?: boolean; reseedClip?: boolean; character?: boolean; camera?: string; vfx?: string }>(req);
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
  if (typeof body.character === "boolean" && (body.character ? 1 : 0) !== shot.character) {
    // Switch between featuring you and a scene-only shot: swap in a matching prompt, start fresh.
    f.character = body.character ? 1 : 0;
    const { CHARACTER_PROMPTS } = await import("@/lib/shots");
    const { presetConfig } = await import("@/lib/presets/configs");
    const { getProject } = await import("@/lib/projects");
    const project = getProject(id)!;
    const { directShot } = await import("@/lib/director");
    const { directorWorld } = await import("@/lib/shots");
    const w = directorWorld(id, project.preset);
    f.prompt = directShot({ section: shot.section_type, n: shot.idx, globalN: shot.idx, character: !!body.character, vibe: project.vibe, world: w.world, wardrobe: w.wardrobe }).prompt;
    void CHARACTER_PROMPTS; void presetConfig;
    Object.assign(f, { keyframe: null, clip: null, clip_duration: null, status: "draft" as ShotStatus, error: null });
  }
  // Changing the camera move or VFX only affects the clip (the keyframe still fits).
  for (const k of ["camera", "vfx"] as const) {
    if (typeof body[k] === "string" && body[k] !== shot[k]) {
      f[k] = body[k]!.slice(0, 40);
      if (shot.clip) Object.assign(f, { clip: null, clip_duration: null, status: "approved" as ShotStatus });
    }
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
