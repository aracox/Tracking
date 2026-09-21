from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import config
from .api import data, sessions, upload

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Qualisys Replay API", version="0.1.0")
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(sessions.router)
app.include_router(data.router)
app.include_router(upload.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "dataDir": str(config.DATA_DIR)}
