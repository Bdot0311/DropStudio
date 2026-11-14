import Database from "better-sqlite3";
import fs from "node:fs";
import { DATA_DIR, DB_PATH, SCHEMA_PATH } from "./paths";

declare global {
  // eslint-disable-next-line no-var
  var __dropDb: Database.Database | undefined;
}

/** One connection per server process (survives Next.js hot reloads). */
export function db(): Database.Database {
  if (!globalThis.__dropDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const conn = new Database(DB_PATH);
    conn.pragma("journal_mode = WAL");
    conn.pragma("busy_timeout = 15000");
    conn.pragma("foreign_keys = ON");
    conn.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
    globalThis.__dropDb = conn;
  }
  return globalThis.__dropDb;
}

export const nowIso = () => new Date().toISOString();
