"""SQLite access for the worker. The schema lives in db/schema.sql (shared with Next.js)."""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from .paths import DATA_DIR, DB_PATH, SCHEMA_PATH


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=15000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_schema() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA_PATH.read_text())


@contextmanager
def tx(conn: sqlite3.Connection):
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def claim_job(conn: sqlite3.Connection, worker: str = "python") -> dict | None:
    with tx(conn):
        row = conn.execute(
            "SELECT * FROM jobs WHERE worker=? AND status='queued' ORDER BY created_at LIMIT 1", (worker,)
        ).fetchone()
        if not row:
            return None
        t = now()
        conn.execute(
            "UPDATE jobs SET status='running', started_at=?, heartbeat_at=?, progress=0, message='Starting' WHERE id=?",
            (t, t, row["id"]),
        )
    job = dict(row)
    job["params"] = json.loads(job["params"] or "{}")
    return job


def update_job(conn, job_id: str, **fields) -> None:
    if "result" in fields and not isinstance(fields["result"], (str, type(None))):
        fields["result"] = json.dumps(fields["result"])
    fields["heartbeat_at"] = now()
    cols = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE jobs SET {cols} WHERE id=?", (*fields.values(), job_id))


def job_status(conn, job_id: str) -> str | None:
    row = conn.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
    return row["status"] if row else None


def enqueue(conn, type_: str, worker: str, project_id: str | None, params: dict) -> str:
    jid = uuid.uuid4().hex[:16]
    conn.execute(
        "INSERT INTO jobs (id, project_id, type, worker, params, created_at) VALUES (?,?,?,?,?,?)",
        (jid, project_id, type_, worker, json.dumps(params), now()),
    )
    return jid


def fail_orphaned_jobs(conn, worker: str = "python") -> int:
    """Jobs left 'running' by a crashed/stopped worker. Mark them failed so the UI can offer Retry."""
    cur = conn.execute(
        "UPDATE jobs SET status='error', error=?, finished_at=? WHERE worker=? AND status='running'",
        ("The worker stopped while this job was running. Click Retry.", now(), worker),
    )
    return cur.rowcount


def get_project(conn, project_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    return dict(row) if row else None


def update_project(conn, project_id: str, **fields) -> None:
    fields["updated_at"] = now()
    cols = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE projects SET {cols} WHERE id=?", (*fields.values(), project_id))
