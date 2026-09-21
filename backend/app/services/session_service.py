"""Session discovery, normalization and caching."""
from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .. import config
from ..models.session import MotionSession, SessionMetadata, SessionSummary, TrackingLoss
from . import qualisys_parser as qp
from . import validation as val

log = logging.getLogger(__name__)

_FILE_RE = re.compile(r"^(?P<id>.+)_(?P<kind>pos|vel)\.xlsx$", re.IGNORECASE)


@dataclass(frozen=True)
class SessionFiles:
    id: str
    position: Path
    velocity: Path | None

    def signature(self) -> tuple:
        sig = [self.position.stat().st_mtime_ns]
        sig.append(self.velocity.stat().st_mtime_ns if self.velocity else None)
        return tuple(sig)


def discover_files(data_dir: Path) -> dict[str, SessionFiles]:
    """Group `<id>_Pos.xlsx` / `<id>_Vel.xlsx` by id. Position file is required."""
    pos: dict[str, Path] = {}
    vel: dict[str, Path] = {}
    if not data_dir.is_dir():
        return {}
    for p in sorted(data_dir.iterdir()):
        if not p.is_file() or p.name.startswith(("~$", ".")):
            continue
        m = _FILE_RE.match(p.name)
        if not m:
            continue
        (pos if m["kind"].lower() == "pos" else vel)[m["id"]] = p
    return {i: SessionFiles(i, pos[i], vel.get(i)) for i in sorted(pos)}


def build_session(files: SessionFiles) -> MotionSession:
    warnings: list[str] = []
    pos = qp.parse_table(files.position)
    if pos.kind != "pos":
        raise qp.QualisysParseError(f"{files.position.name} does not contain position data")
    if pos.non_numeric_cells:
        warnings.append(f"{pos.non_numeric_cells} non-numeric position cells treated as missing")

    frames, names = pos.frames, pos.marker_names
    if len(np.unique(frames)) != len(frames):
        raise qp.QualisysParseError("Duplicate frame numbers in position file")

    # Sample rate: header FREQUENCY, cross-checked against Time column.
    hdr_rate = float(pos.metadata.get("FREQUENCY") or 0) or None
    dt = np.diff(pos.times[np.isfinite(pos.times)])
    time_rate = float(1.0 / np.median(dt)) if dt.size and np.median(dt) > 0 else None
    sample_rate = hdr_rate or time_rate
    if sample_rate is None:
        raise qp.QualisysParseError("Cannot determine sampling frequency")
    if hdr_rate and time_rate and abs(hdr_rate - time_rate) / hdr_rate > 0.01:
        warnings.append(
            f"FREQUENCY header ({hdr_rate:g} Hz) disagrees with Time column ({time_rate:.2f} Hz)"
        )
    times = pos.times
    if not np.all(np.isfinite(times)):
        times = (frames - frames[0]) / sample_rate + (frames[0] - 1) / sample_rate
        warnings.append("Time column missing/invalid; derived from frame numbers")
    declared = pos.metadata.get("NO_OF_FRAMES")
    if isinstance(declared, (int, float)) and int(declared) != len(frames):
        warnings.append(f"NO_OF_FRAMES={int(declared)} but {len(frames)} data rows found")

    valid_pos, reasons = val.position_validity(pos.values, config.ZERO_RUN_MIN_SAMPLES)
    unit = val.detect_position_unit(pos.values, valid_pos, config.DEFAULT_POSITION_UNIT)

    session = MotionSession(
        id=files.id,
        position_file=files.position.name,
        velocity_file=None,
        frames=frames,
        timestamps=times,
        marker_names=names,
        positions=pos.values,
        valid_positions=valid_pos,
        sample_rate=sample_rate,
        position_unit=unit,
        velocity_unit=f"{unit}/s",
        invalid_reasons=reasons,
        warnings=warnings,
    )

    if files.velocity is not None:
        try:
            _attach_velocity(session, files.velocity)
        except (qp.QualisysParseError, OSError) as e:
            session.warnings.append(f"Velocity file ignored: {e}")
    return session


def _attach_velocity(session: MotionSession, path: Path) -> None:
    vel = qp.parse_table(path)
    if vel.kind != "vel":
        raise qp.QualisysParseError(f"{path.name} does not contain velocity data")
    # Align by frame number and marker name (never by array position).
    if vel.marker_names != session.marker_names:
        common = [n for n in session.marker_names if n in vel.marker_names]
        if not common:
            raise qp.QualisysParseError("No marker names in common with position file")
        session.warnings.append("Velocity marker set differs from position marker set")
    F, M = session.frame_count, len(session.marker_names)
    aligned = np.full((F, M, 3), np.nan)
    row_of = {int(f): i for i, f in enumerate(vel.frames)}
    col_of = {n: i for i, n in enumerate(vel.marker_names)}
    rows = np.array([row_of.get(int(f), -1) for f in session.frames])
    have = rows >= 0
    if not have.all():
        session.warnings.append(f"{int((~have).sum())} position frames have no velocity row")
    for m, name in enumerate(session.marker_names):
        c = col_of.get(name)
        if c is not None:
            aligned[have, m, :] = vel.values[rows[have], c, :]
    if vel.non_numeric_cells:
        session.warnings.append(f"{vel.non_numeric_cells} non-numeric velocity cells treated as missing")

    # Velocity is usable only where finite AND the position sample is tracked.
    valid_vel = np.all(np.isfinite(aligned), axis=2) & session.valid_positions
    speed = np.full((F, M), np.nan)
    speed[valid_vel] = np.linalg.norm(aligned[valid_vel], axis=1)  # computed once

    session.velocity_file = path.name
    session.velocities = aligned
    session.valid_velocities = valid_vel
    session.speed = speed


