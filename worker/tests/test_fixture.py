"""Phase 1 acceptance test: analysis of the synthetic 128 BPM fixture.

  * BPM reads 128 +/- 0.5
  * the breakdown and the drop are detected within one bar of the truth
  * also holds after an MP3 round-trip (encoder delay, lossy artifacts)
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from worker.analysis.pipeline import analyze_track
from worker.fixtures.make_fixture import make_fixture

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def fixture_wav(tmp_path_factory) -> tuple[Path, dict]:
    out = tmp_path_factory.mktemp("fx") / "test_128bpm.wav"
    truth = make_fixture(out)
    return out, truth


@pytest.fixture(scope="session")
def fixture_mp3(fixture_wav) -> Path:
    wav, _ = fixture_wav
    mp3 = wav.with_suffix(".mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-b:a", "192k", str(mp3)], check=True)
    return mp3


def _truth_start(truth: dict, kind: str) -> float:
    return next(s["start"] for s in truth["sections"] if s["type"] == kind)


def _check(music_map: dict, truth: dict) -> None:
    bar = truth["bar_seconds"]
    assert abs(music_map["bpm"] - truth["bpm"]) <= 0.5, f"BPM {music_map['bpm']} != {truth['bpm']}"

    for kind in ("breakdown", "drop"):
        want = _truth_start(truth, kind)
        got = [s["start"] for s in music_map["sections"] if s["type"] == kind]
        assert got, f"no {kind} detected: {[(s['type'], s['start']) for s in music_map['sections']]}"
        err = min(abs(g - want) for g in got)
        assert err <= bar, f"{kind} at {got}, truth {want:.2f} (off by {err / bar:.2f} bars)"

    # Grid sanity: first downbeat lands on the truth's bar grid (within 20 ms).
    fd = music_map["downbeats"][0]
    off = (fd - truth["first_downbeat"]) % bar
    assert min(off, bar - off) < 0.02, f"downbeat grid off by {min(off, bar - off) * 1000:.0f} ms"

    # Sections tile the track without gaps.
    secs = music_map["sections"]
    assert secs[0]["start"] == 0
    assert abs(secs[-1]["end"] - music_map["duration"]) < 0.01
    for a, b in zip(secs, secs[1:]):
        assert abs(a["end"] - b["start"]) < 1e-6

    # Envelopes cover the whole track at 60 fps.
    env = music_map["envelopes"]
    n = len(env["rms"])
    assert abs(n / env["fps"] - music_map["duration"]) < 0.05
    assert all(len(env[k]) == n for k in ("low", "mid", "high", "kick", "bass", "drums", "other"))


def test_fixture_wav(fixture_wav):
    wav, truth = fixture_wav
    music_map, peaks = analyze_track(wav)
    _check(music_map, truth)
    assert music_map["key"] == "A minor"
    assert len(peaks) > 100
    # Kicks: every detected kick in the drop should sit on a beat.
    beats = music_map["beats"]
    drop_start = _truth_start(truth, "drop")
    kicks = [k for k in music_map["onsets"]["kick"] if drop_start <= k < drop_start + 16 * truth["bar_seconds"]]
    assert len(kicks) >= 60, f"only {len(kicks)} kicks found in the 64-beat drop"
    assert all(min(abs(k - b) for b in beats) < 0.005 for k in kicks)


def test_fixture_mp3(fixture_wav, fixture_mp3):
    _, truth = fixture_wav
    music_map, _ = analyze_track(fixture_mp3)
    _check(music_map, truth)


def test_manual_downbeat(fixture_wav):
    wav, truth = fixture_wav
    # Pretend the user says beat 2 is the one: the grid stays, the downbeat phase moves.
    beat = 60 / truth["bpm"]
    music_map, _ = analyze_track(wav, first_downbeat=truth["first_downbeat"] + beat)
    assert abs(music_map["downbeats"][0] - (truth["first_downbeat"] + beat)) < 0.02
    assert music_map["analysis"]["manual_downbeat"] is True
