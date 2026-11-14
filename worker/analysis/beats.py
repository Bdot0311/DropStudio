"""Tempo, beat grid and downbeats.

Club music is (almost always) locked to a constant tempo, so instead of trusting a
frame-by-frame beat tracker (its beats are quantized to analysis frames, which adds up
to ~1 BPM of error, and it loses its place in kick-less breakdowns) we:

1. get a rough tempo from librosa,
2. find the exact period and phase with a "comb fit": the frequency/phase at which the
   whole track's onset curve lines up best (a Fourier coefficient at the beat rate,
   searched in 0.005 BPM steps),
3. refine the phase on the actual kick attacks in the low-passed waveform (~1 ms),
4. lay a perfect grid across the whole track, including kick-less intros/breakdowns.

If different parts of the track disagree about the phase (tempo drift: live recordings,
DJ edits), we fall back to librosa's tracked beats and flag it in the UI.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import librosa
import numpy as np
from scipy.signal import butter, sosfiltfilt

ONSET_HOP = 128


@dataclass
class BeatGrid:
    bpm: float
    beats: list[float]
    downbeats: list[float]
    downbeat_phase: int          # index of the first downbeat within `beats` (0..3)
    confidence: float            # 0..1, how strongly the track's onsets lock to the grid
    constant_tempo: bool
    notes: list[str] = field(default_factory=list)


def fold_bpm(bpm: float) -> float:
    while bpm < 88:
        bpm *= 2
    while bpm > 185:
        bpm /= 2
    return bpm


def _comb(env: np.ndarray, fps: float, bpm: float) -> complex:
    f = bpm / 60.0
    n = np.arange(len(env))
    return complex(np.sum(env * np.exp(-2j * np.pi * f * n / fps)))


def comb_fit(env: np.ndarray, fps: float, bpm_guess: float) -> tuple[float, float, float]:
    """Return (bpm, phase_seconds, coherence 0..1) maximising onset alignment near bpm_guess."""
    env = env - env.mean()
    norm = np.sum(np.abs(env)) + 1e-9

    def best_in(candidates):
        mags = [abs(_comb(env, fps, b)) for b in candidates]
        i = int(np.argmax(mags))
        return candidates[i], mags[i]

    coarse = np.arange(bpm_guess * 0.96, bpm_guess * 1.04, 0.05)
    b, _ = best_in(coarse)
    fine = np.arange(b - 0.1, b + 0.1, 0.005)
    b, mag = best_in(fine)
    c = _comb(env, fps, b)
    period = 60.0 / b
    # env ~ cos(2*pi*f*t - phi) gives c ~ exp(-j*phi), so the first beat is at phi / (2*pi*f)
    phase = (-np.angle(c) % (2 * np.pi)) / (2 * np.pi) * period
    return float(b), float(phase), float(min(1.0, 2 * mag / norm))


def _phase_drift(env: np.ndarray, fps: float, bpm: float, window_s: float = 30.0) -> float:
    """Max disagreement (in beats) between local phases measured in ~30 s windows."""
    period = 60.0 / bpm
    win = int(window_s * fps)
    phases, weights = [], []
    for start in range(0, len(env) - win // 2, win):
        seg = env[start:start + win]
        if len(seg) < win // 2:
            continue
        seg = seg - seg.mean()
        n = np.arange(start, start + len(seg))
        c = np.sum(seg * np.exp(-2j * np.pi * (bpm / 60.0) * n / fps))
        if abs(c) < 1e-9:
            continue
        phases.append(np.angle(c))
        weights.append(abs(c))
    if len(phases) < 2:
        return 0.0
    w = np.asarray(weights)
    strong = np.asarray(phases)[w > 0.3 * w.max()]
    if len(strong) < 2:
        return 0.0
    ref = strong[0]
    d = np.angle(np.exp(1j * (strong - ref)))
    return float((d.max() - d.min()) / (2 * np.pi))


def refine_phase_on_kicks(y: np.ndarray, sr: int, beats: np.ndarray) -> float:
    """Median offset (s) between grid beats and the actual low-end attack nearby."""
    sos = butter(4, 150, btype="low", fs=sr, output="sos")
    low = np.abs(sosfiltfilt(sos, y))
    hop = 32
    n = len(low) // hop
    env = low[: n * hop].reshape(n, hop).max(axis=1)
    env = np.convolve(env, np.ones(3) / 3, mode="same")
    d = np.diff(env, prepend=env[0])
    thresh = np.percentile(env, 95) * 0.3
    offsets = []
    w = int(0.06 * sr / hop)
    for b in beats:
        c = int(b * sr / hop)
        a, z = max(0, c - w), min(n, c + w)
        if z - a < 3:
            continue
        seg = env[a:z]
        if seg.max() < thresh:
            continue  # no kick here (breakdown)
        i = a + int(np.argmax(d[a:z]))
        offsets.append((i * hop) / sr - b)
    if len(offsets) < 8:
        return 0.0
    return float(np.median(offsets))


def detect_grid(y: np.ndarray, sr: int, first_downbeat: float | None = None,
                S_power: np.ndarray | None = None, spec_hop: int = 512) -> BeatGrid:
    duration = len(y) / sr
    notes: list[str] = []
    fps = sr / ONSET_HOP

    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=ONSET_HOP, n_fft=1024, aggregate=np.median)
    if env.max() <= 0:
        raise RuntimeError("Could not find any rhythm in this track. Is it mostly silence?")
    tempo = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=env, sr=sr, hop_length=ONSET_HOP, start_bpm=126))[0])
    bpm_guess = fold_bpm(tempo)
    bpm, phase, coherence = comb_fit(env, fps, bpm_guess)
    bpm = fold_bpm(bpm)

    drift = _phase_drift(env, fps, bpm)
    constant = drift < 0.2

    if constant:
        # Real tracks are produced at round-ish BPMs; snap when we're within a hair.
        if abs(bpm - round(bpm)) < 0.05:
            bpm = float(round(bpm))
        else:
            bpm = round(bpm, 2)
        period = 60.0 / bpm
        # Re-fit phase at the snapped BPM, then refine on the real kick attacks.
        c = _comb(env - env.mean(), fps, bpm)
        phase = (-np.angle(c) % (2 * np.pi)) / (2 * np.pi) * period
        grid = np.arange(phase % period, duration, period)
        phase += refine_phase_on_kicks(y, sr, grid)
        phase %= period
        beats = np.arange(phase, duration, period)
    else:
        notes.append("Tempo appears to vary. Using tracked beats instead of a fixed grid.")
        _, bf = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=ONSET_HOP, start_bpm=bpm)
        beats = librosa.frames_to_time(bf, sr=sr, hop_length=ONSET_HOP)
        if len(beats) > 1:
            bpm = round(60.0 / float(np.median(np.diff(beats))), 2)

    if coherence < 0.15:
        notes.append("Beat confidence is low. Check the grid with the click track and set the first downbeat by hand if needed.")

    if first_downbeat is not None:
        dphase = int(np.argmin(np.abs(beats - first_downbeat))) % 4
        notes.append("First downbeat set manually.")
    else:
        dphase = downbeat_phase(y, sr, beats, S_power=S_power, hop=spec_hop)

    downbeats = beats[dphase::4]
    return BeatGrid(
        bpm=round(float(bpm), 2),
        beats=[round(float(b), 4) for b in beats],
        downbeats=[round(float(b), 4) for b in downbeats],
        downbeat_phase=int(dphase),
        confidence=round(min(1.0, coherence * 2.5), 3),
        constant_tempo=constant,
        notes=notes,
    )


def downbeat_phase(y: np.ndarray, sr: int, beats: np.ndarray, S_power: np.ndarray | None = None, hop: int = 512) -> int:
    """Pick which of the 4 beat positions is beat "1".

    In dance music things change on the one: chords, sections, crashes, risers ending.
    Score each candidate phase by the harmonic and spectral change that lands on it.
    """
    if S_power is None:
        S_power = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)) ** 2
    chroma = librosa.feature.chroma_stft(S=S_power, sr=sr)
    mel = librosa.power_to_db(librosa.feature.melspectrogram(S=S_power, sr=sr, n_mels=32))
    frames = np.clip(librosa.time_to_frames(beats, sr=sr, hop_length=hop), 1, chroma.shape[1] - 1)
    frames = np.unique(frames)
    if len(frames) < 12:
        return 0
    c_sync = librosa.util.sync(chroma, frames, aggregate=np.mean)[:, 1:]
    m_sync = librosa.util.sync(mel, frames, aggregate=np.mean)[:, 1:]
    c_sync = c_sync / (np.linalg.norm(c_sync, axis=0, keepdims=True) + 1e-9)
    m_sync = (m_sync - m_sync.mean(axis=1, keepdims=True)) / (m_sync.std(axis=1, keepdims=True) + 1e-9)
    c_nov = np.r_[0, 1 - np.sum(c_sync[:, 1:] * c_sync[:, :-1], axis=0)]
    m_nov = np.r_[0, np.linalg.norm(np.diff(m_sync, axis=1), axis=0)]
    nov = c_nov / (c_nov.max() + 1e-9) + 0.5 * m_nov / (m_nov.max() + 1e-9)
    scores = [float(np.mean(nov[k::4])) for k in range(4)]
    return int(np.argmax(scores))
