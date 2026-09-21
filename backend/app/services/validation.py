"""Validity detection (layer 1 -> 2). Produces masks; never edits raw values."""
from __future__ import annotations

import numpy as np


def zero_run_mask(positions: np.ndarray, min_run: int) -> np.ndarray:
    """[F,M] bool: True where X=Y=Z=0 exactly, within a run of >= min_run samples."""
    zero = np.all(positions == 0.0, axis=2)  # [F, M]
    out = np.zeros_like(zero)
    for m in range(zero.shape[1]):
        col = zero[:, m]
        if not col.any():
            continue
        padded = np.concatenate(([False], col, [False]))
        d = np.diff(padded.astype(np.int8))
        starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
        for s, e in zip(starts, ends):
            if e - s >= min_run:
                out[s:e, m] = True
    return out


def position_validity(positions: np.ndarray, min_zero_run: int) -> tuple[np.ndarray, dict[str, int]]:
    nonfinite = ~np.all(np.isfinite(positions), axis=2)
    zeros = zero_run_mask(np.nan_to_num(positions, nan=1.0), min_zero_run)
    invalid = nonfinite | zeros
    return ~invalid, {
        "nonFinite": int(nonfinite.sum()),
        "zeroRun": int((zeros & ~nonfinite).sum()),
    }


def contiguous_ranges(mask_1d: np.ndarray, frames: np.ndarray) -> list[tuple[int, int]]:
    """Ranges (original frame numbers, inclusive) where mask_1d is True."""
    if not mask_1d.any():
        return []
    padded = np.concatenate(([False], mask_1d, [False]))
    d = np.diff(padded.astype(np.int8))
    starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
    return [(int(frames[s]), int(frames[e - 1])) for s, e in zip(starts, ends)]


def detect_position_unit(positions: np.ndarray, valid: np.ndarray, default: str) -> str:
    """Heuristic: extents of tens/hundreds/thousands => mm; a few units => m."""
    if not valid.any():
        return default
    extent = float(np.max(np.abs(positions[valid])))
    return "m" if extent < 20.0 else "mm"
