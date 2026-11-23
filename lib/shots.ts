// Storyboard shots: prompts mapped to sections, keyframes, clips.
import fs from "node:fs";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { db, nowIso } from "./db";
import { DATA_DIR } from "./paths";
import { presetConfig } from "./presets/configs";
import { getProject, readMusicMap } from "./projects";
import type { SectionType } from "./types";

const newId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

export type ShotStatus =
  | "draft" | "keyframe_queued" | "keyframe_running" | "keyframe_ready" | "approved" | "rejected"
  | "clip_queued" | "clip_running" | "clip_ready" | "error";

export type Shot = {
  id: string; project_id: string; idx: number; section_index: number; section_type: SectionType;
  prompt: string; seed: number; clip_seed: number; status: ShotStatus; keyframe: string | null; clip: string | null;
  clip_duration: number | null; error: string | null; updated_at: string;
};

export function listShots(projectId: string): Shot[] {
  return db().prepare("SELECT * FROM shots WHERE project_id=? ORDER BY idx").all(projectId) as Shot[];
}

export function getShot(id: string): Shot | null {
  return (db().prepare("SELECT * FROM shots WHERE id=?").get(id) as Shot | undefined) ?? null;
}

export function updateShot(id: string, f: Partial<Omit<Shot, "id" | "project_id">>) {
  const keys = Object.keys(f);
  if (!keys.length) return;
  db()
    .prepare(`UPDATE shots SET ${keys.map((k) => `${k}=?`).join(", ")}, updated_at=? WHERE id=?`)
    .run(...keys.map((k) => (f as Record<string, string | number | null>)[k]), nowIso(), id);
}

export function removeShot(id: string) {
  db().prepare("DELETE FROM shots WHERE id=?").run(id);
}

/** Full prompt sent to the model = shot prompt + the preset's look. */
export function fullPrompt(projectId: string, shot: Pick<Shot, "prompt">): { prompt: string; negative: string } {
  const p = presetConfig(getProject(projectId)?.preset ?? "melodic");
  return { prompt: `${shot.prompt}, ${p.look}`, negative: p.negative };
}

const nextIdx = (projectId: string) =>
  (db().prepare("SELECT COALESCE(MAX(idx),-1) AS m FROM shots WHERE project_id=?").get(projectId) as { m: number }).m + 1;

/**
 * Build a storyboard from the preset templates and the vibe. Shots per section scale with its
 * length; drops get the most. Aimed at ~60-100 s of footage for a 6-minute track (12-20 clips).
 */
export function buildStoryboard(projectId: string, opts: { replace?: boolean } = {}): Shot[] {
  const project = getProject(projectId);
  const map = readMusicMap(projectId);
  if (!project || !map) throw new Error("Analyze the track first");
  const preset = presetConfig(project.preset);
  const vibe = project.vibe.trim();
  const sections = map.sections
    .map((s, i) => ({ ...s, i }))
    .filter((s) => (project.mode === "hybrid" ? s.type === "drop" || s.type === "build" : true));
  if (!sections.length) throw new Error("No sections to storyboard (hybrid mode uses drops and builds).");

  const bar = (60 / map.bpm) * 4;
  const weight = (t: SectionType) => (t === "drop" ? 1 : t === "build" ? 0.6 : 0.35);
  const target = Math.min(20, Math.max(8, Math.round(map.duration / 20)));
  const raw = sections.map((s) => Math.max(1, ((s.end - s.start) / bar) * weight(s.type)));
  const sum = raw.reduce((a, b) => a + b, 0);
  const counts = raw.map((r) => Math.max(1, Math.round((r / sum) * target)));

  if (opts.replace) db().prepare("DELETE FROM shots WHERE project_id=?").run(projectId);
  const used: Record<string, number> = {};
  let idx = nextIdx(projectId);
  const insert = db().prepare("INSERT INTO shots (id, project_id, idx, section_index, section_type, prompt, seed, status, updated_at) VALUES (?,?,?,?,?,?,?,?,?)");
  const angles = [", alternate angle", ", closer shot", ", wider shot", ", different moment"];
  sections.forEach((s, j) => {
    const templates = preset.prompts[s.type];
    for (let n = 0; n < counts[j]; n++) {
      const u = used[s.type] ?? 0;
      used[s.type] = u + 1;
      const t = templates[u % templates.length];
      const variation = u >= templates.length ? angles[Math.floor(u / templates.length - 1) % angles.length] : "";
      const prompt = t.replace("{vibe}", vibe || "atmospheric") + variation;
      insert.run(newId(), projectId, idx++, s.i, s.type, prompt, Math.floor(Math.random() * 2 ** 31), "draft", nowIso());
    }
  });
  return listShots(projectId);
}

export function addShot(projectId: string, sectionIndex: number): Shot {
  const project = getProject(projectId);
  const s = readMusicMap(projectId)?.sections[sectionIndex];
  if (!project || !s) throw new Error("Unknown section");
  const preset = presetConfig(project.preset);
  const id = newId();
  db()
    .prepare("INSERT INTO shots (id, project_id, idx, section_index, section_type, prompt, seed, status, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(id, projectId, nextIdx(projectId), sectionIndex, s.type, preset.prompts[s.type][0].replace("{vibe}", project.vibe || "atmospheric"), Math.floor(Math.random() * 2 ** 31), "draft", nowIso());
  return getShot(id)!;
}

/** Ready clips for the editor (src is "cache/<file>", resolved to a URL by the caller). */
export function listClipRefs(projectId: string) {
  return listShots(projectId)
    .filter((s) => s.status === "clip_ready" && s.clip && fs.existsSync(path.join(DATA_DIR, s.clip)))
    .map((s) => ({ id: s.id, src: s.clip!, duration: s.clip_duration ?? 5, section: s.section_type }));
}

/** Which provider made a generated file ("cache/<key>.png|mp4"), from the generation cache. */
export function fileProvider(rel: string | null): string | null {
  if (!rel) return null;
  const r = db().prepare("SELECT provider FROM gen_cache WHERE file=?").get(rel) as { provider: string } | undefined;
  return r?.provider ?? null;
}

/** Shots whose keyframe is missing or was made by a different provider than the active one. */
export function needsKeyframe(s: Shot, provider: string): boolean {
  if (s.status === "rejected" || /_(queued|running)$/.test(s.status)) return false;
  return !s.keyframe || (fileProvider(s.keyframe) ?? provider) !== provider;
}
