from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.staticfiles import StaticFiles

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

# Serves session camera video (e.g. "<id>_Oqus_9_18012.mp4") with Range support for
# scrubbing. Local dev only: data/ is not deployed on Vercel (excluded via
# .vercelignore, and vercel.json doesn't route /media to this function anyway), so
# there the frontend falls back to a client-side <video> from an uploaded file.
if config.DATA_DIR.is_dir():
    app.mount("/media", StaticFiles(directory=config.DATA_DIR), name="media")


@app.get("/api/health")
def health():
    return {"status": "ok", "dataDir": str(config.DATA_DIR)}
