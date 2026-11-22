// Job queue access for the Node worker (same SQLite table the Python worker uses).
import { db, nowIso } from "../lib/db";
import type { Job } from "../lib/types";

type Row = Omit<Job, "params" | "result"> & { params: string; result: string | null };

export function claim(): Job | null {
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const row = conn.prepare("SELECT * FROM jobs WHERE worker='node' AND status='queued' ORDER BY created_at LIMIT 1").get() as Row | undefined;
    if (!row) {
      conn.exec("COMMIT");
      return null;
    }
    const t = nowIso();
    conn.prepare("UPDATE jobs SET status='running', started_at=?, heartbeat_at=?, progress=0, message='Starting' WHERE id=?").run(t, t, row.id);
    conn.exec("COMMIT");
    return { ...row, params: JSON.parse(row.params || "{}"), result: null } as Job;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

export function update(id: string, fields: Partial<{ status: string; progress: number; message: string; result: unknown; error: string | null; finished_at: string }>) {
  const f: Record<string, unknown> = { ...fields, heartbeat_at: nowIso() };
  if ("result" in f) f.result = JSON.stringify(f.result);
  const keys = Object.keys(f);
  db().prepare(`UPDATE jobs SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE id=?`).run(...keys.map((k) => f[k] as string | number | null), id);
}

export function status(id: string): string | null {
  const r = db().prepare("SELECT status FROM jobs WHERE id=?").get(id) as { status: string } | undefined;
  return r?.status ?? null;
}

export function failOrphans(): number {
  const r = db()
    .prepare("UPDATE jobs SET status='error', error=?, finished_at=? WHERE worker='node' AND status='running'")
    .run("The render worker stopped while this job was running. Click Retry (finished parts are reused).", nowIso());
  return Number(r.changes);
}

export class Cancelled extends Error {}
