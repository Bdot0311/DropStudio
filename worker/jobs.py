"""Job handlers + the polling loop that runs them one at a time."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import traceback
from pathlib import Path

from . import db
from .analysis.audio import AudioError, make_playback_copy
from .analysis.pipeline import analyze_track
from .paths import project_dir

log = logging.getLogger("drop.worker")

BROWSER_PLAYABLE = {".wav", ".mp3", ".flac", ".m4a", ".ogg"}


class Cancelled(Exception):
    pass


def write_json_atomic(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")))
    os.replace(tmp, path)


def handle_analyze(conn, job: dict, progress) -> dict:
    pid = job["project_id"]
    project = db.get_project(conn, pid)
    if not project or not project["audio_file"]:
        raise RuntimeError("This project has no audio file yet. Upload a track first.")
    pdir = project_dir(pid)
    audio = pdir / project["audio_file"]
    if not audio.exists():
        raise RuntimeError(f"The audio file is missing from the project folder ({audio.name}).")
    db.update_project(conn, pid, status="analyzing")

    playback = project["audio_file"]
    if audio.suffix.lower() not in BROWSER_PLAYABLE:
        progress(0.01, "Making a browser-playable copy")
        make_playback_copy(audio, pdir / "playback.wav")
        playback = "playback.wav"

    params = job["params"]
    music_map, peaks = analyze_track(
        audio,
        stems=bool(params.get("stems")),
        stems_dir=pdir / "stems",
        first_downbeat=params.get("first_downbeat"),
        engine=params.get("engine", "auto"),
        progress=progress,
    )
    mm_path = pdir / "music_map.json"
    if mm_path.exists():
        os.replace(mm_path, pdir / "music_map.prev.json")  # keep the previous (maybe hand-edited) map
    write_json_atomic(mm_path, music_map)
    write_json_atomic(pdir / "peaks.json", {"per_second": 100, "data": peaks})
    db.update_project(conn, pid, status="analyzed", duration=music_map["duration"], bpm=music_map["bpm"],
                      musical_key=music_map["key"], playback_file=playback)
    return {"bpm": music_map["bpm"], "key": music_map["key"], "sections": len(music_map["sections"]),
            "drops": music_map["drops"], "seconds": music_map["analysis"]["seconds"]}


def handle_make_fixture(conn, job: dict, progress) -> dict:
    from .fixtures.make_fixture import make_fixture

    pid = job["project_id"]
    pdir = project_dir(pid)
    pdir.mkdir(parents=True, exist_ok=True)
    progress(0.1, "Synthesizing a 128 BPM test track")
    truth = make_fixture(pdir / "test_128bpm.wav")
    db.update_project(conn, pid, audio_file="test_128bpm.wav", playback_file="test_128bpm.wav",
                      status="uploaded", duration=truth["duration"])
    analyze_id = db.enqueue(conn, "analyze", "python", pid, job["params"].get("analyze", {}))
    return {"analyze_job": analyze_id}


HANDLERS = {
    "analyze": handle_analyze,
    "make_fixture": handle_make_fixture,
}


class JobRunner:
    def __init__(self, poll_interval: float = 0.75):
        self.poll_interval = poll_interval
        self.last_poll = 0.0
        self.current: dict | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="job-runner", daemon=True)

    def start(self):
        db.init_schema()
        with db.connect() as conn:
            n = db.fail_orphaned_jobs(conn)
            if n:
                log.warning("Marked %d interrupted job(s) as failed", n)
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _loop(self):
        conn = db.connect()
        while not self._stop.is_set():
            self.last_poll = time.time()
            try:
                job = db.claim_job(conn)
            except Exception:
                log.exception("Could not read the job queue")
                time.sleep(2)
                continue
            if not job:
                self._stop.wait(self.poll_interval)
                continue
            self.current = job
            self._run(conn, job)
            self.current = None

    def _run(self, conn, job):
        jid = job["id"]
        handler = HANDLERS.get(job["type"])
        log.info("Job %s (%s) started", jid, job["type"])
        last_write = [0.0]

        def progress(p: float, message: str):
            self.last_poll = time.time()
            t = time.time()
            if t - last_write[0] > 0.25 or p >= 0.98:
                if db.job_status(conn, jid) == "cancelled":
                    raise Cancelled()
                db.update_job(conn, jid, progress=round(float(p), 3), message=message)
                last_write[0] = t

        try:
            if not handler:
                raise RuntimeError(f"Unknown job type: {job['type']}")
            result = handler(conn, job, progress)
            db.update_job(conn, jid, status="done", progress=1.0, message="Done", result=result, finished_at=db.now())
            log.info("Job %s done", jid)
        except Cancelled:
            db.update_job(conn, jid, message="Cancelled", finished_at=db.now())
            if job.get("project_id"):
                self._reset_project_status(conn, job["project_id"])
        except (AudioError, RuntimeError, ValueError) as e:
            log.warning("Job %s failed: %s", jid, e)
            db.update_job(conn, jid, status="error", error=str(e), finished_at=db.now())
            if job.get("project_id"):
                self._reset_project_status(conn, job["project_id"], error=True)
        except Exception as e:
            log.error("Job %s crashed:\n%s", jid, traceback.format_exc())
            db.update_job(conn, jid, status="error", error=f"Unexpected error: {e.__class__.__name__}: {e}",
                          finished_at=db.now())
            if job.get("project_id"):
                self._reset_project_status(conn, job["project_id"], error=True)

    @staticmethod
    def _reset_project_status(conn, pid, error=False):
        p = db.get_project(conn, pid)
        if not p:
            return
        has_map = (project_dir(pid) / "music_map.json").exists()
        status = "analyzed" if has_map else ("error" if error else "uploaded")
        db.update_project(conn, pid, status=status)
