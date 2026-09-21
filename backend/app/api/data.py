from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Response

from .. import config
from ..services.qualisys_parser import QualisysParseError
from ..services.session_service import get_service

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/sessions/{session_id}/data")
def session_data(session_id: str):
    """Whole normalized session in one response (browser plays it back locally)."""
    try:
        body = get_service().payload_json(session_id)
    except KeyError:
        raise HTTPException(404, f"Unknown session '{session_id}'")
    except QualisysParseError as e:
        raise HTTPException(422, str(e))
    return Response(content=body, media_type="application/json")


@router.get("/skeleton")
def skeleton():
    """Visualization-only skeleton connectivity (config/skeleton.json)."""
    try:
        return json.loads(config.SKELETON_CONFIG.read_text())
    except FileNotFoundError:
        return {"connections": []}
