"""Thin async client for the TinyFish Agent API (/run-sse)."""
import asyncio
import json
import os
from typing import AsyncIterator

import httpx

API_BASE = "https://agent.tinyfish.ai/v1/automation"


async def run_sse(url: str, goal: str, output_schema: dict | None = None, max_seconds: int | None = None) -> AsyncIterator[dict]:
    """Start an agent run and yield each SSE event as a dict (STARTED, PROGRESS, COMPLETE, ...)."""
    body = {
        "url": url,
        "goal": goal,
        "browser_profile": "stealth",
        "proxy_config": {"enabled": True, "country_code": "IN"},
    }
    if max_seconds:  # hard cap so a looping agent can't burn credits
        body["agent_config"] = {"max_duration_seconds": max_seconds}
    if output_schema:
        body["output_schema"] = output_schema
    headers = {"X-API-Key": os.environ["TINYFISH_API_KEY"], "Accept": "text/event-stream"}

    timeout = httpx.Timeout(connect=30, read=600, write=30, pool=30)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", f"{API_BASE}/run-sse", json=body, headers=headers) as resp:
            if resp.status_code >= 400:
                text = (await resp.aread()).decode(errors="replace")
                raise RuntimeError(f"TinyFish {resp.status_code}: {text[:300]}")
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if not payload:
                    continue
                try:
                    yield json.loads(payload)
                except json.JSONDecodeError:
                    continue


async def fetch_run_result(run_id: str, wait_seconds: int = 420) -> tuple[dict | None, str | None]:
    """Poll GET /v1/runs/{id} until the run finishes; returns (result, error)."""
    headers = {"X-API-Key": os.environ["TINYFISH_API_KEY"]}
    async with httpx.AsyncClient(timeout=30) as client:
        for _ in range(wait_seconds // 10):
            try:
                run = (await client.get(f"https://agent.tinyfish.ai/v1/runs/{run_id}", headers=headers)).json()
            except Exception:
                await asyncio.sleep(10)
                continue
            status = run.get("status")
            if status == "COMPLETED":
                return run.get("result"), None
            if status in ("FAILED", "CANCELLED"):
                return run.get("result"), f"Run {status}: {run.get('error') or ''}".strip()
            await asyncio.sleep(10)
    return None, "Run still unfinished after waiting"
