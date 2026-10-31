"""ShelfSight API: start a swarm, stream its events to the dashboard."""
import asyncio
import json
import os
from pathlib import Path

import httpx

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from config import PINCODES, PLATFORMS  # noqa: E402
from evidence import EVIDENCE_DIR, evidence_dir  # noqa: E402
from swarm import JOBS, Job, _slug, cache_path, run_job  # noqa: E402

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
MAX_LIVE_AGENTS = int(os.environ.get("MAX_LIVE_AGENTS", "6"))
app = FastAPI(title="ShelfSight")


class ScanRequest(BaseModel):
    brand: str
    keyword: str
    platforms: list[str]
    pincodes: list[str]
    mode: str = "auto"  # auto = replay cached cells, run the rest live; live; replay


@app.get("/api/config")
def get_config():
    return {
        "platforms": PLATFORMS,
        "pincodes": {k: {"area": a, "lat": lat, "lng": lng} for k, (a, lat, lng) in PINCODES.items()},
    }


@app.get("/api/wallet")
async def wallet():
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get("https://agent.tinyfish.ai/v1/wallet", headers={"X-API-Key": os.environ["TINYFISH_API_KEY"]})
    if r.status_code != 200:
        raise HTTPException(502, "Wallet unavailable")
    return {"balance": float(r.json()["available_balance"]), "max_live": MAX_LIVE_AGENTS}


@app.get("/api/cached")
def cached(keyword: str):
    return [
        f"{p}:{z}" for p in PLATFORMS for z in PINCODES if cache_path(p, z, keyword).exists()
    ]


@app.post("/api/scan")
async def scan(req: ScanRequest):
    if req.mode not in ("auto", "live", "replay"):
        raise HTTPException(400, "mode must be auto, live or replay")
    bad = [p for p in req.platforms if p not in PLATFORMS] + [z for z in req.pincodes if z not in PINCODES]
    if bad:
        raise HTTPException(400, f"Unknown platform/pincode: {bad}")
    live = sum(
        1 for z in req.pincodes for p in req.platforms
        if req.mode == "live" or (req.mode == "auto" and not cache_path(p, z, req.keyword).exists())
    )
    if live > MAX_LIVE_AGENTS:
        raise HTTPException(400, f"This scan would start {live} live agents; the limit is {MAX_LIVE_AGENTS} to protect credits.")
    job = Job(req.brand, req.keyword, req.platforms, req.pincodes, req.mode)
    JOBS[job.id] = job
    asyncio.create_task(run_job(job))
    return {"job_id": job.id, "tasks": len(job.tasks)}


@app.get("/api/scan/{job_id}/events")
async def events(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")

    async def gen():
        async for e in job.stream():
            yield f"data: {json.dumps(e)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/api/evidence/{platform}/{pincode}")
def evidence(platform: str, pincode: str, keyword: str):
    meta = evidence_dir(platform, pincode, _slug(keyword)) / "steps.json"
    if not meta.exists():
        raise HTTPException(404, "No evidence for this cell")
    data = json.loads(meta.read_text(encoding="utf-8"))
    base = f"/evidence/{platform}__{pincode}__{_slug(keyword)}"
    for s in data["steps"]:
        s["url"] = f"{base}/{s['image']}" if s["image"] else None
    return data


@app.get("/classic")
def classic():
    return FileResponse(FRONTEND / "index.html")


app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
app.mount("/evidence", StaticFiles(directory=EVIDENCE_DIR), name="evidence")

# React dashboard (web/, built with `npm run build`); falls back to the classic page if not built
if (WEB_DIST / "index.html").exists():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
else:
    @app.get("/")
    def index():
        return FileResponse(FRONTEND / "index.html")
