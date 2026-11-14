"""Optional: the All-In-One music structure analyzer (allin1).

It's excellent at beats/downbeats but hard to install on a Mac (it needs NATTEN and madmom).
When it's present we use its downbeats and its segment boundaries as *hints*, then apply our
own EDM labelling on top. When it's missing we silently use librosa.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path


def available() -> bool:
    return importlib.util.find_spec("allin1") is not None


def analyze(path: Path) -> dict:
    import allin1  # type: ignore

    r = allin1.analyze(str(path))
    return {
        "bpm": float(r.bpm) if r.bpm else None,
        "beats": [float(b) for b in r.beats],
        "downbeats": [float(b) for b in r.downbeats],
        "boundaries": [float(s.start) for s in r.segments],
    }
