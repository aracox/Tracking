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

## Deploy to Vercel (frontend + API in one project)

`vercel.json` builds the Vite app (`frontend/dist`) and serves FastAPI as a Python function at `/api/*`
(`api/index.py` -> `backend/app`, deps from root `requirements.txt`). Import the repo in Vercel with the
default settings (Root Directory = repo root); no environment variables are required.

`data/` is not deployed, so on Vercel use **Open files** in the left panel: pick `*_Pos.xlsx` (and optionally
`*_Vel.xlsx`). The browser posts them to `POST /api/parse`, which parses in memory and returns the session; nothing
is stored on the server, and playback then runs locally as usual.

Vercel limits: request body 4.5 MB (both files together; server cap `QREPLAY_MAX_UPLOAD_BYTES`, default 4.3 MB) and
response body 4.5 MB (test1 = 1.6 MB, roughly 1 MB per 2.5 s of 23-marker Pos+Vel data). Longer recordings need a
binary/compact payload or storage (e.g. Vercel Blob) - see limitations. Not deployed/verified on Vercel from this
machine; verified by importing `api/index.py` without `data/` and uploading the real test1 files.

## Data integrity layers
1. **Raw** - values exactly as in Excel (blank/non-numeric -> NaN). Never modified.
2. **Normalized** - `positions[F,M,3]`, `velocities[F,M,3]`, `valid_positions[F,M]`, `speed[F,M]`
   (computed once). A sample is invalid if non-finite, or X=Y=Z=0 exactly for >= 3 consecutive samples.
   Velocity is valid only where finite *and* position is valid. No interpolation.
3. **Visualization** - scale (1 mm = 0.001 units), axis mapping, vector horizon; display only.

Invalid samples: marker, label, velocity vector and adjacent skeleton segments are hidden, trails break,
charts show gaps. Coordinate mapping (Z-up -> Y-up) lives only in `frontend/src/lib/coords.ts`.

## 2D video overlay

If a session has a camera video (`<id>_Oqus_<camera>_<serial>.mp4`, the Qualisys/QTM export naming — auto-detected
next to the Pos/Vel files in `data/` for local dev, or picked in **Open files**), the header shows a **2D overlay**
view alongside **3D**. It flattens the tracked markers/skeleton onto one plane (Front/Side/Top) and draws them over
the video.

**There is no camera calibration in the Pos/Vel Excel export** (no intrinsics/extrinsics), so this is a manual,
eyeballed alignment, not a calibrated projection: drag the view to pan, scroll to zoom, plus Mirror X/Y, Rotation
and an **Auto-fit** button (fits the whole session's extent; picks a sensible default on load).

Sync default: the video plays at `mocap Time column value + offset` (offset defaults to 0), assuming the video's
own 0-based timeline starts at the same instant as the mocap capture. For test1 this holds almost exactly — the
video's duration (4.4166 s) matches the mocap's last `Time` value (4.4167 s) — even though the exported Position
table only starts at frame 122 (`Time` = 0.403 s), i.e. partway into that shared timeline. If a future dataset's
video and mocap don't share a start this way, use the **Video sync** offset slider (seconds) to nudge it by eye.
**Layers** lets you show/hide and set opacity for the video and tracking independently. All of this is
display-only and never touches source data (see integrity layers below).

**Seekable video copy.** Oqus camera exports are often near all-P-frame with very sparse keyframes (test1's had
just 3 for the whole 4.4 s clip), which makes `<video>.currentTime` seeks slow/imprecise in the browser — playback
can visibly lag or show the wrong pose. Drop a re-encoded copy named `<id>_Oqus_<camera>_<serial>_seekable.mp4`
next to the original and it's served instead (raw export is never modified):
```bash
ffmpeg -i test1_Oqus_9_18012.mp4 -c:v libx264 -crf 20 -g 1 -pix_fmt yuv420p -an \
       test1_Oqus_9_18012_seekable.mp4
```
(`-g 1`: a keyframe every frame. `-an`: drop audio, unused here. Bumps file size but not resolution/fps/duration.)

The uploaded video never reaches the API — the browser reads it directly (`URL.createObjectURL`), so it isn't
subject to Vercel's request-size limits either.

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
- 2D video overlay has no camera calibration, so alignment is manual/eyeballed (see above), not pixel-accurate.
- Video-to-mocap sync is a manual offset slider; there's no shared timecode/hardware sync signal in the exports.

## Phase 2 ideas
C3D import, QTM real-time streaming over WebSocket, camera calibration import for a true projected overlay,
acceleration/joint angles, filtering, CSV/PNG/MP4 export, multi-session overlay/comparison, event annotations,
binary transport, auth/deployment.
