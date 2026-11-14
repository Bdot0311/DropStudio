"""Musical key via Krumhansl-Schmuckler profiles on chroma. Also returns the Camelot code DJs use."""
from __future__ import annotations

import numpy as np

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT = {"C#": "Db", "D#": "Eb", "F#": "F#", "G#": "Ab", "A#": "Bb"}
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
# Camelot wheel: index by pitch class
CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"]
CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"]


def detect_key(chroma: np.ndarray) -> dict:
    """chroma: (12, frames) energy, ideally from the harmonic component."""
    profile = chroma.mean(axis=1)
    if profile.sum() <= 0:
        return {"key": None, "camelot": None, "confidence": 0.0}
    best = (-2.0, 0, "major")
    scores = []
    for tonic in range(12):
        for mode, tmpl in (("major", MAJOR), ("minor", MINOR)):
            r = float(np.corrcoef(profile, np.roll(tmpl, tonic))[0, 1])
            scores.append(r)
            if r > best[0]:
                best = (r, tonic, mode)
    r, tonic, mode = best
    name = NOTES[tonic]
    name = FLAT.get(name, name) if mode == "major" and name in FLAT else name
    scores.sort(reverse=True)
    margin = scores[0] - scores[1] if len(scores) > 1 else 0
    return {
        "key": f"{name} {mode}",
        "camelot": (CAMELOT_MAJOR if mode == "major" else CAMELOT_MINOR)[tonic],
        "confidence": round(float(max(0.0, min(1.0, margin * 10))), 2),
    }
