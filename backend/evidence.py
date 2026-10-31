"""Pull every step screenshot of a finished run so each alert can show what the agent actually saw."""
import base64
import json
import os
from pathlib import Path

import httpx

EVIDENCE_DIR = Path(__file__).resolve().parent.parent / "data" / "evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)


def evidence_dir(platform: str, pincode: str, slug: str) -> Path:
    return EVIDENCE_DIR / f"{platform}__{pincode}__{slug}"


async def save_evidence(run_id: str, platform: str, pincode: str, slug: str) -> int:
    """Download step screenshots for run_id; returns how many were saved."""
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.get(
            f"https://agent.tinyfish.ai/v1/runs/{run_id}",
            params={"screenshots": "base64"},
            headers={"X-API-Key": os.environ["TINYFISH_API_KEY"]},
        )
        r.raise_for_status()
        run = r.json()

    out = evidence_dir(platform, pincode, slug)
    out.mkdir(parents=True, exist_ok=True)
    steps = []
    for i, s in enumerate(run.get("steps") or []):
        shot = s.get("screenshot") or ""
        img = None
        if shot.startswith("data:image"):
            img = f"step-{i:02d}.jpg"
            (out / img).write_bytes(base64.b64decode(shot.split(",", 1)[1]))
        steps.append({"action": s.get("action"), "timestamp": s.get("timestamp"), "duration": s.get("duration"), "image": img})

    meta = {"run_id": run_id, "num_of_steps": run.get("num_of_steps"), "finished_at": run.get("finished_at"), "steps": steps}
    (out / "steps.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return sum(1 for s in steps if s["image"])
