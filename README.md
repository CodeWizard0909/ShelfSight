# ShelfSight

**See your brand the way shoppers see it, on every quick-commerce app, in every Bengaluru pincode, in minutes.**

ShelfSight sends a swarm of [TinyFish](https://www.tinyfish.ai/) web agents into Blinkit, Zepto and Swiggy Instamart (BigBasket too, though its bot protection often blocks automated checks). Each agent sets a delivery pincode, searches your product, and reports back what's actually on the shelf: is it in stock, where does it rank, who's beating you at #1, and how deep is the discount.

Built in 6 hours at **Swim with TinyFish, Bangalore** (Ignite Room × TinyFish, 31 Oct 2026).

## The problem

Quick commerce now drives a large share of D2C sales in Indian metros, but every dark store has its own inventory. A brand can be in stock in HSR Layout and missing in Whitefield, and nobody on the brand team finds out until sales dip.

These apps have no public API, and results change with location. Today, someone on the brand team checks by hand: open the app, change the pincode, search, take a screenshot, and repeat for every platform and every area. That takes about 4 minutes per check, so 3 apps × 10 pincodes is 2 hours a day.

## What we found on day one (real scan, HSR Layout 560102)

- **Blinkit:** searching "yoga bar protein bar" shows **competitor RiteBite at #1**, above Yoga Bar's own products.
- **BigBasket:** Yoga Bar products are **discounted 40–57% below MRP**. That's margin leakage the brand may not know about.
- **BigBasket** blocks automated checks with bot protection (Akamai) after a location change. ShelfSight reports these honestly as "Blocked" and doesn't try to get around them.

## How it works

```
Brand + search term + pincodes
        │
        ▼
 Swarm orchestrator (FastAPI) ──► one TinyFish agent per (platform × pincode)
        │                          • stealth browser + India proxy
        │                          • sets location, searches, extracts
        │                          • typed result via output_schema
        ▼
 Live SSE stream ──► dashboard: agent board · Bengaluru map · alerts · shelf matrix
        │
        ▼
 Analysis: in stock / out of stock / not listed · rank · #1 competitor · discount
        │
        ▼
 Alerts ──► WhatsApp share
```

- **TinyFish Agent API (`/run-sse`)** streams every step the agent takes, so you watch the swarm work live.
- **`output_schema`** makes every platform return the same typed product list.
- **Stealth browser profile + India proxy** handle location-gated, JavaScript-heavy storefronts.
- **Cache + replay:** every successful run is recorded, so you can replay a full city scan instantly and only run live what's new.
- **Proof for every alert:** step screenshots pulled from the TinyFish Runs API, so every claim links to exactly what the agent saw.

**Stack:** TinyFish Agent API · Python 3.13, FastAPI, asyncio, httpx · Server-Sent Events · React 19, Vite, Tailwind CSS 4, Motion, Leaflet

## Run it

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # Windows
cp .env.example .env                            # add your TINYFISH_API_KEY
cd web && npm install && npm run build && cd ..
.venv\Scripts\python -m uvicorn main:app --app-dir backend --port 8000
```

Open http://localhost:8000, pick a brand, a search term, platforms and pincodes, then click **Deploy agents**. For frontend development, run `npm run dev` in `web/`; it proxies the API to port 8000.

Modes:
- **Auto:** replays cached cells and runs the rest live
- **Live:** every agent runs fresh
- **Replay:** recorded runs only

## Project layout

```
backend/
  main.py             API + SSE endpoint
  swarm.py            agent fan-out, concurrency, cache/replay
  tinyfish_client.py  TinyFish /run-sse client
  analysis.py         shelf status, alerts, scorecard
  config.py           platforms, pincodes, goal + output schema
  evidence.py         saves every agent step screenshot as proof
web/                  dashboard: React 19 + Vite + Tailwind CSS + Motion + Leaflet
frontend/             classic single-file dashboard (served at /classic)
scripts/seed.py       headless scan to pre-record runs
data/cache/           recorded agent runs
```

## What's next

- Scheduled city-wide scans via `/run-batch` (up to 100 agents per call) with results delivered by webhook, so brands get an alert the moment a pincode goes out of stock
- Browser Context Profiles that save each pincode's location, so agents skip the location step: fewer steps, lower cost per check
- More platforms (Flipkart Minutes, Amazon Fresh) and every Bengaluru pincode
- Scripted fast path (TinyFish Browser API + Playwright) with the AI agent as fallback: about 20 s instead of about 2 min per check, at a fraction of the cost
- For apps that block automation: read the brand's own seller-portal data through TinyFish Vault
- Competitor price tracking and share of shelf over time
