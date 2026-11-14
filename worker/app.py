"""Python worker: FastAPI (health + info for the UI) and the background job loop.

Started by `npm run dev`. Listens on 127.0.0.1:8765 (local only).
"""
from __future__ import annotations

import importlib.metadata
import importlib.util
import logging
import platform
import shutil
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .analysis import allin1_adapter
from .analysis.stems import best_device, demucs_available
from .jobs import JobRunner
from .paths import DB_PATH, PROJECTS_DIR

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
runner = JobRunner()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    runner.start()
    yield
    runner.stop()


app = FastAPI(title="Drop Studio worker", lifespan=lifespan)


def _pkg(name: str, dist: str | None = None) -> dict:
    found = importlib.util.find_spec(name) is not None
    version = None
    if found:
        try:
            version = importlib.metadata.version(dist or name)
        except importlib.metadata.PackageNotFoundError:
            pass
    return {"installed": found, "version": version}


@app.get("/health")
def health(deep: bool = False):
    stems = demucs_available()
    info = {
        "ok": True,
        "python": sys.version.split()[0],
        "platform": f"{platform.system()} {platform.machine()}",
        "worker_loop": {"alive": time.time() - runner.last_poll < 10 or runner.current is not None,
                        "current_job": runner.current["type"] if runner.current else None},
        "ffmpeg": bool(shutil.which("ffmpeg")) and bool(shutil.which("ffprobe")),
        "db": str(DB_PATH),
        "projects_dir": str(PROJECTS_DIR),
        "packages": {
            "numpy": _pkg("numpy"),
            "scipy": _pkg("scipy"),
            "librosa": _pkg("librosa"),
            "soundfile": _pkg("soundfile"),
            "fastapi": _pkg("fastapi"),
            "torch": _pkg("torch"),
            "demucs": _pkg("demucs"),
            "allin1": _pkg("allin1"),
        },
        "features": {
            "stems": stems,
            "allin1": allin1_adapter.available(),
        },
    }
    if deep and stems:
        info["features"]["stems_device"] = best_device()
    return info
