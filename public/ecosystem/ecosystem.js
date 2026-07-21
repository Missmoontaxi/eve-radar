/* Eve Ecosystem Qualifier — interactive client.
   Renders from /ecosystem.json (aggregate-only feed: source-level scores, funnels,
   rates, history — no person-level data by contract). */
(() => {
  "use strict";

  const TIERS = [
    ["Double down", "Proven signal: allocate calendar here first and book the next edition."],
    ["Working", "Real motion, not yet proven. Work the follow-ups before adding new rooms."],
    ["Watch", "Low signal so far. Harvest what's there; don't reinvest until the data argues."],
  ];
  const SMALL_N = 5;
  // sequential plum ramp, light→dark — magnitude encoding for the funnel (one hue)
  const RAMP = ["#B694B0", "#8A5583", "#5E2658", "#3E1939"];

  let DATA = null;
  const state = { type: "all", tier: "all" };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => `${Math.round(100 * (x || 0))}%`;

  init();
  async function init() {
    try {
      const r = await fetch("/ecosystem.json", { cache: "no-store" });
      DATA = await r.json();
    } catch (e) {
      $("#results").innerHTML = `<div class="empty">Couldn't load ecosystem.json: ${esc(e.message)}</div>`;
      return;
    }
    renderChrome();
    renderAll();
    bind();
    highlightHash();
  }

  function renderChrome() {
    const m = DATA.meta, p = DATA.portfolio;
    $("#hero-title").textContent = "Relationships, measured";
    $("#hero-meta").innerHTML =
      `Run ${esc(m.run_date)}<br>${esc(m.scope)}<br>${esc(m.contacts)} contacts · ${esc(m.sources)} sources`;
    $("#footer-meta").textContent =
      `Eve Ecosystem Qualifier · run ${m.run_date} · ${m.contacts} contacts · ${m.sources} sources`;

    $("#stats").innerHTML = [
      [m.contacts, "Connected", `+${m.secondary_touches} secondary touches`],
      [pct(p.followup_rate), "Follow-up rate", `${p.held} meetings held`],
      [pct(p.in_motion_rate), "In motion", `${p.in_motion} of ${p.n} engaged`],
      [pct(p.demo_rate), "Demo rate", `${p.demos} demos`],
      [pct(p.close_rate), "Close rate", `${p.won} won · detail in Attio`],
      [pct(p.community_yield), "Community yield", `${p.community} friends / ambassadors / referrals`],
    ].map(([n, l, s]) =>
      `<div class="stat"><div class="n gold-text">${esc(n)}</div>` +
      `<div class="l">${esc(l)}</div><div class="s">${esc(s)}</div></div>`).join("");
  }

  function renderAll() {
    renderFunnel();
    renderVerdict();
    renderCompare();
    renderTrend();
    renderFilters();
    renderSources();
  }

  // ---- funnel -------------------------------------------------------------
  function renderFunnel() {
    const p = DATA.portfolio;
    const steps = [
      ["Connected", p.n, 1],
      ["In motion", p.in_motion, p.in_motion_rate],
      ["Follow-up held", p.held, p.followup_rate],
      ["Demo", p.demos, p.demo_rate],
    ];
    $("#funnel").innerHTML = `<div class="funnel">` + steps.map(([label, count, rate], i) => {
      const w = p.n ? Math.max(100 * count / p.n, 1.5) : 0;
      return `<div class="frow"><div class="flabel">${label}</div>` +
        `<div class="fbarwrap"><div class="fbar" style="width:${w.toFixed(1)}%;background:${RAMP[i]}" ` +
        `title="${label}: ${count} of ${p.n} (${pct(rate)})"></div></div>` +
        `<div class="fval">${count} <span>· ${pct(rate)}</span></div></div>`;
    }).join("") + `</div>`;
  }

  function renderVerdict() {
    const p = DATA.portfolio, ev = DATA.by_type.event, co = DATA.by_type.community;
    const lines = [];
    if (ev && co) {
      lines.push(co.followup_rate > ev.followup_rate
        ? `Communities out-convert events on follow-up (${pct(co.followup_rate)} vs ${pct(ev.followup_rate)}); existing trust shortens the path.`
        : `Events out-convert communities on follow-up (${pct(ev.followup_rate)} vs ${pct(co.followup_rate)}).`);
    }
    if (p.demos) lines.push(`All ${p.demos} demos so far came through the warm path, zero from cold outbound: consistent with the hypothesis.`);
    lines.push(`Portfolio: ${pct(p.in_motion_rate)} of connections are in motion; the near-term lever is converting the ${p.in_motion - p.held} scheduling/scheduled follow-ups into held meetings.`);
    $("#verdict").innerHTML =
      `<div class="q">Is the hypothesis holding?</div><div class="a">${esc(lines.join(" "))}</div>`;
  }

  // ---- compare ------------------------------------------------------------
  function renderCompare() {
    $("#compare").innerHTML = [["Events", "event"], ["Communities", "community"]].map(([label, key]) => {
      const r = DATA.by_type[key];
      if (!r) return `<div class="cmp"><h3>${label}</h3><div class="empty">No data yet.</div></div>`;
      const rows = [
        ["Connected", r.n], ["Follow-up rate (strict)", pct(r.followup_rate)],
        ["In motion", pct(r.in_motion_rate)], ["Demo rate", pct(r.demo_rate)],
        ["Demos", r.demos], ["Community yield", pct(r.community_yield)],
      ].map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join("");
      return `<div class="cmp"><h3>${label}</h3>${rows}</div>`;
    }).join("");
  }

  // ---- trend --------------------------------------------------------------
  function renderTrend() {
    const hist = DATA.history || [];
    if (hist.length < 2) {
      $("#trend").innerHTML = `<div class="note">Baseline recorded ${esc(hist[0] ? hist[0].run_date : "")}.
        Trend lines appear from the second weekly run: follow-up rate, demo rate, and per-source scores over time.</div>`;
      return;
    }
    const pts = hist.map((h) => [h.run_date, h.portfolio.followup_rate || 0, h.portfolio.demo_rate || 0]);
    const w = 640, hgt = 130, pad = 10;
    const mx = Math.max(...pts.map((p) => Math.max(p[1], p[2])), 0.01);
    const poly = (idx) => pts.map((p, i) =>
      `${(pad + i * (w - 2 * pad) / (pts.length - 1)).toFixed(1)},` +
      `${(hgt - pad - (p[idx] / mx) * (hgt - 2 * pad)).toFixed(1)}`).join(" ");
    const runs = hist.slice(-6).map((h) =>
      `<div class="row"><span>${esc(h.run_date)}</span>` +
      `<b>${pct(h.portfolio.followup_rate)} follow-up · ${pct(h.portfolio.demo_rate)} demo</b></div>`).join("");
    $("#trend").innerHTML =
      `<svg viewBox="0 0 ${w} ${hgt}" width="100%" height="${hgt}" role="img" aria-label="Follow-up and demo rate over time">` +
      `<polyline points="${poly(1)}" fill="none" stroke="#5E2658" stroke-width="2" stroke-linecap="round"/>` +
      `<polyline points="${poly(2)}" fill="none" stroke="#C4A07A" stroke-width="2" stroke-linecap="round"/></svg>` +
      `<div class="key"><span class="k"><span class="sw" style="background:#5E2658"></span>Follow-up rate (strict)</span>` +
      `<span class="k"><span class="sw" style="background:#C4A07A"></span>Demo rate</span></div>` +
      `<div class="runs">${runs}</div>`;
  }

  // ---- sources ------------------------------------------------------------
  function renderFilters() {
    const counts = { event: 0, community: 0 };
    DATA.sources.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });
    const typeChips = [["all", "All sources", DATA.sources.length], ["event", "Events", counts.event], ["community", "Communities", counts.community]]
      .map(([v, l, n]) => `<button class="chip" data-group="type" data-val="${v}">${l}<span class="ct">${n}</span></button>`).join("");
    const tierChips = [["all", "All tiers"], ...TIERS.map(([t]) => [t, t])]
      .map(([v, l]) => `<button class="chip" data-group="tier" data-val="${esc(v)}">${esc(l)}</button>`).join("");
    $("#filterbar").innerHTML =
      `<div class="filter-group"><span class="filter-label">Type</span>${typeChips}</div>` +
      `<div class="filter-group"><span class="filter-label">Tier</span>${tierChips}</div>`;
  }

  function srcCard(s) {
    const f = s.funnel, r = s.rates, b = s.breakdown;
    const t1 = s.tier === "Double down" ? "t1" : "";
    const small = s.directional ? `<span class="tag warn">n &lt; ${SMALL_N} · directional</span>` : "";
    const stages = (f.revenue_class || f.community_class)
      ? `<span class="tag stage">${f.revenue_class} revenue-class · ${f.community_class} community-class</span>` : "";
    return `<div class="card src-card ${t1}" id="${esc(s.slug)}" data-type="${esc(s.type)}" data-tier="${esc(s.tier)}">
      <div>
        <div class="name">${esc(s.name)}</div>
        <div class="line">${esc(s.type[0].toUpperCase() + s.type.slice(1))} · ${esc(s.city)} · ${esc(s.date)} · ICP density: ${esc(s.icp_density)}</div>
        <div class="mini">
          <span class="mstep"><span class="mnum">${f.connected}</span><span class="mlab">connected</span></span>
          <span class="marrow">→</span>
          <span class="mstep"><span class="mnum">${f.held}</span><span class="mlab">held</span></span>
          <span class="marrow">→</span>
          <span class="mstep"><span class="mnum">${f.demos}</span><span class="mlab">demo</span></span>
        </div>
        <div class="tags">
          <span class="tag">follow-up ${pct(r.followup)}</span>
          <span class="tag">in motion ${pct(r.in_motion)}</span>
          <span class="tag">demo ${pct(r.demo)}</span>
          ${stages}${small}
        </div>
      </div>
      <div class="right">
        <div class="score">${s.score}</div>
        <div class="tierlab">${esc(s.tier)}</div>
        <div class="bd">vol ${b.volume} · eng ${b.engagement} · conv ${b.conversion}<br>mom ${b.momentum} · fit ${b.fit}</div>
      </div>
    </div>`;
  }

  function renderSources() {
    const list = DATA.sources.filter((s) =>
      (state.type === "all" || s.type === state.type) &&
      (state.tier === "all" || s.tier === state.tier));
    document.querySelectorAll(".chip").forEach((ch) =>
      ch.classList.toggle("active", state[ch.dataset.group] === ch.dataset.val));
    $("#results").innerHTML = TIERS.map(([tier, desc], i) => {
      const rows = list.filter((s) => s.tier === tier);
      if (!rows.length) return "";
      return `<div class="tier"><div class="hairline"></div>
        <div class="tier-head"><span class="tier-num">${String(i + 1).padStart(2, "0")}</span><h2>${tier}</h2></div>
        <div class="desc">${desc}</div>
        ${rows.map(srcCard).join("")}</div>`;
    }).join("") || `<div class="empty">No sources match these filters.</div>`;
  }

  function bind() {
    // default active chips
    state.type = "all"; state.tier = "all";
    $("#filterbar").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip"); if (!chip) return;
      state[chip.dataset.group] = chip.dataset.val;
      renderSources();
    });
    const modal = $("#modal-bg");
    $("#refresh-btn").addEventListener("click", () => { modal.hidden = false; });
    $("#modal-close").addEventListener("click", () => { modal.hidden = true; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.hidden = true; });
    renderSources();
  }

  // Cross-link landing: /ecosystem#slug (from radar proof tags) — scroll + flash.
  function highlightHash() {
    const slug = decodeURIComponent(location.hash.replace("#", ""));
    if (!slug) return;
    const el = document.getElementById(slug);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 2500);
  }
})();
