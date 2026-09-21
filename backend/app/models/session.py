"""Normalized in-memory motion model (layer 2) and API schemas."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from pydantic import BaseModel


@dataclass
class MotionSession:
    """Normalized session. `positions`/`velocities` are the RAW values from Excel
    (non-numeric cells become NaN); `valid_*` masks say which samples to trust."""

    id: str
    position_file: str
    velocity_file: str | None
    frames: np.ndarray  # [F] int64, original Qualisys frame numbers
    timestamps: np.ndarray  # [F] float64 seconds
    marker_names: list[str]  # [M]
    positions: np.ndarray  # [F, M, 3] raw
    valid_positions: np.ndarray  # [F, M] bool
    sample_rate: float
    position_unit: str
    velocity_unit: str
    velocities: np.ndarray | None = None  # [F, M, 3] raw
    valid_velocities: np.ndarray | None = None  # [F, M] bool
    speed: np.ndarray | None = None  # [F, M], computed once (NaN where invalid)
    invalid_reasons: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    @property
    def frame_count(self) -> int:
        return int(self.frames.shape[0])

    @property
    def has_velocity(self) -> bool:
        return self.velocities is not None

    @property
    def duration(self) -> float:
        return float(self.timestamps[-1] - self.timestamps[0]) if self.frame_count else 0.0


class SessionSummary(BaseModel):
    id: str
    positionFile: str
    velocityFile: str | None
    hasVelocity: bool
    frameCount: int | None = None
    markerCount: int | None = None
    sampleRate: float | None = None
    error: str | None = None


class TrackingLoss(BaseModel):
    marker: str
    invalidSamples: int
    ranges: list[tuple[int, int]]  # original Qualisys frame ranges (inclusive)


class SessionMetadata(BaseModel):
    id: str
    positionFile: str
    velocityFile: str | None
    hasVelocity: bool
    frameCount: int
    firstFrame: int
    lastFrame: int
    sampleRate: float
    duration: float
    markers: list[str]
    positionUnit: str
    velocityUnit: str
    positionChannels: int
    velocityChannels: int
    missingSamples: int
    invalidReasons: dict[str, int]
    trackingLoss: list[TrackingLoss]
    warnings: list[str]
