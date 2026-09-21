# Qualisys Replay

Browser-based 3D viewer that replays Qualisys (QTM) Position/Velocity Excel exports.
FastAPI parses and normalizes the Excel once; React + Three.js plays it back locally.

```
Excel (data/)  ->  FastAPI parser  ->  normalized session (NumPy, cached)
   ->  REST (one JSON payload)  ->  browser memory  ->  playback engine  ->  Three.js / uPlot
```

## Install

Requirements: Python 3.12+, Node 20+ (uv optional).

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # or: uv venv --python 3.12 && uv pip install -r requirements.txt
cd ../frontend && npm install
```

## Run

```bash
scripts/run_dev.sh          # starts both (creates venv / installs deps if missing)
```
Frontend http://localhost:5173 · API http://localhost:8000 · Swagger http://localhost:8000/docs

Two-terminal fallback:
```bash
cd backend  && source .venv/bin/activate && uvicorn app.main:app --reload
cd frontend && npm run dev
```

## Data

Put `<name>_Pos.xlsx` (required) and `<name>_Vel.xlsx` (optional) in `data/`. Sessions are
discovered by filename on every `GET /api/sessions` (use **Rescan** in the UI). Nothing is hardcoded.
Env overrides: `QREPLAY_DATA_DIR`, `QREPLAY_SKELETON`, `QREPLAY_CORS_ORIGINS`, `QREPLAY_ZERO_RUN_MIN`.
Frontend API URL: `VITE_API_URL` (default `http://localhost:8000`).

### Detected Qualisys layout (test1)
Single sheet. Rows 1-6 metadata (`NO_OF_FRAMES`, `NO_OF_DATA_TYPES`, `FREQUENCY`, `TIME_STAMP`,
`DATA_INCLUDED`, `DATA_TYPES`), blank row, header `Frame, Time, <marker>_pos_X/Y/Z ...`
(`_vel_` in the velocity file), then one row per frame. No unit fields: **mm and mm/s are assumed**
(heuristic: extents < 20 => metres). Marker names may carry trailing spaces (`ankle r `) - trimmed.
Pos and Vel are aligned by frame number and marker name, not array position.

test1: 1205 frames (122-1326), 300 Hz, 4.013 s, 23 markers, 69 pos + 69 vel channels,
Time = (Frame-1)/300. Marker `st` is exactly (0,0,0) for frames 841-1326 (486 samples).

## Data integrity layers
1. **Raw** - values exactly as in Excel (blank/non-numeric -> NaN). Never modified.
2. **Normalized** - `positions[F,M,3]`, `velocities[F,M,3]`, `valid_positions[F,M]`, `speed[F,M]`
   (computed once). A sample is invalid if non-finite, or X=Y=Z=0 exactly for >= 3 consecutive samples.
   Velocity is valid only where finite *and* position is valid. No interpolation.
3. **Visualization** - scale (1 mm = 0.001 units), axis mapping, vector horizon; display only.

Invalid samples: marker, label, velocity vector and adjacent skeleton segments are hidden, trails break,
charts show gaps. Coordinate mapping (Z-up -> Y-up) lives only in `frontend/src/lib/coords.ts`.

## Layout
`backend/app/services/` (`qualisys_parser`, `validation`, `session_service`) · `backend/app/api/` ·
`frontend/src/lib/playback.ts` (engine) · `frontend/src/components/Scene3D/` · `config/skeleton.json`.

## Tests
```bash
cd backend && .venv/bin/python -m pytest      # includes integration test on data/test1_*.xlsx
cd frontend && npm test && npm run typecheck
```

## Keys
Space play/pause · <-/-> step · Shift+<-/-> jump 0.5 s · Home/End · R reset camera · F fit · T trails · V velocity vectors · S skeleton

## Known limitations
- Units are assumed (not stored in the export). Velocity horizon is in seconds of prediction.
- Whole session is sent as JSON (~1.6 MB, ~0.6 MB gzipped for 4 s); long recordings would need binary/chunked transfer.
- Loading stages shown in the UI reflect request phases; the server gives no fine-grained parse progress.
- Skeleton lines are 1 px WebGL lines. Skeleton marker meanings (`sc`, `st`, `H 1/5`) are inferred from names.
- The `.mp4` files in `data/` are ignored (future synchronized video).

## Phase 2 ideas
C3D import, QTM real-time streaming over WebSocket, acceleration/joint angles, filtering, CSV/PNG/MP4 export,
multi-session overlay/comparison, event annotations, video sync, binary transport, auth/deployment.
