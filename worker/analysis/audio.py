"""Audio decoding via FFmpeg (handles WAV, AIFF, MP3, FLAC identically)."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np

ANALYSIS_SR = 22050


class AudioError(RuntimeError):
    pass


def require_ffmpeg() -> None:
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise AudioError("FFmpeg is not installed. On a Mac run:  brew install ffmpeg")


def probe(path: Path) -> dict:
    require_ffmpeg()
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-select_streams", "a:0", str(path)],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise AudioError(f"Could not read this audio file ({out.stderr.strip() or 'unknown format'}).")
    info = json.loads(out.stdout)
    if not info.get("streams"):
        raise AudioError("This file has no audio stream.")
    s = info["streams"][0]
    return {
        "codec": s.get("codec_name"),
        "sample_rate": int(s.get("sample_rate", 0)),
        "channels": int(s.get("channels", 0)),
        "duration": float(s.get("duration") or info["format"].get("duration") or 0),
    }


def decode_mono(path: Path, sr: int = ANALYSIS_SR) -> np.ndarray:
    """Decode any supported file to mono float32 at `sr`."""
    require_ffmpeg()
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "f32le", "pipe:1"],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise AudioError(f"FFmpeg failed to decode the file: {proc.stderr.decode(errors='replace').strip()[:300]}")
    y = np.frombuffer(proc.stdout, dtype="<f4").astype(np.float32)
    if y.size < sr:
        raise AudioError("The audio is shorter than one second.")
    return y


def make_playback_copy(src: Path, dst: Path) -> None:
    """Browsers can't play AIFF. Make a WAV copy for the waveform player (playback only)."""
    require_ffmpeg()
    proc = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c:a", "pcm_s16le", str(dst)], capture_output=True)
    if proc.returncode != 0:
        raise AudioError("Could not create a browser-playable copy of the audio.")


def compute_peaks(y: np.ndarray, sr: int, per_second: int = 100) -> list[float]:
    hop = max(1, sr // per_second)
    n = len(y) // hop
    if n == 0:
        return []
    blocks = np.abs(y[: n * hop]).reshape(n, hop).max(axis=1)
    top = float(np.max(blocks)) or 1.0
    return [round(float(v), 3) for v in blocks / top]
