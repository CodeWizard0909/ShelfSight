const $ = (s) => document.querySelector(s);
const MANUAL_MIN_PER_CHECK = 4; // open app, set pincode, search, note it down

let CFG, map, markers = {}, selPlatforms = new Set(), selPins = new Set();
let state = { cells: {}, running: new Set(), alerts: [], timer: null, t0: 0 };

const STATUS_COLOR = { in_stock: "#22c55e", out_of_stock: "#ef4444", not_listed: "#f59e0b", error: "#4b5563", running: "#3b82f6", idle: "#334155" };
const STATUS_LABEL = { in_stock: "in stock", out_of_stock: "out of stock", not_listed: "not listed", error: "failed" };

async function init() {
  CFG = await (await fetch("/api/config")).json();
  Object.keys(CFG.platforms).forEach((p) => selPlatforms.add(p));
  ["560102", "560034", "560038", "560066", "560103", "560011"].forEach((z) => selPins.add(z));

  map = L.map("map", { zoomControl: false, attributionControl: false }).setView([12.95, 77.64], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
  for (const [z, p] of Object.entries(CFG.pincodes)) {
    markers[z] = L.circleMarker([p.lat, p.lng], { radius: 14, weight: 2, color: "#0b0d12", fillColor: STATUS_COLOR.idle, fillOpacity: 0.9 })
      .bindTooltip(`<b>${p.area}</b> ${z}`, { direction: "top" })
      .addTo(map);
  }
  renderChips();
  $("#keyword").addEventListener("change", renderChips);
  $("#scan").addEventListener("submit", start);
  $("#share").addEventListener("click", share);
  $("#ev-close").onclick = () => $("#modal").hidden = true;
  $("#modal").onclick = (e) => { if (e.target.id === "modal") $("#modal").hidden = true; };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#modal").hidden = true; });
}

async function renderChips() {
  const cached = new Set(await (await fetch(`/api/cached?keyword=${encodeURIComponent($("#keyword").value)}`)).json());
  $("#platforms").innerHTML = Object.entries(CFG.platforms).map(([k, p]) =>
    `<span class="chip ${selPlatforms.has(k) ? "on" : ""}" data-p="${k}"><span class="c" style="background:${p.color}"></span>${p.name}</span>`).join("");
  $("#pincodes").innerHTML = Object.entries(CFG.pincodes).map(([z, p]) => {
    const n = Object.keys(CFG.platforms).filter((pl) => cached.has(`${pl}:${z}`)).length;
    return `<span class="chip ${selPins.has(z) ? "on" : ""}" data-z="${z}">${p.area} ${z}${n ? `<span class="cache">●${n}</span>` : ""}</span>`;
  }).join("");
  document.querySelectorAll("[data-p]").forEach((el) => el.onclick = () => { toggle(selPlatforms, el.dataset.p); renderChips(); });
  document.querySelectorAll("[data-z]").forEach((el) => el.onclick = () => { toggle(selPins, el.dataset.z); renderChips(); });
}
const toggle = (set, v) => set.has(v) ? set.delete(v) : set.add(v);

async function start(e) {
  e.preventDefault();
  const body = { brand: $("#brand").value, keyword: $("#keyword").value, platforms: [...selPlatforms], pincodes: [...selPins], mode: $("#mode").value };
  if (!body.platforms.length || !body.pincodes.length) return alert("Pick at least one platform and one pincode");
  $("#go").disabled = true;
  state = { cells: {}, running: new Set(), alerts: [], timer: null, t0: Date.now() };
  $("#alerts").innerHTML = ""; $("#board").innerHTML = ""; $("#share").disabled = true;
  Object.values(markers).forEach((m) => m.setStyle({ fillColor: STATUS_COLOR.idle }));
  ["#k-avail", "#k-rank", "#k-saved"].forEach((s) => $(s).textContent = "–");
  $("#k-alerts").textContent = "0";
  state.timer = setInterval(() => $("#k-time").textContent = `${Math.round((Date.now() - state.t0) / 1000)}s`, 500);

  const { job_id } = await (await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  const es = new EventSource(`/api/scan/${job_id}/events`);
  es.onmessage = (m) => handle(JSON.parse(m.data), es);
}

function handle(ev, es) {
  switch (ev.type) {
    case "job":
      $("#k-agents").textContent = ev.tasks.length;
      $("#swarm-sub").textContent = `${ev.tasks.length} agents · ${ev.mode}`;
      ev.tasks.forEach(addCard);
      break;
    case "queued": setCard(ev.task, "queued", "waiting for a browser slot…"); break;
    case "started": setCard(ev.task, "running", ev.replay ? "replaying recorded run" : "browser launched", ev.replay); break;
    case "progress": setCard(ev.task, "running", ev.text); break;
    case "skipped": setCard(ev.task, "error", ev.text); break;
    case "preview": {
      const el = card(ev.task);
      el.dataset.preview = ev.url;
      el.onclick = () => state.running.has(ev.task) ? watch(ev.task) : openEvidence(ev.task);
      if (!state.watching || !state.running.has(state.watching)) watch(ev.task);
      break;
    }
    case "cell": onCell(ev); break;
    case "score":
      $("#k-avail").textContent = `${ev.score.availability}%`;
      $("#k-rank").textContent = `${ev.score.rank1_share}%`;
      $("#k-saved").textContent = `${ev.score.scanned * MANUAL_MIN_PER_CHECK} min`;
      break;
    case "done":
      clearInterval(state.timer);
      $("#k-time").textContent = `${ev.seconds}s`;
      $("#go").disabled = false;
      es.close();
      renderChips();
      break;
  }
}

const card = (t) => document.getElementById(`a-${t.replace(":", "-")}`);
function addCard(t) {
  const [p, z] = t.split(":");
  const el = document.createElement("div");
  el.className = "agent"; el.id = `a-${p}-${z}`;
  el.innerHTML = `<div class="top"><span><span class="c" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${CFG.platforms[p].color};margin-right:6px"></span>${CFG.platforms[p].name}<span class="replay"></span></span><span class="pill">idle</span></div>
    <div class="area">${CFG.pincodes[z].area} · ${z}</div><div class="log"></div>`;
  $("#board").appendChild(el);
}
function setCard(t, cls, text, replay) {
  const el = card(t); if (!el) return;
  el.className = `agent ${cls}`;
  el.querySelector(".pill").textContent = cls === "running" ? "scanning" : (STATUS_LABEL[cls] || cls);
  if (replay) el.querySelector(".replay").textContent = "· replay";
  if (text) {
    const log = el.querySelector(".log");
    log.innerHTML = `<div>› ${escapeHtml(text)}</div>` + log.innerHTML;
  }
  if (cls === "running") { state.running.add(t); paintPin(t.split(":")[1]); }
}

function watch(t) {
  const el = card(t);
  if (!el?.dataset.preview) return;
  state.watching = t;
  document.querySelectorAll(".agent.watching").forEach((a) => a.classList.remove("watching"));
  el.classList.add("watching");
  const [p, z] = t.split(":");
  $("#live-sub").textContent = `${CFG.platforms[p].name} · ${CFG.pincodes[z].area} ${z}`;
  $("#live").innerHTML = `<span class="live-badge">● LIVE</span><iframe src="${el.dataset.preview}" allow="autoplay"></iframe>`;
}

function onCell({ task, cell, alerts }) {
  state.running.delete(task);
  if (state.watching === task) {
    const next = [...state.running].find((t) => card(t)?.dataset.preview);
    if (next) watch(next);
  }
  state.cells[task] = cell;
  const msg = cell.status === "error" ? cell.error
    : `rank ${cell.best_rank ?? "–"} · ${cell.my_in_stock}/${cell.my_count} SKUs live${cell.top_is_competitor ? ` · #1 is ${cell.top_product.brand}` : ""}`;
  setCard(task, cell.status, msg);
  paintPin(cell.pincode);
  const c = card(task);
  if (c && cell.status !== "error") { c.classList.add("has-ev"); c.onclick = () => openEvidence(task); }
  alerts.forEach((a) => {
    state.alerts.push(a);
    if ($("#alerts .empty")) $("#alerts").innerHTML = "";
    $("#alerts").insertAdjacentHTML("afterbegin", `<li class="${a.level}" data-task="${task}"><span class="proof">📷 proof</span>${escapeHtml(a.text)}<small>${escapeHtml(a.where)}</small></li>`);
    $("#alerts li").onclick = () => openEvidence(task);
  });
  $("#k-alerts").textContent = state.alerts.length;
  $("#share").disabled = !state.alerts.length;
  renderMatrix();
}

function paintPin(z) {
  const cells = Object.values(state.cells).filter((c) => c.pincode === z);
  const running = [...state.running].some((t) => t.endsWith(z));
  let s = "idle";
  if (cells.some((c) => c.status === "out_of_stock")) s = "out_of_stock";
  else if (cells.some((c) => c.status === "not_listed")) s = "not_listed";
  else if (cells.some((c) => c.status === "in_stock")) s = "in_stock";
  else if (cells.length) s = "error";
  if (running && s === "idle") s = "running";
  markers[z].setStyle({ fillColor: STATUS_COLOR[s], radius: running ? 17 : 14 });
  const lines = cells.map((c) => `${CFG.platforms[c.platform].name}: ${STATUS_LABEL[c.status]}${c.best_rank ? ` (rank ${c.best_rank})` : ""}`);
  markers[z].setTooltipContent(`<b>${CFG.pincodes[z].area}</b> ${z}${lines.length ? "<br>" + lines.join("<br>") : ""}`);
}

function renderMatrix() {
  const pins = [...new Set(Object.values(state.cells).map((c) => c.pincode))];
  const plats = Object.keys(CFG.platforms).filter((p) => selPlatforms.has(p));
  const rows = pins.map((z) => `<tr><td>${CFG.pincodes[z].area}</td>${plats.map((p) => {
    const c = state.cells[`${p}:${z}`];
    if (!c) return `<td class="cell">·</td>`;
    const price = c.products?.find((x) => x.rank === c.best_rank)?.price;
    return `<td class="cell"><span class="tag" style="background:${STATUS_COLOR[c.status]}33;color:${STATUS_COLOR[c.status]}">${STATUS_LABEL[c.status]}</span> ${c.best_rank ? `#${c.best_rank}` : ""} ${price ? `₹${price}` : ""}</td>`;
  }).join("")}</tr>`).join("");
  $("#matrix").innerHTML = `<table><tr><th>Area</th>${plats.map((p) => `<th>${CFG.platforms[p].name}</th>`).join("")}</tr>${rows}</table>`;
}

async function openEvidence(t) {
  const [p, z] = t.split(":");
  const r = await fetch(`/api/evidence/${p}/${z}?keyword=${encodeURIComponent($("#keyword").value)}`);
  if (!r.ok) return;
  const ev = await r.json();
  const shots = ev.steps.filter((s) => s.url);
  if (!shots.length) return;
  $("#ev-title").textContent = `${CFG.platforms[p].name} · ${CFG.pincodes[z].area} ${z}`;
  $("#ev-sub").textContent = `What the TinyFish agent saw · ${ev.num_of_steps} steps · run ${ev.run_id.slice(0, 8)} · ${new Date(ev.finished_at).toLocaleTimeString()}`;
  $("#ev-strip").innerHTML = shots.map((s, i) =>
    `<figure data-i="${i}"><img src="${s.url}" loading="lazy"><figcaption>${i + 1}. ${escapeHtml(s.action)}</figcaption></figure>`).join("");
  const show = (i) => {
    $("#ev-img").src = shots[i].url;
    $("#ev-caption").textContent = `Step ${i + 1}/${shots.length}: ${shots[i].action}`;
    document.querySelectorAll("#ev-strip figure").forEach((f) => f.classList.toggle("on", +f.dataset.i === i));
  };
  document.querySelectorAll("#ev-strip figure").forEach((f) => f.onclick = () => show(+f.dataset.i));
  show(shots.length - 1); // final screen = the results the agent extracted
  $("#modal").hidden = false;
}

function share() {
  const top = state.alerts.filter((a) => a.level !== "info").slice(0, 8);
  const text = `ShelfSight alert for ${$("#brand").value}\n\n` + top.map((a) => `• ${a.where}: ${a.text}`).join("\n");
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

init();
