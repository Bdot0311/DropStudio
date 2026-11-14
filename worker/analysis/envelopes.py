"""Per-frame (60 fps) energy envelopes and onset lists that drive the visuals."""
from __future__ import annotations

import librosa
import numpy as np

from .spectrum import Spectrum

ENV_FPS = 60

BANDS = {
    "low": (20, 150),
    "mid": (150, 4000),
    "high": (4000, 11000),
}


def normalize(x: np.ndarray, pct: float = 99.0) -> np.ndarray:
    top = float(np.percentile(x, pct)) if x.size else 0.0
    if top <= 1e-12:
        return np.zeros_like(x)
    return np.clip(x / top, 0.0, 1.0)


def to_fps(values: np.ndarray, frame_times: np.ndarray, duration: float, fps: int = ENV_FPS) -> np.ndarray:
    t = np.arange(int(np.ceil(duration * fps))) / fps
    return np.interp(t, frame_times, values)


def hits_envelope(onset_times, strengths, duration: float, decay: float, fps: int = ENV_FPS) -> np.ndarray:
    """Discrete hits -> instant attack + exponential decay (great for flashes and punches)."""
    n = int(np.ceil(duration * fps))
    env = np.zeros(n)
    if len(onset_times) == 0:
        return env
    strengths = normalize(np.asarray(strengths, dtype=float), 95)
    t = np.arange(n) / fps
    tail = int(decay * 6 * fps) + 1
    for ot, s in zip(onset_times, strengths):
        # The frame that *contains* the hit lights up fully, so flashes never land late.
        i = int(np.floor(ot * fps + 1e-6))
        if i >= n:
            continue
        j = min(n, i + tail)
        seg = s * np.exp(-np.maximum(0, t[i:j] - t[i]) / decay)
        env[i:j] = np.maximum(env[i:j], seg)
    return env


def detect_onsets(spec: Spectrum, S: np.ndarray, lo: float, hi: float, wait_s: float, delta_scale: float):
    m = (spec.freqs >= lo) & (spec.freqs < hi)
    band = librosa.power_to_db(S[m], ref=float(S[m].max()) + 1e-12, top_db=50)
    env = np.maximum(0, np.diff(band, axis=1, prepend=band[:, :1])).mean(axis=0)
    if env.max() <= 0:
        return np.array([]), np.array([])
    wait = max(1, int(wait_s * spec.sr / spec.hop))
    delta = float(np.percentile(env, 90)) * delta_scale
    peaks = librosa.util.peak_pick(env, pre_max=2, post_max=2, pre_avg=8, post_avg=8, delta=delta, wait=wait)
    times = librosa.frames_to_time(peaks, sr=spec.sr, hop_length=spec.hop)
    return times, env[peaks]


def snap_to_grid(times: np.ndarray, grid: np.ndarray, tol: float) -> np.ndarray:
    """Move each onset onto the nearest grid point if it's within `tol` seconds (quantize)."""
    if len(times) == 0 or len(grid) == 0:
        return times
    idx = np.clip(np.searchsorted(grid, times), 1, len(grid) - 1)
    left, right = grid[idx - 1], grid[idx]
    nearest = np.where(np.abs(times - left) < np.abs(times - right), left, right)
    return np.where(np.abs(times - nearest) <= tol, nearest, times)


def compute_envelopes(spec: Spectrum, duration: float, beats: list[float], stems: dict | None = None,
                      grid_locked: bool = True) -> tuple[dict, dict]:
    """Returns (envelopes, onsets). `stems` (optional) maps drums/bass/other -> mono arrays at spec.sr."""
    S, times = spec.S, spec.times
    env: dict = {"fps": ENV_FPS}
    env["rms"] = to_fps(normalize(np.sqrt(S.sum(axis=0))), times, duration)
    for name, (lo, hi) in BANDS.items():
        env[name] = to_fps(normalize(np.sqrt(spec.band(lo, hi))), times, duration)

    if stems:
        def pw(x):
            return np.abs(librosa.stft(x, n_fft=spec.n_fft, hop_length=spec.hop)) ** 2
        P = pw(stems["drums"])
        bass_curve = np.sqrt(pw(stems["bass"]).sum(axis=0))
        other_curve = np.sqrt(pw(stems["other"]).sum(axis=0))
    else:
        P = spec.P
        bass_curve = np.sqrt(spec.band(30, 250, spec.H))
        other_curve = np.sqrt(spec.band(250, 8000, spec.H))

    grid = np.asarray(beats, dtype=float)
    eighths = np.sort(np.r_[grid, grid[:-1] + np.diff(grid) / 2]) if len(grid) > 1 else grid
    sixteenths = np.sort(np.r_[eighths, eighths[:-1] + np.diff(eighths) / 2]) if len(eighths) > 1 else eighths

    kick_t, kick_s = detect_onsets(spec, P, 30, 150, wait_s=0.12, delta_scale=0.6)
    snare_t, snare_s = detect_onsets(spec, P, 1000, 5000, wait_s=0.12, delta_scale=0.8)
    hats_t, hats_s = detect_onsets(spec, P, 7000, 11000, wait_s=0.06, delta_scale=0.7)
    # Quantize to the grid: visuals should hit exactly on the beat, not 10 ms off.
    kick_t = snap_to_grid(kick_t, grid, 0.06)
    if grid_locked and len(grid):
        # 4/4 club music: kicks sit on the beat. Off-beat low-end hits are bass notes
        # (rolling basslines), and flashes must not fire on them.
        on_beat = np.isin(kick_t, grid)
        kick_t, kick_s = kick_t[on_beat], kick_s[on_beat]
    snare_t = snap_to_grid(snare_t, eighths, 0.05)
    hats_t = snap_to_grid(hats_t, sixteenths, 0.03)

    env["kick"] = hits_envelope(kick_t, kick_s, duration, decay=0.09)
    env["drums"] = to_fps(normalize(np.sqrt(P.sum(axis=0))), times, duration)
    env["bass"] = to_fps(normalize(bass_curve), times, duration)
    env["other"] = to_fps(normalize(other_curve), times, duration)

    for k, v in list(env.items()):
        if k != "fps":
            env[k] = [round(float(x), 3) for x in v]

    def dedupe(ts):
        return sorted({round(float(t), 4) for t in ts})

    onsets = {"kick": dedupe(kick_t), "snare_clap": dedupe(snare_t), "hats": dedupe(hats_t)}
    return env, onsets
