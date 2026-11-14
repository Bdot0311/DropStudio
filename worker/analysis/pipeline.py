"""Track -> music_map.json. The one entry point the worker calls."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Callable

import librosa
import numpy as np

from . import allin1_adapter
from .audio import ANALYSIS_SR, compute_peaks, decode_mono, probe
from .beats import detect_grid
from .envelopes import compute_envelopes
from .key import detect_key
from .sections_edm import detect_sections, phrases_from_sections
from .spectrum import Spectrum
from .stems import separate

MUSIC_MAP_VERSION = 1

Progress = Callable[[float, str], None]


def analyze_track(path: Path, *, stems: bool = False, stems_dir: Path | None = None,
                  first_downbeat: float | None = None, engine: str = "auto",
                  progress: Progress = lambda p, m: None) -> tuple[dict, list[float]]:
    t_start = time.time()
    sr = ANALYSIS_SR
    progress(0.02, "Reading audio")
    info = probe(path)
    y = decode_mono(path, sr)
    duration = len(y) / sr
    notes: list[str] = []

    progress(0.08, "Drawing waveform")
    peaks = compute_peaks(y, sr)

    used_engine = "librosa"
    hint_boundaries: list[float] | None = None
    a1 = None
    if engine in ("auto", "allin1") and allin1_adapter.available():
        progress(0.12, "Running allin1 structure analysis")
        try:
            a1 = allin1_adapter.analyze(path)
            used_engine = "allin1+edm"
            hint_boundaries = a1["boundaries"]
        except Exception as e:  # never fail the whole analysis because of the optional engine
            notes.append(f"allin1 failed ({e.__class__.__name__}); used librosa instead.")
    elif engine == "allin1":
        notes.append("allin1 is not installed; used librosa instead.")

    progress(0.15, "Computing spectrum")
    spec = Spectrum(y, sr)
    _ = spec.S

    progress(0.2, "Finding tempo and beat grid")
    grid = detect_grid(y, sr, first_downbeat=first_downbeat, S_power=spec.S, spec_hop=spec.hop)
    notes += grid.notes
    beats, downbeats, bpm = grid.beats, grid.downbeats, grid.bpm
    if a1 and a1["downbeats"] and first_downbeat is None:
        # Use allin1's idea of where "the one" is, but keep our clean grid.
        first = a1["downbeats"][0]
        idx = int(np.argmin(np.abs(np.asarray(beats) - first)))
        downbeats = beats[idx % 4::4]

    progress(0.35, "Detecting key")
    key = detect_key(librosa.feature.chroma_stft(S=spec.H, sr=sr, n_fft=spec.n_fft))

    stem_audio = None
    if stems:
        progress(0.4, "Separating stems (Demucs)")
        stem_audio = separate(path, stems_dir or path.parent / "stems", sr, log=lambda m: progress(0.45, m))

    progress(0.6, "Measuring energy envelopes and hits")
    env, onsets = compute_envelopes(spec, duration, beats, stems=stem_audio, grid_locked=grid.constant_tempo)

    progress(0.8, "Labelling sections (intro / build / drop / breakdown / outro)")
    sections = detect_sections(spec, downbeats, duration, extra_boundaries=hint_boundaries)
    phrases = phrases_from_sections(sections, downbeats)

    drops = [s for s in sections if s["type"] == "drop"]
    music_map = {
        "version": MUSIC_MAP_VERSION,
        "duration": round(duration, 4),
        "source": {"sample_rate": info["sample_rate"], "channels": info["channels"], "codec": info["codec"]},
        "bpm": bpm,
        "key": key["key"],
        "camelot": key["camelot"],
        "beats": beats,
        "downbeats": downbeats,
        "phrases": phrases,
        "sections": [{**s, "start": round(s["start"], 4), "end": round(s["end"], 4)} for s in sections],
        "drops": [round(s["start"], 4) for s in drops],
        "envelopes": env,
        "onsets": onsets,
        "analysis": {
            "engine": used_engine,
            "beat_confidence": grid.confidence,
            "constant_tempo": grid.constant_tempo,
            "key_confidence": key["confidence"],
            "stems": bool(stems),
            "first_downbeat": downbeats[0] if downbeats else 0.0,
            "manual_downbeat": first_downbeat is not None,
            "seconds": round(time.time() - t_start, 1),
            "notes": notes,
            "edited": False,
        },
    }
    progress(0.98, "Saving")
    return music_map, peaks
