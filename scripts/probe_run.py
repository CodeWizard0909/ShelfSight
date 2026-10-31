"""Inspect a finished run's shape (keys, steps, screenshot fields) without dumping images."""
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
run_id, mode = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "url"
r = httpx.get(
    f"https://agent.tinyfish.ai/v1/runs/{run_id}",
    params={"screenshots": mode},
    headers={"X-API-Key": os.environ["TINYFISH_API_KEY"]},
    timeout=60,
)
print("status", r.status_code)
d = r.json()


def shrink(x):
    if isinstance(x, str) and len(x) > 120:
        return x[:120] + f"...({len(x)} chars)"
    if isinstance(x, dict):
        return {k: shrink(v) for k, v in x.items()}
    if isinstance(x, list):
        return [shrink(v) for v in x[:3]] + ([f"...{len(x)} items"] if len(x) > 3 else [])
    return x


print(json.dumps(shrink(d), indent=1)[:4000])
