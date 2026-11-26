// Finishing passes stored per shot: AI morphs between shots, 1080p upscales, subject cut-outs.
// Each result remembers its input files (`source`) and is ignored once those change, so
// regenerating a clip automatically retires its old upscale, cut-out and morphs.
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { db, nowIso } from "./db";
import { DATA_DIR } from "./paths";

export type EnhKind = "bridge" | "upscale" | "matte";
export type Enhancement = { id: string; project_id: string; kind: EnhKind; shot_id: string; to_shot_id: string; source: string; file: string; duration: number | null };
type ShotLike = { id: string; clip: string | null; keyframe: string | null };

const exists = (rel: string | null | undefined) => !!rel && fs.existsSync(path.join(DATA_DIR, rel));

export function listEnhancements(projectId: string): Enhancement[] {
  return db().prepare("SELECT * FROM enhancements WHERE project_id=?").all(projectId) as Enhancement[];
}

export function putEnhancement(e: Omit<Enhancement, "id">) {
  db()
    .prepare("INSERT OR REPLACE INTO enhancements (id, project_id, kind, shot_id, to_shot_id, source, file, duration, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(nanoid(12), e.project_id, e.kind, e.shot_id, e.to_shot_id, e.source, e.file, e.duration, nowIso());
}

/** Lookup helper over one project's enhancements (one query, many lookups). */
export function enhancementIndex(projectId: string) {
  const all = listEnhancements(projectId);
  const find = (kind: EnhKind, shotId: string, to = "") => all.find((e) => e.kind === kind && e.shot_id === shotId && e.to_shot_id === to);
  /** The clip the editor uses: the 1080p upscale when it was made from the current clip. */
  const clipOf = (s: ShotLike): string | null => {
    const u = find("upscale", s.id);
    return u && u.source === s.clip && exists(u.file) ? u.file : s.clip;
  };
  const matteOf = (s: ShotLike): string | null => {
    const m = find("matte", s.id);
    return m && m.source === clipOf(s) && exists(m.file) ? m.file : null;
  };
  const bridgeSource = (a: ShotLike, b: ShotLike) => `${clipOf(a)}|${b.keyframe}`;
  const bridgeOf = (a: ShotLike, b: ShotLike): Enhancement | null => {
    const e = find("bridge", a.id, b.id);
    return e && e.source === bridgeSource(a, b) && exists(e.file) ? e : null;
  };
  const upscaled = (s: ShotLike) => clipOf(s) !== s.clip;
  return { all, clipOf, matteOf, bridgeOf, bridgeSource, upscaled };
}
