"""Synthetic 128 BPM test track with known structure.

Layout (bars of 4/4 at 128 BPM, 1 bar = 1.875 s), starting after a short lead-in:

    intro      16 bars  kick, quiet off-beat hats, soft pad
    build      16 bars  kick, hats, rolling bass, riser in the last 4 bars
    breakdown  16 bars  NO kick, pad chords only, riser in the last 4 bars
    drop       16 bars  loud kick, loud bass, clap, 16th hats, lead
    outro       8 bars  kick + hats, fading

Writes a stereo 16-bit WAV plus <name>.truth.json with the exact ground truth.

Usage:  python -m worker.fixtures.make_fixture out.wav
"""
from __future__ import annotations

import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 128.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
LEAD_IN = 0.25  # seconds of silence before the first downbeat

STRUCTURE = [
    ("intro", 16),
    ("build", 16),
    ("breakdown", 16),
    ("drop", 16),
    ("outro", 8),
]

# A minor: Am - F - C - G, two bars each (root frequencies of the chords, octave 3)
CHORDS = [
    (220.00, 261.63, 329.63),  # Am
    (174.61, 220.00, 261.63),  # F
    (130.81, 164.81, 196.00),  # C
    (196.00, 246.94, 293.66),  # G
]
BASS_ROOTS = [55.00, 43.65, 65.41, 49.00]  # A1 F1 C2 G1

rng = np.random.default_rng(1234)


def _env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def kick(level: float = 1.0) -> np.ndarray:
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    freq = 50 + 110 * np.exp(-t / 0.03)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-t / 0.12)
    click = rng.standard_normal(n) * np.exp(-t / 0.002) * 0.3
    return level * (body + click)


def hat(level: float = 0.25, decay: float = 0.03) -> np.ndarray:
    n = int(0.08 * SR)
    noise = np.diff(rng.standard_normal(n + 1))  # crude high-pass
    return level * noise * _env(n, 0.0005, decay) * 0.5


def clap(level: float = 0.5) -> np.ndarray:
    n = int(0.2 * SR)
    noise = rng.standard_normal(n)
    # crude band-pass: difference of two moving averages
    k1, k2 = 3, 12
    lp1 = np.convolve(noise, np.ones(k1) / k1, mode="same")
    lp2 = np.convolve(noise, np.ones(k2) / k2, mode="same")
    return level * (lp1 - lp2) * _env(n, 0.001, 0.06) * 1.5


def bass_note(freq: float, length: float, level: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t)
    return level * tone * _env(n, 0.005, length * 0.6)


def pad_chord(freqs, length: float, level: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for detune in (-0.6, 0.0, 0.6):
            out += np.sin(2 * np.pi * (f + detune) * t)
    env = np.clip(t / 0.4, 0, 1) * np.clip((length - t) / 0.3, 0, 1)
    return level * out * env / (3 * len(freqs))


def lead_note(freq: float, length: float, level: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    saw = 2 * ((freq * t) % 1.0) - 1
    saw = np.convolve(saw, np.ones(4) / 4, mode="same")
    return level * saw * _env(n, 0.003, length * 0.7)


def riser(length: float, level: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    ramp = (t / length) ** 2
    noise = np.diff(rng.standard_normal(n + 1)) * 0.3
    sweep_f = 200 + 1800 * (t / length) ** 2
    sweep = np.sin(2 * np.pi * np.cumsum(sweep_f) / SR) * 0.3
    return level * ramp * (noise + sweep)


def place(buf: np.ndarray, sound: np.ndarray, t: float) -> None:
    i = int(round(t * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sound))
    buf[i:j] += sound[: j - i]


def build_track():
    total_bars = sum(b for _, b in STRUCTURE)
    duration = LEAD_IN + total_bars * BAR + 1.5
    mono = np.zeros(int(duration * SR))
    hats_lr = np.zeros(len(mono))  # hats panned slightly for stereo interest

    sections = []
    bar_cursor = 0
    for name, n_bars in STRUCTURE:
        start = LEAD_IN + bar_cursor * BAR
        sections.append({"type": name, "start": round(start, 6), "end": round(start + n_bars * BAR, 6),
                         "start_bar": bar_cursor, "bars": n_bars})
        for b in range(n_bars):
            bar_t = start + b * BAR
            global_bar = bar_cursor + b
            chord_i = (global_bar // 2) % 4
            frac = b / n_bars  # progress through the section

            # --- drums ---
            if name in ("intro", "build", "drop", "outro"):
                lvl = {"intro": 0.55, "build": 0.7, "drop": 1.0, "outro": 0.6 * (1 - 0.5 * frac)}[name]
                for beat in range(4):
                    place(mono, kick(lvl), bar_t + beat * BEAT)
            if name in ("intro", "build", "outro"):
                for beat in range(4):
                    place(hats_lr, hat(0.12 if name == "intro" else 0.18), bar_t + (beat + 0.5) * BEAT)
            if name == "build" and b >= 8:
                for s in range(16):
                    if s % 2 == 0:
                        place(hats_lr, hat(0.08, 0.015), bar_t + s * BEAT / 4)
            if name == "drop":
                for s in range(16):
                    place(hats_lr, hat(0.22 if s % 2 else 0.12, 0.02), bar_t + s * BEAT / 4)
                for beat in (1, 3):
                    place(mono, clap(0.55), bar_t + beat * BEAT)

            # --- bass (rolling off-beat 8ths) ---
            if name in ("build", "drop"):
                lvl = 0.35 if name == "build" else 0.75
                for beat in range(4):
                    place(mono, bass_note(BASS_ROOTS[chord_i], BEAT * 0.45, lvl), bar_t + (beat + 0.5) * BEAT)

            # --- pads (chord changes on downbeats every 2 bars) ---
            if b % 2 == 0 and name in ("intro", "breakdown", "drop"):
                lvl = {"intro": 0.12, "breakdown": 0.22, "drop": 0.12}[name]
                place(mono, pad_chord(CHORDS[chord_i], 2 * BAR, lvl), bar_t)

            # --- lead (drop only) ---
            if name == "drop":
                notes = [440.0, 523.25, 659.25, 523.25]
                for s in range(4):
                    place(mono, lead_note(notes[(s + chord_i) % 4], BEAT * 0.9, 0.16), bar_t + s * BEAT)

        # --- risers into the next section ---
        if name in ("build", "breakdown"):
            place(mono, riser(4 * BAR, 0.35 if name == "breakdown" else 0.2), start + (n_bars - 4) * BAR)

        bar_cursor += n_bars

    left = mono + hats_lr * 0.8
    right = mono + hats_lr * 1.2
    stereo = np.stack([left, right], axis=1)
    stereo *= 0.89 / np.max(np.abs(stereo))

    truth = {
        "bpm": BPM,
        "first_downbeat": LEAD_IN,
        "bar_seconds": BAR,
        "key": "A minor",
        "duration": len(mono) / SR,
        "sections": sections,
    }
    return stereo, truth


def write_wav(path: Path, stereo: np.ndarray) -> None:
    pcm = np.clip(stereo * 32767, -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def make_fixture(out_path: str | Path) -> dict:
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    stereo, truth = build_track()
    write_wav(out, stereo)
    out.with_suffix(".truth.json").write_text(json.dumps(truth, indent=2))
    return truth


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "fixtures/test_128bpm.wav"
    t = make_fixture(target)
    print(f"Wrote {target}  ({t['duration']:.1f}s, {t['bpm']} BPM)")
    for s in t["sections"]:
        print(f"  {s['type']:<10} {s['start']:7.2f}s  {s['bars']} bars")
