# ShelfSight: submission pack

## PPT (8 slides)

**1. ShelfSight**
See your brand the way shoppers see it, on every quick-commerce app, in every pincode.
Swarms of TinyFish web agents · Swim with TinyFish Bangalore · [team names]

**2. The problem**
- Quick commerce is now the fastest-growing sales channel for Indian D2C brands, and Bengaluru is its capital.
- Every dark store has its own stock. You can be live in HSR and missing in Whitefield.
- These apps have no API, and results depend on location. Brands find out about a stockout only when sales drop.
- Today it's done by hand: 3 apps × 10 pincodes × ~4 min = **2 hours a day**, and it's out of date by lunch.

**3. What our agents found today (real scan, Yoga Bar, HSR Layout)**
- Blinkit: searching for *Yoga Bar*, the **#1 result is competitor RiteBite**.
- BigBasket: Yoga Bar is **discounted 40–57% below MRP**.
- BigBasket, Bellandur: competitor **Upnourish by Pluckk ranks #1** above Yoga Bar
- Overall: 18 shelves checked across 6 areas. Yoga Bar is in stock everywhere, but loses #1 on Blinkit in 3 of 6 areas

**4. How it works** (use the README diagram)
Brand + search term + pincodes → one TinyFish agent per platform × pincode → each agent sets the location, searches and extracts typed data → live dashboard → alerts.

**5. Built on TinyFish**
- Agent API `/run-sse`: live step stream for every agent
- Live browser preview, embedded so you can watch any agent's real browser
- `output_schema`: the same typed product list from 3 very different sites
- Stealth browser profile + India proxy for location-gated, JavaScript-heavy apps
- Cache + replay: record once, replay instantly, re-run live only what's stale
- Goals written to the TinyFish Goal Prompting Guide: numbered steps, guardrails, edge cases, stop condition
- Concurrency-aware swarm: semaphore sized to the account's browser limit, automatic retry, and one failed agent never sinks the batch

**6. What was hard (and how we fixed it)**
- Agents took 5–9 steps on Blinkit and 8–10 on Zepto, but **14–72 on BigBasket, and 2 runs timed out**.
- We measured every run: ~13 s per step on every platform, so **step count drives latency**.
- The agents' own screenshots showed the root cause: after a location change, **BigBasket's bot protection (Akamai) silently blocks the product data**. The page shows grey placeholder cards, then "Access Denied". The agent kept waiting and reloading for minutes.
- Fix 1: rewrote the goal to the TinyFish Goal Prompting Guide (numbered steps, guardrails, edge cases, stop condition). **Both timed-out cells then succeeded.**
- Fix 2 (tried, didn't work): asking the agent in the goal to "stop if blocked". It kept looping anyway. Lesson: **prompts guide an agent, but hard limits have to live in code.**
- Fix 3 (works): **hard time caps per platform** (`max_duration_seconds`, set from our measured runs), **no auto-retry on blocked or capped runs**, and **at most 6 live agents per scan**, with the wallet balance shown before you deploy.
- Honest data: blocked checks show as **"Blocked"** on the map and are left out of the scores, never shown as a fake result. When an agent can't set the pincode, we reject its results rather than report another area's shelf.
- We respect bot protection rather than fight it. The production path for protected apps is the brand's own seller account through TinyFish Vault.

**7. Impact**
- 18 shelf checks replayed in ~20 s vs ~72 min by hand (4 min per check)
- Availability %, #1-rank share and discount leakage, by pincode
- Who pays: D2C brand managers, category teams, distributors. Digital-shelf analytics is an existing paid category, and quick commerce isn't covered.

**8. What's next**
Scripted fast path (Browser API + Playwright) with the agent as fallback · Brand's own seller-portal data via TinyFish Vault for apps that block bots · Scheduled scans via `/run-batch` + webhooks · Browser Context Profiles per pincode (skip the location step, cut cost per check) · Flipkart Minutes, Amazon Fresh · all of Bengaluru, then other metros · share-of-shelf trends.

---

## Demo video script (≈2 min)

0:00–0:15. Hook. "If you're a D2C brand, you don't know if you're in stock on Zepto in Whitefield right now. Nobody does. ShelfSight finds out in minutes."
0:15–0:35. Enter brand *Yoga Bar*, search term, pick 3 platforms × 6 pincodes, click **Deploy agents**. The agent board fills up.
0:35–1:05. Point at the **Live browser** panel: "This is a real TinyFish agent, live, setting the pincode on Blinkit and searching." Click a second agent card to switch.
1:05–1:30. The map lights up green, red and amber. Hover a red pincode: "Out of stock here, on this platform."
1:30–1:50. Alerts: competitor at #1, the discount leakage, stockouts. Click **Send to WhatsApp**.
1:50–2:00. KPIs: "18 checks, [T] minutes, 72 minutes of manual work saved, every day. Built on TinyFish."

---

## LinkedIn post

Today at Swim with TinyFish, Bangalore (by Ignite Room × TinyFish, hosted at Quad AI), we built **ShelfSight** in 6 hours. 🐟

The problem: if you're a D2C brand in India, you don't know whether your product is in stock on Blinkit, Zepto or BigBasket in Koramangala versus Whitefield right now. These apps have no API, every dark store has different stock, and checking by hand takes hours.

ShelfSight sends a swarm of TinyFish web agents into each app, one per platform and pincode. Each agent sets the delivery location, searches the product, and reports what shoppers actually see: in stock or not, search rank, who's #1, and how deep the discount is. You can watch every agent's live browser on the dashboard while a map of Bengaluru lights up.

The first real scan surprised us. On Blinkit, searching "Yoga Bar" showed a competitor at #1. On BigBasket, Yoga Bar products were 40–57% below MRP.

Built with the TinyFish Agent API (live SSE + structured output + stealth browsing), FastAPI and Leaflet.

GitHub: [link]
Demo: [video link]

Thanks to @TinyFish, @Ignite Room and @Quad AI for a great day.

#TinyFish #AIAgents #Hackathon #QuickCommerce #Bangalore #BuildInPublic