def metadata_for(s: MotionSession) -> SessionMetadata:
    loss = []
    for m, name in enumerate(s.marker_names):
        bad = ~s.valid_positions[:, m]
        if bad.any():
            loss.append(
                TrackingLoss(
                    marker=name,
                    invalidSamples=int(bad.sum()),
                    ranges=val.contiguous_ranges(bad, s.frames),
                )
            )
    M = len(s.marker_names)
    return SessionMetadata(
        id=s.id,
        positionFile=s.position_file,
        velocityFile=s.velocity_file,
        hasVelocity=s.has_velocity,
        frameCount=s.frame_count,
        firstFrame=int(s.frames[0]),
        lastFrame=int(s.frames[-1]),
        sampleRate=s.sample_rate,
        duration=s.duration,
        markers=s.marker_names,
        positionUnit=s.position_unit,
        velocityUnit=s.velocity_unit,
        positionChannels=M * 3,
        velocityChannels=M * 3 if s.has_velocity else 0,
        missingSamples=int((~s.valid_positions).sum()),
        invalidReasons=s.invalid_reasons,
        trackingLoss=loss,
        warnings=s.warnings,
    )


def _r(a: np.ndarray, nd: int = 3) -> list:
    return np.round(np.nan_to_num(a, nan=0.0), nd).reshape(-1).tolist()


def payload_for(s: MotionSession) -> dict:
    """Compact JSON payload: flat row-major arrays, index = (frame*M + marker)*3 + axis.
    Positions/velocities are RAW (invalid samples are 0 where NaN); use the masks."""
    out = {
        "frames": s.frames.tolist(),
        "timestamps": np.round(s.timestamps, 5).tolist(),
        "markers": s.marker_names,
        "positions": _r(s.positions),
        "valid": s.valid_positions.astype(np.uint8).reshape(-1).tolist(),
        "velocities": None,
        "validVelocity": None,
        "speed": None,
    }
    if s.has_velocity:
        out["velocities"] = _r(s.velocities)
        out["validVelocity"] = s.valid_velocities.astype(np.uint8).reshape(-1).tolist()
        out["speed"] = _r(s.speed)
    return out


class SessionService:
    """Discovery + in-memory cache. Swap `_cache` for a better store later."""

    def __init__(self, data_dir: Path | None = None):
        self.data_dir = data_dir or config.DATA_DIR
        self._cache: dict[str, tuple[tuple, MotionSession]] = {}
        self._payloads: dict[str, tuple[tuple, bytes]] = {}
        self._summaries: dict[str, tuple[tuple, SessionSummary]] = {}
        self._lock = threading.RLock()

    def _files(self) -> dict[str, SessionFiles]:
        return discover_files(self.data_dir)

    def list_sessions(self) -> list[SessionSummary]:
        out = []
        for sid, f in self._files().items():
            sig = f.signature()
            with self._lock:
                hit = self._summaries.get(sid)
            if hit and hit[0] == sig:
                out.append(hit[1])
                continue
            base = dict(
                id=sid,
                positionFile=f.position.name,
                velocityFile=f.velocity.name if f.velocity else None,
                hasVelocity=f.velocity is not None,
            )
            try:
                h = qp.read_header(f.position)
                summ = SessionSummary(
                    **base,
                    frameCount=h["frames"],
                    markerCount=len(h["markers"]),
                    sampleRate=h["frequency"] or None,
                )
            except Exception as e:  # unreadable file must not hide other sessions
                log.warning("Cannot read %s: %s", f.position, e)
                summ = SessionSummary(**base, error=str(e))
            with self._lock:
                self._summaries[sid] = (sig, summ)
            out.append(summ)
        return out

    def get(self, session_id: str) -> MotionSession:
        files = self._files().get(session_id)
        if files is None:
            raise KeyError(session_id)
        sig = files.signature()
        with self._lock:
            hit = self._cache.get(session_id)
            if hit and hit[0] == sig:
                return hit[1]
            log.info("Parsing session %s", session_id)
            session = build_session(files)
            self._cache[session_id] = (sig, session)
            self._payloads.pop(session_id, None)
            return session

    def metadata(self, session_id: str) -> SessionMetadata:
        return metadata_for(self.get(session_id))

    def payload_json(self, session_id: str) -> bytes:
        import json

        session = self.get(session_id)
        with self._lock:
            sig = self._cache[session_id][0]
            hit = self._payloads.get(session_id)
            if hit and hit[0] == sig:
                return hit[1]
            body = json.dumps(payload_for(session), separators=(",", ":")).encode()
            self._payloads[session_id] = (sig, body)
            return body


_service: SessionService | None = None


def get_service() -> SessionService:
    global _service
    if _service is None:
        _service = SessionService()
    return _service
