"""Fetch step screenshots for runs recorded before evidence capture existed.

usage: python scripts/backfill_evidence.py <seed log> [<seed log> ...]
Reads lines like "  started blinkit:560034: <run_id>" printed by scripts/seed.py.
"""
import asyncio
import json
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
load_dotenv(ROOT / ".env")

from evidence import evidence_dir, save_evidence  # noqa: E402
from swarm import _slug, cache_path  # noqa: E402

KEYWORD = "yoga bar protein bar"
LINE = re.compile(r"started (\w+):(\d{6}): ([0-9a-f-]{36})")


async def main():
    runs = {}
    for log in sys.argv[1:]:
        for m in LINE.finditer(Path(log).read_text(encoding="utf-8", errors="replace")):
            runs[(m[1], m[2])] = m[3]  # later lines win (retries)

    for (platform, pincode), run_id in runs.items():
        cache = cache_path(platform, pincode, KEYWORD)
        if not cache.exists():
            print(f"skip {platform}:{pincode} (not finished)")
            continue
        if (evidence_dir(platform, pincode, _slug(KEYWORD)) / "steps.json").exists():
            print(f"have {platform}:{pincode}")
            continue
        n = await save_evidence(run_id, platform, pincode, _slug(KEYWORD))
        data = json.loads(cache.read_text(encoding="utf-8"))
        data["run_id"] = run_id
        cache.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"saved {platform}:{pincode} -> {n} screenshots")


asyncio.run(main())
