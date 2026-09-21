"""Application configuration (environment-overridable)."""
from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = Path(os.environ.get("QREPLAY_DATA_DIR", PROJECT_ROOT / "data")).resolve()
SKELETON_CONFIG = Path(
    os.environ.get("QREPLAY_SKELETON", PROJECT_ROOT / "config" / "skeleton.json")
).resolve()

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "QREPLAY_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]

# Tracking-loss detection: a marker sample with X=Y=Z=0 exactly, sustained for at
# least this many consecutive samples, is treated as "not tracked".
ZERO_RUN_MIN_SAMPLES = int(os.environ.get("QREPLAY_ZERO_RUN_MIN", 3))

# Qualisys exports carry no unit fields. Positions are assumed to be millimetres
# (QTM default) unless the data extent suggests metres.
DEFAULT_POSITION_UNIT = "mm"

# Stateless upload endpoint (used on Vercel, where data/ is not deployed).
# Vercel Functions reject request bodies over 4.5 MB, so cap slightly below that.
MAX_UPLOAD_BYTES = int(os.environ.get("QREPLAY_MAX_UPLOAD_BYTES", 4_300_000))
