import path from "node:path";

// Mirrors worker/paths.py
export const ROOT = process.cwd();
export const DATA_DIR = process.env.DROP_DATA_DIR || path.join(ROOT, "data");
export const PROJECTS_DIR = process.env.DROP_PROJECTS_DIR || path.join(ROOT, "projects");
export const DB_PATH = path.join(DATA_DIR, "drop.db");
export const SCHEMA_PATH = path.join(ROOT, "db", "schema.sql");
export const WORKER_URL = `http://127.0.0.1:${process.env.DROP_WORKER_PORT || "8765"}`;

const ID_RE = /^[a-zA-Z0-9_-]{4,40}$/;

export function projectDir(id: string): string {
  if (!ID_RE.test(id)) throw new Error("Bad project id");
  return path.join(PROJECTS_DIR, id);
}

/** Resolve a file inside a project folder, refusing anything that escapes it. */
export function projectFile(id: string, rel: string): string {
  const base = projectDir(id);
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Bad path");
  return full;
}
