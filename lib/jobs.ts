import { nanoid } from "nanoid";
import { db, nowIso } from "./db";
import type { Job } from "./types";

type Row = Omit<Job, "params" | "result"> & { params: string; result: string | null };

function parse(row: Row | undefined): Job | null {
  if (!row) return null;
  return { ...row, params: JSON.parse(row.params || "{}"), result: row.result ? JSON.parse(row.result) : null };
}

export function enqueueJob(type: string, worker: "python" | "node", projectId: string | null, params: object = {}): Job {
  const id = nanoid(16);
  db()
    .prepare("INSERT INTO jobs (id, project_id, type, worker, params, created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, type, worker, JSON.stringify(params), nowIso());
  return getJob(id)!;
}

export function getJob(id: string): Job | null {
  return parse(db().prepare("SELECT * FROM jobs WHERE id=?").get(id) as Row | undefined);
}

export function projectJobs(projectId: string, limit = 20): Job[] {
  const rows = db().prepare("SELECT * FROM jobs WHERE project_id=? ORDER BY created_at DESC LIMIT ?").all(projectId, limit) as Row[];
  return rows.map((r) => parse(r)!);
}

export function latestJob(projectId: string, type: string): Job | null {
  return parse(
    db().prepare("SELECT * FROM jobs WHERE project_id=? AND type=? ORDER BY created_at DESC LIMIT 1").get(projectId, type) as Row | undefined
  );
}

export function activeJob(projectId: string, type: string): Job | null {
  return parse(
    db()
      .prepare("SELECT * FROM jobs WHERE project_id=? AND type=? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1")
      .get(projectId, type) as Row | undefined
  );
}

export function cancelJob(id: string): Job | null {
  db().prepare("UPDATE jobs SET status='cancelled', finished_at=? WHERE id=? AND status IN ('queued','running')").run(nowIso(), id);
  return getJob(id);
}

/** True if the worker hasn't touched a running job for a while (crashed or not started). */
export function isStale(job: Job, seconds = 60): boolean {
  if (job.status === "queued") return Date.now() - Date.parse(job.created_at) > seconds * 1000;
  if (job.status === "running" && job.heartbeat_at) return Date.now() - Date.parse(job.heartbeat_at) > seconds * 1000;
  return false;
}
