"""One shared STFT (+ harmonic/percussive split) so we only pay for it once."""
from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property

import librosa
import numpy as np


@dataclass
class Spectrum:
    y: np.ndarray
    sr: int
    n_fft: int = 2048
    hop: int = 512

    @cached_property
    def S(self) -> np.ndarray:
        """Power spectrogram."""
        return np.abs(librosa.stft(self.y, n_fft=self.n_fft, hop_length=self.hop)) ** 2

    @cached_property
    def freqs(self) -> np.ndarray:
        return librosa.fft_frequencies(sr=self.sr, n_fft=self.n_fft)

    @cached_property
    def times(self) -> np.ndarray:
        return librosa.frames_to_time(np.arange(self.S.shape[1]), sr=self.sr, hop_length=self.hop)

    @cached_property
    def hp(self) -> tuple[np.ndarray, np.ndarray]:
        return librosa.decompose.hpss(self.S, kernel_size=17, margin=1.0)

    @property
    def H(self) -> np.ndarray:
        return self.hp[0]

    @property
    def P(self) -> np.ndarray:
        return self.hp[1]

    def band(self, lo: float, hi: float, S: np.ndarray | None = None) -> np.ndarray:
        S = self.S if S is None else S
        m = (self.freqs >= lo) & (self.freqs < hi)
        return S[m].sum(axis=0) if m.any() else np.zeros(S.shape[1])
