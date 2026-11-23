import fs from "node:fs";
import { customAlphabet } from "nanoid";
import { db, nowIso } from "./db";
import { projectDir, projectFile } from "./paths";
import type { Asset, MusicMap, Project } from "./types";

const newId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

export const PROJECT_FIELDS = ["title", "artist", "preset", "mode", "vibe"] as const;

export function listProjects(): Project[] {
  return db().prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Project[];
}

export function getProject(id: string): Project | null {
  return (db().prepare("SELECT * FROM projects WHERE id=?").get(id) as Project | undefined) ?? null;
}

export function createProject(input: Partial<Pick<Project, (typeof PROJECT_FIELDS)[number]>>): Project {
  const id = newId();
  fs.mkdirSync(projectDir(id), { recursive: true });
  db()
    .prepare("INSERT INTO projects (id, title, artist, preset, mode, vibe, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, input.title?.trim() || "Untitled track", input.artist?.trim() || "", input.preset || "melodic", input.mode || "hybrid", input.vibe || "", nowIso(), nowIso());
  return getProject(id)!;
}

export function updateProject(id: string, fields: Record<string, unknown>): Project | null {
  const keys = Object.keys(fields);
  if (keys.length) {
    const sets = keys.map((k) => `${k}=?`).join(", ");
    db().prepare(`UPDATE projects SET ${sets}, updated_at=? WHERE id=?`).run(...keys.map((k) => fields[k] as never), nowIso(), id);
  }
  return getProject(id);
}

export function deleteProject(id: string): void {
  db().prepare("DELETE FROM projects WHERE id=?").run(id);
  fs.rmSync(projectDir(id), { recursive: true, force: true });
}

export function listAssets(projectId: string): Asset[] {
  return db().prepare("SELECT * FROM project_assets WHERE project_id=? ORDER BY created_at").all(projectId) as Asset[];
}

export function addAsset(projectId: string, kind: Asset["kind"], filename: string): Asset {
  if (kind === "character") {
    // Keep at most 4 reference photos (the most recent ones).
    const old = db().prepare("SELECT * FROM project_assets WHERE project_id=? AND kind='character' ORDER BY created_at").all(projectId) as Asset[];
    for (const a of old.slice(0, Math.max(0, old.length - 3))) removeAsset(projectId, a.id);
  }
  const id = newId();
  if (kind === "cover") {
    // Only one cover per project: replace the old one.
    for (const old of db().prepare("SELECT * FROM project_assets WHERE project_id=? AND kind='cover'").all(projectId) as Asset[]) {
      removeAsset(projectId, old.id);
    }
  }
  db().prepare("INSERT INTO project_assets (id, project_id, kind, filename, created_at) VALUES (?,?,?,?,?)").run(id, projectId, kind, filename, nowIso());
  return db().prepare("SELECT * FROM project_assets WHERE id=?").get(id) as Asset;
}

export function removeAsset(projectId: string, assetId: string): void {
  const a = db().prepare("SELECT * FROM project_assets WHERE id=? AND project_id=?").get(assetId, projectId) as Asset | undefined;
  if (!a) return;
  db().prepare("DELETE FROM project_assets WHERE id=?").run(assetId);
  fs.rmSync(projectFile(projectId, a.filename), { force: true });
}

export function readMusicMap(id: string): MusicMap | null {
  try {
    return JSON.parse(fs.readFileSync(projectFile(id, "music_map.json"), "utf8"));
  } catch {
    return null;
  }
}

export function writeMusicMap(id: string, map: MusicMap): void {
  const target = projectFile(id, "music_map.json");
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(map));
  fs.renameSync(tmp, target);
}

export function totalSpend(): number {
  const r = db().prepare("SELECT COALESCE(SUM(spend_usd),0) AS s FROM projects").get() as { s: number };
  return r.s;
}
