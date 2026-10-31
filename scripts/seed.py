"""Run a scan headless and print its events. Used to pre-record runs for the demo cache.

usage: python scripts/seed.py 560102,560034 [blinkit,zepto,bigbasket]
"""
import json
import sys

import httpx

BASE = "http://localhost:8000"
pins = sys.argv[1].split(",")
plats = sys.argv[2].split(",") if len(sys.argv) > 2 else ["blinkit", "zepto", "bigbasket"]

body = {"brand": "Yoga Bar", "keyword": "yoga bar protein bar", "platforms": plats, "pincodes": pins, "mode": "auto"}
job = httpx.post(f"{BASE}/api/scan", json=body).json()
print("job", job, flush=True)

with httpx.stream("GET", f"{BASE}/api/scan/{job['job_id']}/events", timeout=None) as r:
    for line in r.iter_lines():
        if not line.startswith("data:"):
            continue
        e = json.loads(line[5:])
        if e["type"] == "cell":
            c = e["cell"]
            print(f"CELL {e['task']}: {c['status']} rank={c.get('best_rank')} err={c.get('error')} alerts={len(e['alerts'])}", flush=True)
        elif e["type"] in ("progress", "started", "queued", "preview"):
            print(f"  {e['type']} {e.get('task')}: {e.get('text') or e.get('url') or e.get('run_id') or ''}", flush=True)
        else:
            print(e, flush=True)
