"""Dance-music section detection: intro | build | drop | breakdown | outro.

Pop-trained structure models think in verses and choruses. Club tracks are built
from 8/16/32-bar phrases and defined by what the low end is doing, so we:

1. measure each bar: low-band (20-150 Hz) level, overall RMS, high band, onset density;
2. score every bar line for "how different is what comes after from what came before",
   boosted on 8/16/32-bar phrase lines;
3. pick the strongest boundaries (min 8 bars apart, 4 at the very start/end);
4. label each section from its energy profile and its neighbours.

Boundaries proposed by another analyzer (e.g. allin1) can be passed in as extra
candidates; they get snapped to downbeats and go through the same scoring.
"""
from __future__ import annotations

import librosa
import numpy as np

from .spectrum import Spectrum

SECTION_TYPES = ("intro", "build", "drop", "breakdown", "outro")


def _db_norm(x: np.ndarray) -> np.ndarray:
    db = 10 * np.log10(np.maximum(x, 1e-12))
    lo, hi = np.percentile(db, 5), np.percentile(db, 98)
    if hi - lo < 1e-6:
        return np.zeros_like(db)
    return np.clip((db - lo) / (hi - lo), 0, 1)


def bar_features(spec: Spectrum, downbeats: np.ndarray, duration: float) -> dict:
    S, times = spec.S, spec.times
    low = spec.band(20, 150)
    high = spec.band(4000, 11000)
    total = S.sum(axis=0)
    onset = librosa.onset.onset_strength(S=librosa.power_to_db(S), sr=spec.sr, hop_length=spec.hop)

    edges = list(downbeats) + [duration]
    if edges[0] > 0.05:
        edges = [0.0] + edges
    idx = np.searchsorted(times, edges)
    feats = {"low": [], "rms": [], "high": [], "onset": [], "start": [], "end": []}
    for a, b, t0, t1 in zip(idx[:-1], idx[1:], edges[:-1], edges[1:]):
        b = max(b, a + 1)
        feats["low"].append(low[a:b].mean())
        feats["high"].append(high[a:b].mean())
        feats["rms"].append(total[a:b].mean())
        feats["onset"].append(onset[a:b].mean() if b <= len(onset) else 0.0)
        feats["start"].append(t0)
        feats["end"].append(t1)
    out = {k: np.asarray(v, dtype=float) for k, v in feats.items()}
    for k in ("low", "high", "rms"):
        out[k] = _db_norm(out[k])
    o = out["onset"]
    out["onset"] = np.clip(o / (np.percentile(o, 98) + 1e-9), 0, 1)
    # A pickup bar before the first downbeat is not a real bar; mark it.
    out["has_pickup"] = edges[0] == 0.0 and downbeats[0] > 0.05
    return out


def _boundary_scores(F: np.ndarray, phrase_offset: int, window: int = 4) -> np.ndarray:
    n = len(F)
    scores = np.zeros(n)
    for b in range(1, n):
        w_before = F[max(0, b - window):b]
        w_after = F[b:min(n, b + window)]
        d = np.abs(w_after.mean(axis=0) - w_before.mean(axis=0))
        # Weighted: the low end matters most in dance music.
        scores[b] = 1.6 * d[0] + 1.0 * d[1] + 0.6 * d[2] + 0.5 * d[3]
        rel = b - phrase_offset
        if rel % 16 == 0:
            scores[b] *= 1.0
        elif rel % 8 == 0:
            scores[b] *= 0.85
        elif rel % 4 == 0:
            scores[b] *= 0.55
        else:
            scores[b] *= 0.3
    return scores


def detect_sections(spec: Spectrum, downbeats: list[float], duration: float,
                    extra_boundaries: list[float] | None = None) -> list[dict]:
    db = np.asarray(downbeats)
    feats = bar_features(spec, db, duration)
    pickup = 1 if feats["has_pickup"] else 0
    F = np.stack([feats["low"], feats["rms"], feats["high"], feats["onset"]], axis=1)
    n_bars = len(F)

    scores = _boundary_scores(F, phrase_offset=pickup)
    if extra_boundaries:
        for t in extra_boundaries:
            b = int(np.argmin(np.abs(feats["start"] - t)))
            scores[b] *= 1.25

    threshold = max(0.22, 0.1 * float(scores.max()))
    chosen: list[int] = []
    for b in np.argsort(scores)[::-1]:
        if scores[b] < threshold:
            break
        min_gap = 8
        near_edge = b - pickup < 8 or n_bars - b < 8
        if near_edge:
            min_gap = 4
        if b - pickup < 4 or n_bars - b < 4:
            continue
        if all(abs(b - c) >= min_gap for c in chosen):
            chosen.append(int(b))
    bounds = sorted(set([0] + chosen + [n_bars]))

    sections = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        seg = F[a:b]
        sections.append({
            "start": float(feats["start"][a]),
            "end": float(feats["end"][b - 1]),
            "bars": int(b - a),
            "_low": float(seg[:, 0].mean()),
            "_rms": float(seg[:, 1].mean()),
            "_high": float(seg[:, 2].mean()),
            "_onset": float(seg[:, 3].mean()),
            "_high_slope": float(np.polyfit(np.arange(len(seg)), seg[:, 2] + seg[:, 3], 1)[0]) if len(seg) > 2 else 0.0,
        })
    # A pickup bar (audio before the first downbeat) is folded into the first section.
    if pickup and len(sections) > 1 and sections[0]["bars"] == 1:
        sections[1]["start"] = sections[0]["start"]
        sections.pop(0)
    sections[0]["start"] = 0.0
    sections[-1]["end"] = float(duration)

    label_sections(sections)
    sections = merge_similar(sections)
    for s in sections:
        for k in [k for k in s if k.startswith("_")]:
            del s[k]
    return sections


