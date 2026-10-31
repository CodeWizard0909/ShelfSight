"""Fan out one TinyFish agent per (platform, pincode), stream their events, cache results."""
import asyncio
import json
import os
import re
import time
import uuid
from pathlib import Path

from analysis import alerts_for, analyse_cell, is_blocked, scorecard
from config import OUTPUT_SCHEMA, PLATFORMS, build_goal, search_url
from evidence import save_evidence
from tinyfish_client import fetch_run_result, run_sse

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CONCURRENCY = int(os.environ.get("SWARM_CONCURRENCY", "2"))
REPLAY_STEP_SECONDS = float(os.environ.get("REPLAY_STEP_SECONDS", "0.7"))

JOBS: dict[str, "Job"] = {}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def cache_path(platform: str, pincode: str, keyword: str) -> Path:
    return CACHE_DIR / f"{platform}__{pincode}__{_slug(keyword)}.json"


class Job:
    def __init__(self, brand: str, keyword: str, platforms: list[str], pincodes: list[str], mode: str):
        self.id = uuid.uuid4().hex[:8]
        self.brand, self.keyword, self.mode = brand, keyword, mode
        self.tasks = [(p, z) for z in pincodes for p in platforms]
        self.events: list[dict] = []
        self.cells: list[dict] = []
        self.done = False
        self._cond = asyncio.Condition()
        self.started = time.time()

    async def emit(self, event: dict):
        async with self._cond:
            event["seq"] = len(self.events)
            self.events.append(event)
            self._cond.notify_all()

    async def stream(self, start: int = 0):
        i = start
        while True:
            async with self._cond:
                while i >= len(self.events) and not self.done:
                    await self._cond.wait()
                batch = self.events[i:]
                finished = self.done
            for e in batch:
                yield e
            i += len(batch)
            if finished and i >= len(self.events):
                return


async def _run_live(job: Job, platform: str, pincode: str) -> tuple[dict | None, str | None]:
    tid = f"{platform}:{pincode}"
    log, result, error, t0, run_id = [], None, None, time.time(), None
    try:
        async for ev in run_sse(search_url(platform, job.keyword), build_goal(platform, pincode, job.keyword), OUTPUT_SCHEMA,
                                max_seconds=PLATFORMS[platform]["max_seconds"]):
            etype = ev.get("type")
            if etype == "PROGRESS":
                msg = ev.get("purpose") or ""
                log.append(msg)
                await job.emit({"type": "progress", "task": tid, "text": msg})
            elif etype == "STARTED":
                run_id = ev.get("run_id")
                await job.emit({"type": "started", "task": tid, "run_id": ev.get("run_id")})
            elif etype == "COMPLETE":
                if ev.get("status") not in (None, "COMPLETED"):
                    error = f"Run {ev.get('status')}: {ev.get('error') or ''}".strip()
                result = ev.get("result")
            elif ev.get("streaming_url"):
                await job.emit({"type": "preview", "task": tid, "url": ev["streaming_url"]})
    except Exception as e:  # network / API failure becomes a red cell, not a crash
        error = str(e)

    # The SSE stream can drop before COMPLETE arrives; the run keeps going on TinyFish, so fetch its result
    if run_id and result is None and (error is None or "CANCELLED" not in error):
        await job.emit({"type": "progress", "task": tid, "text": "stream dropped; fetching the finished run"})
        result, error = await fetch_run_result(run_id)

    return await record_run(platform, pincode, job.keyword, result, error, log, round(time.time() - t0), run_id)


async def record_run(platform, pincode, keyword, result, error, log, seconds, run_id) -> tuple[dict | None, str | None]:
    """Classify a finished run, record it for replay, and save its screenshots."""
    if isinstance(result, dict) and result.get("blocked") and not error:
        error = "Blocked by the site's bot protection"
    if isinstance(result, dict) and not error and not result.get("products"):
        error = "No products returned: the agent ran out of time or was stopped"
    if isinstance(result, dict) and result.get("location_set") is False and not error:
        error = "Couldn't set the delivery location, so results aren't area-specific"
    products = (result or {}).get("products") if isinstance(result, dict) else None
    # Record real shelves and blocked outcomes (so replays stay honest and don't re-spend); skip transient errors
    if (result is not None and not error and products) or is_blocked(error):
        cache_path(platform, pincode, keyword).write_text(
            json.dumps({"result": result, "error": error, "log": log, "seconds": seconds, "run_id": run_id}, indent=2),
            encoding="utf-8",
        )
    if run_id:
        try:
            await save_evidence(run_id, platform, pincode, _slug(keyword))
        except Exception:  # evidence is a bonus; never fail the cell over it
            pass
    return result, error


async def _run_replay(job: Job, platform: str, pincode: str) -> tuple[dict | None, str | None]:
    tid = f"{platform}:{pincode}"
    data = json.loads(cache_path(platform, pincode, job.keyword).read_text(encoding="utf-8"))
    await job.emit({"type": "started", "task": tid, "replay": True})
    log = data.get("log", [])
    step = min(REPLAY_STEP_SECONDS, 10 / max(len(log), 1))  # long runs replay in ~10s
    for msg in log:
        await asyncio.sleep(step)
        await job.emit({"type": "progress", "task": tid, "text": msg})
    return data.get("result"), data.get("error")


async def _run_task(job: Job, sem: asyncio.Semaphore, platform: str, pincode: str):
    tid = f"{platform}:{pincode}"
    cached = cache_path(platform, pincode, job.keyword).exists()
    use_cache = job.mode == "replay" or (job.mode == "auto" and cached)
    if use_cache and not cached:
        await job.emit({"type": "skipped", "task": tid, "text": "No cached run"})
        return

    if use_cache:
        result, error = await _run_replay(job, platform, pincode)
    else:
        await job.emit({"type": "queued", "task": tid})
        async with sem:
            result, error = await _run_live(job, platform, pincode)
            if error and "CANCELLED" not in error and not is_blocked(error):  # one retry for transient failures only
                await job.emit({"type": "progress", "task": tid, "text": f"retrying after: {error[:80]}"})
                result, error = await _run_live(job, platform, pincode)

    cell = analyse_cell(job.brand, platform, pincode, result, error)
    job.cells.append(cell)
    await job.emit({"type": "cell", "task": tid, "cell": cell, "alerts": alerts_for(job.brand, cell)})
    await job.emit({"type": "score", "score": scorecard(job.cells)})


async def run_job(job: Job):
    sem = asyncio.Semaphore(CONCURRENCY)
    await job.emit({"type": "job", "tasks": [f"{p}:{z}" for p, z in job.tasks], "mode": job.mode})
    await asyncio.gather(*(_run_task(job, sem, p, z) for p, z in job.tasks))
    await job.emit({"type": "done", "seconds": round(time.time() - job.started)})
    async with job._cond:
        job.done = True
        job._cond.notify_all()
