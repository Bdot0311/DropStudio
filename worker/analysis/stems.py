"""Optional Demucs (htdemucs) stem separation. Uses the Apple GPU (MPS) when available."""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import numpy as np

from .audio import decode_mono

STEMS = ("drums", "bass", "other", "vocals")


def demucs_available() -> bool:
    return importlib.util.find_spec("demucs") is not None and importlib.util.find_spec("torch") is not None


def best_device() -> str:
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def separate(audio: Path, out_dir: Path, sr: int, log=print) -> dict[str, np.ndarray]:
    """Run htdemucs. Cached: if the stems already exist we just load them."""
    if not demucs_available():
        raise RuntimeError("Stem separation needs Demucs. Install it with:  npm run setup -- --with-stems")
    target = out_dir / "htdemucs" / audio.stem
    if not all((target / f"{s}.wav").exists() for s in STEMS):
        device = best_device()
        log(f"Separating stems with Demucs on {device.upper()} (this can take a few minutes)...")
        proc = subprocess.run(
            [sys.executable, "-m", "demucs", "-n", "htdemucs", "-d", device, "-o", str(out_dir), str(audio)],
            capture_output=True, text=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"Demucs failed: {proc.stderr.strip()[-400:]}")
    return {s: decode_mono(target / f"{s}.wav", sr) for s in STEMS}