def label_sections(sections: list[dict]) -> None:
    """Assign EDM labels in place based on energy and context."""
    for s in sections:
        s["energy"] = round(0.45 * s["_rms"] + 0.4 * s["_low"] + 0.15 * s["_high"], 3)
    if len(sections) == 1:
        sections[0]["type"] = "drop"
        return
    emax = max(s["energy"] for s in sections)
    lmax = max(s["_low"] for s in sections) or 1.0

    n = len(sections)
    labels: list[str | None] = [None] * n

    # Drops: the loudest low end, and louder than what came right before it.
    for i, s in enumerate(sections):
        strong = s["_low"] >= 0.8 * lmax and s["energy"] >= 0.85 * emax
        if not strong:
            continue
        prev = sections[i - 1] if i > 0 else None
        jump = prev is None or s["energy"] - prev["energy"] > 0.08 or s["_low"] - prev["_low"] > 0.12
        continues_drop = i > 0 and labels[i - 1] == "drop"
        if jump or continues_drop:
            labels[i] = "drop"

    # Fallback: if nothing qualified, the single most energetic section is the drop.
    if "drop" not in labels:
        best = max(range(n), key=lambda i: sections[i]["energy"])
        labels[best] = "drop"

    # Breakdowns: sustained low kick/bass, somewhere in the middle.
    for i, s in enumerate(sections):
        if labels[i] or i == 0 or i == n - 1:
            continue
        if s["_low"] < 0.45 * lmax:
            labels[i] = "breakdown"

    # Intro / outro at the edges (unless they already are drops).
    if labels[0] is None:
        labels[0] = "intro"
    if labels[-1] is None:
        labels[-1] = "outro"

    # Everything else: build. Something that leads into a drop or rises is clearly a build;
    # mid-energy grooves get the same label (editable in the UI).
    for i in range(n):
        if labels[i] is None:
            if sections[i]["_low"] < 0.45 * lmax and i < n - 1 and labels[i + 1] != "drop":
                labels[i] = "breakdown"
            else:
                labels[i] = "build"

    # A riser section between a breakdown and a drop is the build-up.
    for i in range(1, n - 1):
        if labels[i] == "breakdown" and labels[i - 1] == "breakdown" and labels[i + 1] == "drop" \
                and sections[i]["_high_slope"] > 0 and sections[i]["energy"] > sections[i - 1]["energy"]:
            labels[i] = "build"

    for s, lab in zip(sections, labels):
        s["type"] = lab


def merge_similar(sections: list[dict]) -> list[dict]:
    """Merge neighbours that got the same label and sound alike (keeps real tracks from over-splitting)."""
    out = [sections[0]]
    for s in sections[1:]:
        p = out[-1]
        same = s["type"] == p["type"] and abs(s["_low"] - p["_low"]) < 0.15
        if same and (s["type"] != "drop" or abs(s["energy"] - p["energy"]) < 0.08):
            total = p["bars"] + s["bars"]
            for k in ("energy", "_low", "_rms", "_high", "_onset"):
                p[k] = (p[k] * p["bars"] + s[k] * s["bars"]) / total
            p["energy"] = round(p["energy"], 3)
            p["end"] = s["end"]
            p["bars"] = total
        else:
            out.append(s)
    return out


def phrases_from_sections(sections: list[dict], downbeats: list[float]) -> list[dict]:
    """Split each section into 16-bar phrases (8 when that's what fits, remainder otherwise)."""
    db = np.asarray(downbeats)
    out = []
    for s in sections:
        bars = [t for t in db if s["start"] - 1e-3 <= t < s["end"] - 1e-3]
        i = 0
        while i < len(bars):
            remaining = len(bars) - i
            size = 16 if remaining >= 16 else (8 if remaining >= 8 else remaining)
            out.append({"start": round(float(bars[i]), 4), "bars": int(size), "section": s["type"]})
            i += size
    return out
