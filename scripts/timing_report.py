"""Where does agent time go? Per platform: wall time, steps, and the slowest kinds of step."""
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

EV = Path(__file__).resolve().parent.parent / "data" / "evidence"


def secs(d):
    m = re.match(r"([\d.]+)s", d or "")
    return float(m[1]) if m else 0.0


def bucket(action: str) -> str:
    a = action.lower()
    for key, words in {
        "waiting / page load": ["wait", "load", "loaded", "check if", "check current", "page state", "understand"],
        "location": ["location", "pincode", "suggestion", "address"],
        "search": ["search", "type", "query", "focus", "view all", "results page"],
        "extract": ["extract", "return", "submit", "read"],
        "popups / scroll": ["dismiss", "close", "popup", "scroll", "banner"],
    }.items():
        if any(w in a for w in words):
            return key
    return "other"


per_platform = defaultdict(list)
for d in sorted(EV.iterdir()):
    meta = json.loads((d / "steps.json").read_text(encoding="utf-8"))
    platform = d.name.split("__")[0]
    steps = meta["steps"]
    ts = [datetime.fromisoformat(s["timestamp"].replace("Z", "+00:00")) for s in steps if s.get("timestamp")]
    wall = (ts[-1] - ts[0]).total_seconds() if len(ts) > 1 else 0
    gaps = [(ts[i + 1] - ts[i]).total_seconds() for i in range(len(ts) - 1)]
    exec_time = sum(secs(s.get("duration")) for s in steps)
    by = defaultdict(float)
    for i, s in enumerate(steps[:-1]):
        by[bucket(s["action"] or "")] += gaps[i] if i < len(gaps) else 0
    per_platform[platform].append((d.name.split("__")[1], len(steps), wall, exec_time, dict(by)))

for p, runs in per_platform.items():
    print(f"\n== {p} ==")
    tot = defaultdict(float)
    for z, n, wall, ex, by in runs:
        print(f"  {z}: {n:3d} steps  wall {wall:6.0f}s  browser-action {ex:5.0f}s  thinking/other {wall - ex:6.0f}s  avg/step {wall / max(n - 1, 1):4.1f}s")
        for k, v in by.items():
            tot[k] += v
    total = sum(tot.values()) or 1
    print("  time share:", ", ".join(f"{k} {100 * v / total:.0f}%" for k, v in sorted(tot.items(), key=lambda x: -x[1])))
