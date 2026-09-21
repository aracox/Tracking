from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..models.session import SessionMetadata, SessionSummary
from ..services.qualisys_parser import QualisysParseError
from ..services.session_service import get_service

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionSummary])
def list_sessions():
    return get_service().list_sessions()


@router.get("/{session_id}", response_model=SessionMetadata)
def session_metadata(session_id: str):
    try:
        return get_service().metadata(session_id)
    except KeyError:
        raise HTTPException(404, f"Unknown session '{session_id}'")
    except QualisysParseError as e:
        raise HTTPException(422, str(e))
