import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { DATA_DIR, DB_PATH, SCHEMA_PATH } from "./paths";

// Node's built-in SQLite (no compiled add-on to install or break when Node updates).

declare global {
  // eslint-disable-next-line no-var
  var __dropDb: DatabaseSync | undefined;
}

/** One connection per server process (survives Next.js hot reloads). */
export function db(): DatabaseSync {
  if (!globalThis.__dropDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const conn = new DatabaseSync(DB_PATH);
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 15000; PRAGMA foreign_keys = ON;");
    conn.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
    // Additive migrations for databases created by older versions.
    for (const sql of ["ALTER TABLE shots ADD COLUMN character INTEGER NOT NULL DEFAULT 0"]) {
      try { conn.exec(sql); } catch { /* column already exists */ }
    }
    globalThis.__dropDb = conn;
  }
  return globalThis.__dropDb;
}

export const nowIso = () => new Date().toISOString();
