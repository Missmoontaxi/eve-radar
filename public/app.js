/* Eve Events Radar — interactive client.
   Renders from /events.json. Stars are shared via /api/stars (Vercel KV),
   with a localStorage fallback so the page still works opened locally. */
(() => {
  "use strict";

  // ---- config -------------------------------------------------------------
  const STAR_WEIGHT = 3;               // each ★ nudges an event up the "Team picks" rank
  const CITY_COLORS = {
    NYC: "var(--c-nyc)", SF: "var(--c-sf)", Austin: "var(--c-austin)",
    Online: "var(--c-online)", National: "var(--c-national)",
  };
  const cityColor = (c) => CITY_COLORS[c] || "var(--c-other)";
  const TIERS = [
    ["Top Events", "Our recommended priorities — the highest-leverage rooms to anchor, speak, or host."],
    ["Worth it", "Strong fit — assign an owner and a clear outcome."],
    ["Monitor", "On the radar — watch for confirmation or a reason to act."],
  ];
  const FILTER_GROUPS = [
    { key: "city", label: "City", dot: true },
    { key: "tier", label: "Tier" },
    { key: "format", label: "Type" },
    { key: "owner", label: "Team" },
    { key: "cost", label: "Cost" },
  ];
  const GROUP_LABEL = { city: "City", tier: "Tier", format: "Type", owner: "Team", cost: "Cost" };

  // ---- state --------------------------------------------------------------
  let EVENTS = [], META = {};
  let STARS = {};                                  // id -> shared count
  const MINE = new Set(loadJSON("eve-radar-mine", []));   // ids this browser starred
  const state = { search: "", sort: "date", view: "calendar",
    filters: { city: new Set(), tier: new Set(), format: new Set(), owner: new Set(), cost: new Set() } };

  // ---- helpers ------------------------------------------------------------
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function loadJSON(k, dflt) { try { return JSON.parse(localStorage.getItem(k)) ?? dflt; } catch { return dflt; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  const stars = (id) => STARS[id] || 0;
  const effScore = (e) => e.score + stars(e.id) * STAR_WEIGHT;
  const fmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  function countUp() {                         // numbers tick up from 0 on load — purely decorative
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll(".stat .n[data-to]").forEach((el) => {
      const to = +el.dataset.to || 0;
      // animate only when visible & motion allowed; otherwise show the real number outright
      if (reduce || to <= 0 || document.hidden) { el.textContent = to; return; }
      const dur = 750, t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));   // easeOutCubic
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(() => { el.textContent = to; }, dur + 200);   // guarantee the final value lands
    });
  }

  // ---- boot ---------------------------------------------------------------
  init();
  async function init() {
    try {
      const r = await fetch("/events.json", { cache: "no-store" });
      const data = await r.json();
      EVENTS = data.events || []; META = data.meta || {};
    } catch (e) {
      $("#results").innerHTML = `<div class="empty">Couldn't load events.json — ${esc(e.message)}</div>`;
      return;
    }
    STARS = loadJSON("eve-radar-stars-local", {});   // optimistic baseline; server overrides below
    renderChrome();
    bind();
    render();
    fetchStars();                                    // refresh shared counts, then re-render
  }

  // ---- shared stars -------------------------------------------------------
  async function fetchStars() {
    try {
      const r = await fetch("/api/stars", { cache: "no-store" });
      if (!r.ok) throw new Error("no api");
      const data = await r.json();
      STARS = data.counts || data || {};
      render();
    } catch { /* keep local fallback */ }
  }
  async function toggleStar(id) {
    const on = MINE.has(id);
    const delta = on ? -1 : 1;
    if (on) MINE.delete(id); else MINE.add(id);
    STARS[id] = Math.max(0, stars(id) + delta);
    saveJSON("eve-radar-mine", [...MINE]);
    saveJSON("eve-radar-stars-local", STARS);
    render();
    try {
      const r = await fetch("/api/stars", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, delta }),
      });
      if (r.ok) { const d = await r.json(); if (typeof d.count === "number") { STARS[id] = d.count; render(); } }
    } catch { /* offline: local fallback already applied */ }
  }

  // ---- static chrome (stats, filters, legend) -----------------------------
  function renderChrome() {
    $("#hero-title").textContent = "Upcoming Events";
    $("#hero-sub").textContent = `Date Range: ${fmt(META.window_start)} – ${fmt(META.window_end)} · NYC · SF · Austin · Online · National`;
    $("#sort").value = state.sort;
    $("#hero-meta").innerHTML = `Run ${esc(META.run_date)}<br>${esc((META.source_types || []).length)} source types<br>${esc(META.total)} events scored`;
    $("#footer-meta").textContent = `Eve Events Radar · run ${META.run_date} · ${META.total} events`;

    const c = META.counts || {};
    $("#stats").innerHTML = [
      ["Top Events", c["Top Events"]], ["Worth it", c["Worth it"]],
      ["On radar", META.total], ["Monitor", c["Monitor"]],
    ].map(([l, n]) => `<div class="stat"><div class="n gold-text" data-to="${n ?? 0}">0</div>` +
      `<div class="l">${l}</div></div>`).join("");
    countUp();

    // filter chips, values drawn from data
    const fb = $("#filterbar"); fb.innerHTML = "";
    for (const g of FILTER_GROUPS) {
      const counts = {};
      for (const e of EVENTS) { const v = e[g.key]; if (v) counts[v] = (counts[v] || 0) + 1; }
      const tierOrder = TIERS.map((t) => t[0]);   // Top Events → Worth it → Monitor
      const vals = Object.keys(counts).sort((a, b) =>
        g.key === "cost" ? a.length - b.length :
        g.key === "tier" ? tierOrder.indexOf(a) - tierOrder.indexOf(b) :
        a.localeCompare(b));
      const row = document.createElement("div"); row.className = "filter-group";
      row.innerHTML = `<span class="filter-label">${g.label}</span>` + vals.map((v) =>
        `<button class="chip" data-group="${g.key}" data-val="${esc(v)}">` +
        (g.dot ? `<span class="dot" style="background:${cityColor(v)}"></span>` : "") +
        `${esc(v)}<span class="ct">${counts[v]}</span></button>`).join("");
      fb.appendChild(row);
    }

    $("#legend").innerHTML = Object.keys(CITY_COLORS).map((c) =>
      `<span class="item"><span class="dot" style="background:${cityColor(c)}"></span>${c}</span>`).join("")
      + `<span class="item"><span class="dot" style="background:var(--c-other)"></span>Other</span>`;
  }

  // ---- events -------------------------------------------------------------
  function bind() {
    $("#filterbar").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip"); if (!chip) return;
      const set = state.filters[chip.dataset.group];
      const v = chip.dataset.val;
      set.has(v) ? set.delete(v) : set.add(v);
      render();
    });
    const search = $("#search");
    search.addEventListener("input", () => {
      state.search = search.value.trim().toLowerCase();
      $("#search-clear").hidden = !search.value;
      render();
    });
    $("#search-clear").addEventListener("click", () => { search.value = ""; state.search = ""; $("#search-clear").hidden = true; render(); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
    $("#view-toggle").addEventListener("click", (e) => {
      const b = e.target.closest(".vt"); if (!b) return;
      state.view = b.dataset.view;
      [...document.querySelectorAll(".vt")].forEach((x) => x.classList.toggle("active", x === b));
      render();
    });
    $("#export-csv").addEventListener("click", exportCSV);
    $("#results").addEventListener("click", (e) => {
      const star = e.target.closest(".star"); if (star) return toggleStar(star.dataset.id);
      const ics = e.target.closest(".ics"); if (ics) return downloadICS(EVENTS.find((x) => x.id === ics.dataset.id));
    });
    const modal = $("#modal-bg");
    $("#refresh-btn").addEventListener("click", () => { modal.hidden = false; });
    $("#modal-close").addEventListener("click", () => { modal.hidden = true; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.hidden = true; });
  }

  // ---- filtering / sorting ------------------------------------------------
  function visible() {
    const f = state.filters, q = state.search;
    return EVENTS.filter((e) => {
      for (const key of Object.keys(f)) { const s = f[key]; if (s.size && !s.has(e[key])) return false; }
      if (q) {
        const hay = (e.name + " " + e.host_org + " " + e.city + " " + e.city_raw + " " +
          (e.topic_tags || []).join(" ") + " " + e.format + " " + e.owner).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function sortList(list) {
    const by = {
      picks: (a, b) => effScore(b) - effScore(a) || b.score - a.score,
      score: (a, b) => b.score - a.score,
      city: (a, b) => (a.city || "").localeCompare(b.city || "") || b.score - a.score,
      date: (a, b) => (a.date_start || "9999").localeCompare(b.date_start || "9999") || b.score - a.score,
    }[state.sort];
    return [...list].sort(by);
  }

  // ---- render -------------------------------------------------------------
  function syncControls() {
    document.querySelectorAll(".chip").forEach((ch) =>
      ch.classList.toggle("active", state.filters[ch.dataset.group].has(ch.dataset.val)));
  }

  function render() {
    const list = sortList(visible());
    syncControls();
    summary(list.length);
    $("#results").innerHTML = list.length === 0
      ? `<div class="empty">No events match these filters. <a id="reset-link">Reset</a></div>`
      : (state.view === "calendar" ? renderCalendar(list) : renderTiers(list));
    const reset = $("#reset-link"); if (reset) reset.addEventListener("click", resetAll);
  }

  function summary(n) {
    const parts = [];
    for (const key of Object.keys(state.filters)) { const s = state.filters[key]; if (s.size) parts.push(`${GROUP_LABEL[key]}: ${[...s].join(", ")}`); }
    if (state.search) parts.push(`“${state.search}”`);
    $("#active-summary").innerHTML = parts.length
      ? `Showing <strong>${n}</strong> · ${esc(parts.join("  ·  "))} — <a id="reset-link2">clear all</a>`
      : `Showing all <strong>${n}</strong> events`;
    const r2 = $("#reset-link2"); if (r2) r2.addEventListener("click", resetAll);
  }
  function resetAll() {
    Object.values(state.filters).forEach((s) => s.clear());
    state.search = ""; $("#search").value = ""; $("#search-clear").hidden = true; render();
  }

  function card(e) {
    const c = cityColor(e.city);
    const url = esc(e.url);
    const name = url ? `<a href="${url}" target="_blank" rel="noopener">${esc(e.name)}</a>` : esc(e.name);
    const line = [e.date_label, e.city_raw || e.city, e.host_org].filter(Boolean).map(esc).join(" · ");
    const tags = (e.topic_tags || []).slice(0, 5).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const on = MINE.has(e.id), n = stars(e.id);
    return `<div class="card" style="border-left-color:${c}" data-city="${esc(e.city)}">
      <div>
        <div class="name">${name}</div>
        <div class="line">${line}</div>
        <div class="outcome">${esc(e.outcome)}</div>
        <div class="tags">
          <span class="pill city" style="background:${c}">${esc(e.city)}</span>
          <span class="pill fmt">${esc(e.format)}</span>
          <span class="pill owner">${esc(e.owner)}</span>
          <span class="pill cost">${esc(e.cost)}</span>
        </div>
        <div class="tags">${tags}</div>
        <div class="follow">
          ${url ? `<a class="evlink" href="${url}" target="_blank" rel="noopener">View event ↗</a>` : ""}
          <button class="ics" data-id="${esc(e.id)}">+ Calendar</button>
          <span class="src">via ${esc(e.source)}</span>
        </div>
      </div>
      <div class="right">
        <div class="score">${e.score}</div>
        <div class="fmt">${esc(e.format)}</div>
        <div class="owner">${esc(e.owner)} · ${esc(e.cost)}</div>
        <button class="star ${on ? "on" : ""}" data-id="${esc(e.id)}" title="${on ? "Remove your star" : "Star to boost ranking"}">★ <span class="sc">${n}</span></button>
      </div>
    </div>`;
  }

  function renderTiers(list) {
    return TIERS.map(([tier, desc], i) => {
      const rows = list.filter((e) => e.tier === tier);
      if (!rows.length) return "";
      return `<div class="tier"><div class="hairline"></div>
        <div class="tier-head"><span class="tier-num">${String(i + 1).padStart(2, "0")}</span><h2>${tier}</h2></div>
        <div class="desc">${desc}</div>
        ${rows.map(card).join("")}</div>`;
    }).join("");
  }

  function renderCalendar(list) {
    const groups = {};
    for (const e of list) {
      const k = e.date_start ? mondayOf(e.date_start) : "TBD";
      (groups[k] = groups[k] || []).push(e);
    }
    const keys = Object.keys(groups).sort((a, b) => (a === "TBD") - (b === "TBD") || a.localeCompare(b));
    return keys.map((k) => {
      const rows = groups[k].sort((a, b) => (a.date_start || "9999").localeCompare(b.date_start || "9999") || b.score - a.score);
      const head = k === "TBD" ? "Date to confirm" : `Week of ${fmt(k)}`;
      return `<div class="week"><div class="week-head"><h3>${head}</h3><span class="cnt">${rows.length} event${rows.length > 1 ? "s" : ""}</span></div>
        <div class="cal-grid">${rows.map(calCard).join("")}</div></div>`;
    }).join("");
  }
  function calCard(e) {
    const c = cityColor(e.city), url = esc(e.url);
    const name = url ? `<a href="${url}" target="_blank" rel="noopener">${esc(e.name)}</a>` : esc(e.name);
    const on = MINE.has(e.id), n = stars(e.id);
    return `<div class="cal-card" style="border-top-color:${c}">
      <div class="d">${esc(e.date_label)} · <span style="color:${c}">${esc(e.city)}</span></div>
      <div class="nm">${name}</div>
      <div class="tags"><span class="pill fmt">${esc(e.format)}</span><span class="pill owner">${esc(e.owner)}</span></div>
      <div class="meta-row"><span class="src">score ${e.score}</span>
        <button class="star ${on ? "on" : ""}" data-id="${esc(e.id)}">★ <span class="sc">${n}</span></button></div>
    </div>`;
  }
  function mondayOf(d) {
    const dt = new Date(d + "T00:00:00");
    const day = (dt.getDay() + 6) % 7;        // Mon=0
    dt.setDate(dt.getDate() - day);
    return dt.toISOString().slice(0, 10);
  }

  // ---- exports ------------------------------------------------------------
  function exportCSV() {
    const rows = sortList(visible());
    const cols = ["rank", "name", "score", "stars", "tier", "city", "owner", "format", "cost", "date_label", "date_start", "host_org", "source", "url"];
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [cols.join(",")];
    rows.forEach((e, i) => lines.push(cols.map((c) => q(c === "rank" ? i + 1 : c === "stars" ? stars(e.id) : e[c])).join(",")));
    download(`eve-events-radar-${META.run_date || "export"}.csv`, lines.join("\n"), "text/csv");
  }
  function downloadICS(e) {
    if (!e || !e.date_start) { alert("No confirmed date for this event yet."); return; }
    const d = (s) => s.replace(/-/g, "");
    const end = new Date((e.date_end || e.date_start) + "T00:00:00"); end.setDate(end.getDate() + 1);
    const dtend = end.toISOString().slice(0, 10).replace(/-/g, "");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Eve//Events Radar//EN", "BEGIN:VEVENT",
      `UID:${e.id}@radar.moontaxilab.com`, `DTSTART;VALUE=DATE:${d(e.date_start)}`, `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${icsEsc(e.name)}`,
      `DESCRIPTION:${icsEsc(`${e.outcome} · Owner: ${e.owner} · ${e.format} · Eve Events Radar`)}`,
      `LOCATION:${icsEsc(e.city_raw || e.city)}`, e.url ? `URL:${e.url}` : "", "END:VEVENT", "END:VCALENDAR"]
      .filter(Boolean).join("\r\n");
    download(`${e.id}.ics`, ics, "text/calendar");
  }
  const icsEsc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  function download(name, content, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
})();
