from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Response, UploadFile

from .. import config
from ..services import session_service as ss

router = APIRouter(prefix="/api", tags=["upload"])


def _session_id(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"_(pos|vel)$", "", stem, flags=re.IGNORECASE)
    return re.sub(r"[^A-Za-z0-9._-]", "_", stem) or "upload"


def _read_limited(f: UploadFile, budget: int) -> bytes:
    body = f.file.read(budget + 1)
    if len(body) > budget:
        raise HTTPException(
            413, f"Upload too large (limit {config.MAX_UPLOAD_BYTES / 1e6:.1f} MB for both files together)"
        )
    return body


@router.post("/parse")
def parse_upload(position: UploadFile = File(...), velocity: UploadFile | None = File(None)):
    """Stateless: parse uploaded Qualisys Pos (+ optional Vel) workbooks and return the
    normalized session in one response. Nothing is stored or cached server-side."""
    pos_bytes = _read_limited(position, config.MAX_UPLOAD_BYTES)
    vel_bytes = None
    if velocity is not None and velocity.filename:
        vel_bytes = _read_limited(velocity, config.MAX_UPLOAD_BYTES - len(pos_bytes))

    sid = _session_id(position.filename or "upload")
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        (tmpdir / f"{sid}_Pos.xlsx").write_bytes(pos_bytes)
        if vel_bytes:
            (tmpdir / f"{sid}_Vel.xlsx").write_bytes(vel_bytes)
        try:
            session = ss.build_session(ss.discover_files(tmpdir)[sid])
        except Exception as e:  # unreadable/unsupported workbook -> client error, not 500
            raise HTTPException(422, f"Cannot read Qualisys export: {e}")

    body = json.dumps(
        {"meta": ss.metadata_for(session).model_dump(), "data": ss.payload_for(session)},
        separators=(",", ":"),
    )
    return Response(content=body, media_type="application/json")
