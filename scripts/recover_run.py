"""Record a run that finished on TinyFish but whose live stream dropped (no extra agent cost).

usage: python scripts/recover_run.py <platform> <pincode> <run_id>
"""
import asyncio
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
load_dotenv(ROOT / ".env")

from swarm import record_run  # noqa: E402
from tinyfish_client import fetch_run_result  # noqa: E402

KEYWORD = "yoga bar protein bar"


async def main(platform: str, pincode: str, run_id: str):
    result, error = await fetch_run_result(run_id, wait_seconds=30)
    run = httpx.get(f"https://agent.tinyfish.ai/v1/runs/{run_id}", headers={"X-API-Key": os.environ["TINYFISH_API_KEY"]}, timeout=30).json()
    log = [s.get("action") for s in run.get("steps") or []]
    result, error = await record_run(platform, pincode, KEYWORD, result, error, log, None, run_id)
    print(platform, pincode, "error:", error, "| products:", len((result or {}).get("products") or []), "| steps:", len(log))


asyncio.run(main(*sys.argv[1:4]))
