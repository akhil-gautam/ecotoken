// ecotoken dashboard — anime.js v4 (ESM)
import {
  animate,
  stagger,
  createTimeline,
  svg,
} from "https://cdn.jsdelivr.net/npm/animejs@4/+esm";

// ---- constants -------------------------------------------------------
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Pulled from CSS tokens at render time so charts/sparklines track theme.
function themedColors() {
  return {
    green:  cssVar("--accent-green")  || "#39ff14",
    coral:  cssVar("--accent-coral")  || "#ff6b6b",
    cyan:   cssVar("--accent-cyan")   || "#00ffff",
    amber:  cssVar("--accent-amber")  || "#ffb800",
    violet: cssVar("--accent-violet") || "#a78bfa",
    grid:   cssVar("--chart-grid")    || "rgba(255,255,255,0.06)",
    axis:   cssVar("--chart-axis")    || "#555",
    tipBg:  cssVar("--tooltip-bg")    || "#111",
    tipBr:  cssVar("--tooltip-br")    || "#333",
    tipTxt: cssVar("--tooltip-text")  || "#eee",
  };
}
let COLORS = themedColors();

// Centralized animation durations (ms). Bumped ~40-50% for a calmer feel.
const DUR = {
  num: 2000,
  logo: 2400,
  emblem: 1100,
  carBase: 9000,
  carKmMul: 3,
  carCap: 18000,
  dropBase: 3600,
  dropStep: 500,
  crown: 1400,
  crownStagger: 40,
  xp: 2000,
  glass: 1700,
  glassStagger: 90,
  battery: 1300,
  batteryStagger: 70,
  tree: 1400,
  treeStagger: 40,
  lbRow: 800,
  lbRowStagger: 60,
  lbBar: 1700,
  lbBarStagger: 90,
  toastIn: 1000,
  toastHold: 4500,
  toastOut: 700,
  reveal: 1100,
  heroStagger: 130,
  theme: 900,
  rays: 700,
};

const RANKS = [
  { min: 0,   name: "Sapling",    color: "#39ff14", emblem: "#rank-shape-0" },
  { min: 1e5, name: "Seedling",   color: "#7dff52", emblem: "#rank-shape-1" },
  { min: 1e6, name: "Apprentice", color: "#00ffff", emblem: "#rank-shape-2" },
  { min: 1e7, name: "Adept",      color: "#ffb800", emblem: "#rank-shape-3" },
  { min: 1e8, name: "Master",     color: "#ff6b6b", emblem: "#rank-shape-4" },
  { min: 1e9, name: "Legendary",  color: "#a78bfa", emblem: "#rank-shape-5" },
];

const MILESTONES = [
  { key: "m-first-data", test: s     => s.total_tokens > 0,              icon: "🎬", title: "first footprint",   kicker: "tracking started" },
  { key: "m-100k",       test: s     => s.total_tokens >= 100_000,       icon: "✨", title: "100k tokens",        kicker: "getting warmed up" },
  { key: "m-1m",         test: s     => s.total_tokens >= 1_000_000,     icon: "🎯", title: "1M tokens",          kicker: "milestone unlocked" },
  { key: "m-10m",        test: s     => s.total_tokens >= 10_000_000,    icon: "🔥", title: "10M tokens",         kicker: "power user" },
  { key: "m-100m",       test: s     => s.total_tokens >= 100_000_000,   icon: "🚀", title: "100M tokens",        kicker: "rocket fuel" },
  { key: "m-1b",         test: s     => s.total_tokens >= 1_000_000_000, icon: "⭐", title: "1B tokens",           kicker: "legendary scale" },
  { key: "m-shower",     test: (_,e) => e.showers >= 1,                  icon: "🚿", title: "one full shower",    kicker: "water equivalent" },
  { key: "m-road-10km",  test: (_,e) => e.car_km >= 10,                  icon: "🛣️", title: "10 km road trip",    kicker: "CO₂ equivalent" },
  { key: "m-road-100km", test: (_,e) => e.car_km >= 100,                 icon: "🛻", title: "100 km road trip",   kicker: "CO₂ equivalent" },
  { key: "m-1-tree",     test: (_,e) => e.trees_per_day >= 1,            icon: "🌳", title: "first tree-day",     kicker: "offset needed" },
  { key: "m-forest",     test: (_,e) => e.trees_per_day >= 100,          icon: "🌲", title: "a small forest",     kicker: "100 tree-days" },
];

const enabled = { energy_wh: true, water_ml: true, co2_g: true };
let timelineChart, modelsChart, providersChart;
let firstRender = true;
let currentRankKey = null;
let carAnim = null;

// ---- API base probing ------------------------------------------------
const FALLBACK_BASE = "http://localhost:3777";
let apiBase = "";
let probed = false;

async function probeBase() {
  if (probed) return;
  probed = true;
  try {
    const r = await fetch("/api/summary", { cache: "no-store" });
    if (r.ok) { apiBase = ""; return; }
  } catch (_) {}
  try {
    const r = await fetch(FALLBACK_BASE + "/api/summary", { cache: "no-store" });
    if (r.ok) { apiBase = FALLBACK_BASE; return; }
  } catch (_) {}
  apiBase = null;
}

async function fetchJson(path) {
  if (apiBase === null) throw new Error("no backend reachable");
  const r = await fetch((apiBase || "") + path, { cache: "no-store" });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}

// ---- utils -----------------------------------------------------------
function fmt(n, digits = 0) {
  if (!isFinite(n)) return "0";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(digits);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function animNumber(el, to, opts = {}) {
  if (!el) return;
  const from = parseFloat(el.dataset.v || "0");
  const obj = { v: from };
  animate(obj, {
    v: to,
    duration: opts.duration || DUR.num,
    ease: "outExpo",
    onUpdate: () => { el.textContent = fmt(obj.v, opts.digits ?? 0); },
    onComplete: () => { el.dataset.v = to; },
  });
}

// ---- sparkline -------------------------------------------------------
function sparkline(canvas, data, color) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth * dpr;
  const h = canvas.clientHeight * dpr;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  if (!data.length) return;
  const max = Math.max(...data, 1e-9);
  const min = Math.min(...data, 0);
  const pad = 2 * dpr;
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6 * dpr;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / Math.max(1e-9, max - min)) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// ---- charts ----------------------------------------------------------
function baseLineOpts(label, color) {
  return {
    label,
    borderColor: color,
    backgroundColor: color + "22",
    borderWidth: 2,
    tension: 0.35,
    pointRadius: 0,
    pointHoverRadius: 4,
    fill: true,
  };
}

function chartCommon(scales) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    animation: { duration: 700, easing: "easeOutCubic" },
    plugins: {
      legend: { labels: { color: COLORS.axis, font: { family: "JetBrains Mono", size: 11 } } },
      tooltip: {
        backgroundColor: COLORS.tipBg,
        borderColor: COLORS.tipBr,
        borderWidth: 1,
        titleColor: COLORS.tipTxt,
        bodyColor: COLORS.tipTxt,
        padding: 10,
      },
    },
    scales,
  };
}

function axisStyle(extra = {}) {
  const title = { display: true, color: COLORS.axis };
  return Object.assign({
    ticks: { color: COLORS.axis, font: { family: "JetBrains Mono", size: 10 } },
    grid: { color: COLORS.grid, borderColor: COLORS.grid },
    title,
  }, extra);
}

function renderTimeline(daily) {
  const ctx = document.getElementById("chart-timeline");
  const labels = daily.map(d => d.date);
  const datasets = [];
  if (enabled.energy_wh) datasets.push({ ...baseLineOpts("Energy (Wh)", COLORS.amber), data: daily.map(d => d.energy_wh), yAxisID: "y" });
  if (enabled.water_ml)  datasets.push({ ...baseLineOpts("Water (mL)",  COLORS.cyan),  data: daily.map(d => d.water_ml),  yAxisID: "y1" });
  if (enabled.co2_g)     datasets.push({ ...baseLineOpts("CO₂ (g)",     COLORS.coral), data: daily.map(d => d.co2_g),     yAxisID: "y" });
  const cfg = {
    type: "line",
    data: { labels, datasets },
    options: chartCommon({
      x: axisStyle(),
      y:  axisStyle({ position: "left",  title: { display: true, text: "Wh / g", color: "#888" } }),
      y1: axisStyle({ position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "mL", color: "#888" } }),
    }),
  };
  if (timelineChart) timelineChart.destroy();
  timelineChart = new Chart(ctx, cfg);
}

function renderModels(models) {
  const ctx = document.getElementById("chart-models");
  const top = models.slice(0, 10);
  const cfg = {
    type: "bar",
    data: {
      labels: top.map(m => m.model.length > 28 ? m.model.slice(0, 26) + "…" : m.model),
      datasets: [{
        label: "Energy (Wh)",
        data: top.map(m => m.energy_wh),
        backgroundColor: top.map(m => providerColor(m.provider)),
        borderRadius: 4,
      }],
    },
    options: Object.assign(chartCommon({
      x: axisStyle(),
      y: axisStyle(),
    }), { indexAxis: "y", plugins: { legend: { display: false } } }),
  };
  if (modelsChart) modelsChart.destroy();
  modelsChart = new Chart(ctx, cfg);
}

function renderProviders(providers) {
  const ctx = document.getElementById("chart-providers");
  const cfg = {
    type: "bar",
    data: {
      labels: providers.map(p => p.provider),
      datasets: [
        { label: "Energy (Wh)",   data: providers.map(p => p.energy_wh), backgroundColor: COLORS.amber, borderRadius: 4 },
        { label: "Water (mL/10)", data: providers.map(p => p.water_ml / 10), backgroundColor: COLORS.cyan, borderRadius: 4 },
        { label: "CO₂ (g)",       data: providers.map(p => p.co2_g),   backgroundColor: COLORS.coral, borderRadius: 4 },
      ],
    },
    options: chartCommon({ x: axisStyle(), y: axisStyle() }),
  };
  if (providersChart) providersChart.destroy();
  providersChart = new Chart(ctx, cfg);
}

function providerColor(p) {
  const k = (p || "").toLowerCase();
  if (k.includes("anthropic")) return COLORS.green;
  if (k.includes("openai"))    return COLORS.amber;
  if (k.includes("google"))    return COLORS.cyan;
  if (k.includes("github"))    return COLORS.coral;
  if (k.includes("meta"))      return COLORS.violet;
  if (k.includes("deepseek"))  return "#f472b6";
  return "#9ca3af";
}

// ---- SVG: drawable logo (traces stroke on load) ----------------------
function drawLogo() {
  try {
    const [logo] = svg.createDrawable(".logo-path");
    animate(logo, {
      draw: ["0 0", "0 1"],
      duration: DUR.logo,
      ease: "inOutQuad",
    });
  } catch (e) {
    console.warn("logo draw failed", e);
  }
}

// ---- SVG: morphing rank emblem --------------------------------------
function updateRankEmblem(rank) {
  if (currentRankKey === rank.emblem) return;
  currentRankKey = rank.emblem;
  try {
    animate("#rank-emblem-path", {
      d: svg.morphTo(rank.emblem),
      duration: DUR.emblem,
      ease: "inOutSine",
    });
  } catch (e) {
    console.warn("emblem morph failed", e);
  }
}

// ---- SVG: car on motion path ----------------------------------------
function renderCarMotionPath(km) {
  try {
    if (carAnim && carAnim.pause) carAnim.pause();
    const car = document.getElementById("car-rider");
    if (!car) return;
    const motion = svg.createMotionPath("#road-motion-path");
    const duration = DUR.carBase + Math.min(DUR.carCap - DUR.carBase, km * DUR.carKmMul);
    carAnim = animate(car, {
      ...motion,
      duration,
      ease: "linear",
      loop: true,
      alternate: true,
    });
  } catch (e) {
    console.warn("car motion-path failed", e);
  }
}

// ---- SVG: water drops on motion paths -------------------------------
function startWaterDrops() {
  const drops = document.querySelectorAll(".drops-overlay .drop");
  drops.forEach((drop, i) => {
    try {
      const path = drop.getAttribute("data-path");
      const motion = svg.createMotionPath(path);
      animate(drop, {
        ...motion,
        opacity: [
          { from: 0, to: 0.9, duration: 280 },
          { to: 0.9, duration: 900 },
          { to: 0, duration: 420 },
        ],
        scale: [
          { from: 0.6, to: 1.2, duration: 280 },
          { to: 0.9, duration: 1300 },
        ],
        duration: DUR.dropBase + i * DUR.dropStep,
        delay: i * 700,
        ease: "inQuad",
        loop: true,
      });
    } catch (e) {
      console.warn("drop motion failed", e);
    }
  });
}

// ---- SVG: draw tree crowns ------------------------------------------
function drawTreeCrowns(container) {
  try {
    const drawables = svg.createDrawable(container.querySelectorAll(".tree-crown"));
    animate(drawables, {
      draw: ["0 0", "0 1"],
      duration: DUR.crown,
      delay: stagger(DUR.crownStagger, { start: 450 }),
      ease: "inOutQuad",
    });
  } catch (e) {
    console.warn("tree crown draw failed", e);
  }
}

// ---- rank / XP -------------------------------------------------------
function currentRank(tokens) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (tokens >= RANKS[i].min) idx = i;
  const cur = RANKS[idx];
  const nxt = RANKS[idx + 1] || { min: cur.min * 10, name: "???" };
  const span = nxt.min - cur.min;
  const progress = span > 0 ? (tokens - cur.min) / span : 1;
  return { cur, nxt, progress: Math.max(0, Math.min(1, progress)), idx };
}

function renderRank(summary) {
  const { cur, nxt, progress } = currentRank(summary.total_tokens || 0);
  const chip = document.getElementById("rank-chip");
  chip.style.setProperty("--rank-color", cur.color);
  document.getElementById("rank-name").textContent = cur.name;
  document.getElementById("rank-current").textContent = fmt(summary.total_tokens || 0);
  document.getElementById("rank-next").textContent = fmt(nxt.min);
  const fill = document.getElementById("xp-fill");
  fill.style.setProperty("--rank-color", cur.color);
  animate(fill, {
    width: (progress * 100).toFixed(1) + "%",
    duration: DUR.xp,
    ease: "outExpo",
  });
  updateRankEmblem(cur);
}

// ---- hero ------------------------------------------------------------
function renderHero(summary, equiv, daily) {
  const last14 = daily.slice(-14);
  animNumber(document.getElementById("hero-energy"), summary.total_energy_wh, { digits: 1 });
  animNumber(document.getElementById("hero-water"),  summary.total_water_ml,  { digits: 1 });
  animNumber(document.getElementById("hero-co2"),    summary.total_co2_g,     { digits: 2 });
  animNumber(document.getElementById("hero-tokens"), summary.total_tokens,    { digits: 0 });

  document.getElementById("hero-energy-equiv").textContent =
    `≈ ${fmt(equiv.phone_charges, 1)} phone charges · ${fmt(equiv.led_hours, 1)} LED-hrs`;
  document.getElementById("hero-water-equiv").textContent =
    `≈ ${fmt(equiv.water_glasses, 1)} glasses · ${fmt(equiv.showers, 2)} showers`;
  document.getElementById("hero-co2-equiv").textContent =
    `≈ ${fmt(equiv.car_km, 2)} km driven · ${fmt(equiv.trees_per_day, 1)} tree-days`;
  document.getElementById("hero-tokens-equiv").textContent =
    `${summary.record_count} turns · ${summary.models_used.length} model(s)`;

  sparkline(document.getElementById("spark-energy"), last14.map(d => d.energy_wh), COLORS.amber);
  sparkline(document.getElementById("spark-water"),  last14.map(d => d.water_ml),  COLORS.cyan);
  sparkline(document.getElementById("spark-co2"),    last14.map(d => d.co2_g),     COLORS.coral);
  sparkline(document.getElementById("spark-tokens"), last14.map(d => d.tokens),    COLORS.green);

  const period = document.getElementById("period-label");
  if (summary.period_start) {
    const d = s => new Date(s).toISOString().slice(0, 10);
    period.textContent = `${d(summary.period_start)} → ${d(summary.period_end)}  ·  ${summary.providers.join(" · ")}`;
  } else {
    period.textContent = "no data yet — start using your AI coding tools";
  }
}

// ---- streak ---------------------------------------------------------
function computeStreak(daily) {
  if (!daily.length) return 0;
  const byDate = new Set(daily.filter(d => d.tokens > 0).map(d => d.date));
  let n = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - i);
    const iso = day.toISOString().slice(0, 10);
    if (byDate.has(iso)) n++;
    else if (i > 0) break;
  }
  return n;
}

// ---- equivalents viz -----------------------------------------------
function renderGlasses(count) {
  const row = document.getElementById("glasses-row");
  if (!row) return;
  const SLOTS = 10;
  if (row.childElementCount !== SLOTS + 1) {
    row.innerHTML = "";
    for (let i = 0; i < SLOTS; i++) {
      const g = document.createElement("div");
      g.className = "glass";
      g.innerHTML = `<div class="glass-fill" style="height:0%"></div>`;
      row.appendChild(g);
    }
    const over = document.createElement("div");
    over.className = "glass-overflow";
    over.textContent = "";
    row.appendChild(over);
  }
  const fills = Array.from(row.querySelectorAll(".glass-fill"));
  const heights = fills.map((_, i) => Math.max(0, Math.min(1, count - i)) * 100);
  animate(fills, {
    height: (_el, i) => heights[i] + "%",
    duration: DUR.glass,
    delay: stagger(DUR.glassStagger),
    ease: "outElastic(1, .6)",
  });
  const over = row.querySelector(".glass-overflow");
  const extra = Math.max(0, count - SLOTS);
  over.textContent = extra > 0 ? "+" + fmt(extra, 0) : "";
}

function renderBatteries(count) {
  const row = document.getElementById("battery-row");
  if (!row) return;
  const SLOTS = 10;
  if (row.childElementCount !== SLOTS + 1) {
    row.innerHTML = "";
    for (let i = 0; i < SLOTS; i++) {
      const b = document.createElement("div");
      b.className = "battery";
      b.innerHTML = `<div class="battery-fill"></div>`;
      row.appendChild(b);
    }
    const over = document.createElement("div");
    over.className = "battery-overflow";
    row.appendChild(over);
  }
  const fills = Array.from(row.querySelectorAll(".battery-fill"));
  const widths = fills.map((_, i) => Math.max(0, Math.min(1, count - i)) * 100);
  animate(fills, {
    width: (_el, i) => widths[i] + "%",
    duration: DUR.battery,
    delay: stagger(DUR.batteryStagger),
    ease: "outQuart",
  });
  const over = row.querySelector(".battery-overflow");
  const extra = Math.max(0, count - SLOTS);
  over.textContent = extra > 0 ? "+" + fmt(extra, 0) : "";
}

function treeSvg() {
  const hue = 90 + Math.floor(Math.random() * 40);
  const color = `hsl(${hue}, 70%, 42%)`;
  const stroke = `hsl(${hue}, 70%, 70%)`;
  // Using a <path> so svg.createDrawable can trace the outline.
  return `
    <svg class="tree-svg" viewBox="0 0 40 60" aria-hidden="true">
      <rect x="17" y="38" width="6" height="18" fill="#5a3a1a" rx="1"/>
      <path class="tree-crown"
            d="M 20 4 L 36 30 L 24 30 L 32 46 L 8 46 L 16 30 L 4 30 Z"
            fill="${color}" stroke="${stroke}" stroke-width="1.2"/>
    </svg>`;
}

function renderForest(treeDays) {
  const forest = document.getElementById("forest");
  if (!forest) return;
  const visible = Math.max(0, Math.min(Math.round(treeDays), 80));
  const extra = Math.max(0, Math.round(treeDays) - visible);
  if (forest.childElementCount !== visible + (extra > 0 ? 1 : 0)) {
    forest.innerHTML = "";
    for (let i = 0; i < visible; i++) {
      const wrap = document.createElement("span");
      wrap.className = "tree-wrap";
      wrap.innerHTML = treeSvg();
      forest.appendChild(wrap);
    }
    if (extra > 0) {
      const over = document.createElement("span");
      over.className = "forest-overflow";
      over.textContent = "+" + fmt(extra, 0) + " more";
      forest.appendChild(over);
    }
    animate(forest.querySelectorAll(".tree-wrap"), {
      scale: [0, 1],
      translateY: [10, 0],
      duration: DUR.tree,
      delay: stagger(DUR.treeStagger),
      ease: "outElastic(1, .5)",
    });
    drawTreeCrowns(forest);
  }
}

function renderEquivalents(e) {
  animNumber(document.getElementById("eq-glasses"),  e.water_glasses,   { digits: 1 });
  animNumber(document.getElementById("eq-showers"),  e.showers,         { digits: 2 });
  animNumber(document.getElementById("eq-flushes"),  e.toilet_flushes,  { digits: 1 });
  animNumber(document.getElementById("eq-carkm"),    e.car_km,          { digits: 2 });
  animNumber(document.getElementById("eq-netflix"),  e.netflix_hours,   { digits: 1 });
  animNumber(document.getElementById("eq-searches"), e.google_searches, { digits: 0 });
  animNumber(document.getElementById("eq-phones"),   e.phone_charges,   { digits: 1 });
  animNumber(document.getElementById("eq-leds"),     e.led_hours,       { digits: 1 });
  animNumber(document.getElementById("eq-trees"),    e.trees_per_day,   { digits: 2 });
  renderGlasses(e.water_glasses);
  renderBatteries(e.phone_charges);
  renderForest(e.trees_per_day);
  renderCarMotionPath(e.car_km);
}

// ---- leaderboard ----------------------------------------------------
function renderLeaderboard(models) {
  const sorted = [...models].sort((a, b) => b.eco_efficiency_score - a.eco_efficiency_score);
  const tbody = document.querySelector("#leaderboard tbody");
  tbody.innerHTML = "";
  sorted.forEach((m, i) => {
    const row = document.createElement("tr");
    const rank = i + 1;
    const medal =
      rank === 1 ? `<span class="medal medal-1">1</span>` :
      rank === 2 ? `<span class="medal medal-2">2</span>` :
      rank === 3 ? `<span class="medal medal-3">3</span>` :
      `<span class="text-zinc-500">${rank}</span>`;
    row.innerHTML = `
      <td class="pl-0">${medal}</td>
      <td class="text-zinc-200">${escapeHtml(m.model)}</td>
      <td class="text-zinc-500">${escapeHtml(m.provider)}</td>
      <td class="text-right">${fmt(m.tokens, 0)}</td>
      <td class="text-right">${fmt(m.energy_wh, 2)}</td>
      <td class="text-right">${fmt(m.co2_g, 2)}</td>
      <td><div class="score-bar"><span data-score="${m.eco_efficiency_score.toFixed(1)}"></span></div></td>
    `;
    tbody.appendChild(row);
  });

  animate("#leaderboard tbody tr", {
    opacity: [0, 1],
    translateX: [-14, 0],
    duration: DUR.lbRow,
    delay: stagger(DUR.lbRowStagger),
    ease: "outQuart",
  });
  animate("#leaderboard .score-bar > span", {
    width: (el) => el.dataset.score + "%",
    duration: DUR.lbBar,
    delay: stagger(DUR.lbBarStagger, { start: 300 }),
    ease: "outExpo",
  });
}

// ---- achievements ---------------------------------------------------
function seenAchievements() {
  try { return new Set(JSON.parse(localStorage.getItem("ecotoken:ach") || "[]")); }
  catch { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem("ecotoken:ach", JSON.stringify(Array.from(set))); }
  catch {}
}

function fireAchievement(m, accent) {
  const stack = document.getElementById("toast-stack");
  const el = document.createElement("div");
  el.className = "toast";
  el.style.setProperty("--accent", accent || "#39ff14");
  el.innerHTML = `
    <div class="toast-icon">${m.icon}</div>
    <div class="toast-body">
      <div class="toast-kicker">${escapeHtml(m.kicker || "achievement")}</div>
      <div class="toast-title">${escapeHtml(m.title)}</div>
      <div class="toast-sub">${escapeHtml(m.sub || "")}</div>
    </div>`;
  stack.appendChild(el);
  const tl = createTimeline({ defaults: { ease: "outExpo" }, onComplete: () => el.remove() });
  tl.add(el, { translateX: [420, 0], opacity: [0, 1], duration: DUR.toastIn })
    .add(el, { translateX: 0, duration: DUR.toastHold })
    .add(el, { translateX: 480, opacity: 0, duration: DUR.toastOut, ease: "inCubic" });
}

function checkMilestones(summary, equiv) {
  const seen = seenAchievements();
  const fresh = [];
  for (const m of MILESTONES) {
    if (seen.has(m.key)) continue;
    if (m.test(summary, equiv)) {
      fresh.push(m);
      seen.add(m.key);
    }
  }
  saveSeen(seen);
  const rank = currentRank(summary.total_tokens || 0);
  fresh.forEach((m, i) => setTimeout(() => { fireAchievement(m, rank.cur.color); playFanfare(); }, i * 900));
  document.getElementById("ach-count").textContent = seen.size;
}

// ---- reveals --------------------------------------------------------
function revealHero() {
  animate("#hero-grid .stat-card", {
    opacity: [0, 1],
    translateY: [28, 0],
    scale: [0.96, 1],
    duration: DUR.reveal,
    delay: stagger(DUR.heroStagger),
    ease: "outExpo",
  });
}

function setupScrollReveals() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        animate(e.target, {
          opacity: [0, 1],
          translateY: [28, 0],
          duration: DUR.reveal,
          ease: "outExpo",
        });
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: "-10% 0px" });
  document.querySelectorAll(".reveal").forEach(el => {
    if (!el.closest("#hero-grid")) io.observe(el);
  });
}

// ---- hover tilt (plain CSS transform) -------------------------------
function attachTilt(selector, maxDeg = 6) {
  document.querySelectorAll(selector).forEach(card => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        `perspective(900px) rotateX(${(-y * maxDeg).toFixed(2)}deg) rotateY(${(x * maxDeg).toFixed(2)}deg) translateY(-2px)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

// ---- ambient particles ---------------------------------------------
function startParticles() {
  const canvas = document.getElementById("ambient-particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  function resize() {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  }
  resize();
  addEventListener("resize", resize);
  const N = 46;
  const dots = Array.from({ length: N }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: (Math.random() * 1.4 + 0.4) * dpr,
    vy: -(Math.random() * 0.3 + 0.06) * dpr,
    vx: (Math.random() - 0.5) * 0.1 * dpr,
    hue: Math.random() < 0.5 ? 150 : 200,
    a: Math.random() * 0.6 + 0.2,
  }));
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const alpha = parseFloat(cssVar("--particle-alpha")) || 0.35;
    const light = document.documentElement.getAttribute("data-theme") === "light";
    const lum = light ? "45%" : "70%";
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.y < -10) { d.y = canvas.height + 10; d.x = Math.random() * canvas.width; }
      if (d.x < -10) d.x = canvas.width + 10;
      if (d.x > canvas.width + 10) d.x = -10;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${d.hue}, 100%, ${lum}, ${d.a * alpha})`;
      ctx.shadowColor = `hsla(${d.hue}, 100%, ${lum}, 0.9)`;
      ctx.shadowBlur = light ? 2 * dpr : 8 * dpr;
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
}

// ---- banner --------------------------------------------------------
function showBanner(msg) {
  let el = document.getElementById("ecotoken-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "ecotoken-banner";
    el.className = "banner-error";
    document.querySelector("main").prepend(el);
  }
  el.innerHTML = msg;
}
function hideBanner() {
  const el = document.getElementById("ecotoken-banner");
  if (el) el.remove();
}

// ---- main refresh loop ---------------------------------------------
async function refresh() {
  await probeBase();
  if (apiBase === null) {
    showBanner(
      `<strong>no backend reachable.</strong> ` +
      `this dashboard is being served as static HTML but the ecotoken API ` +
      `is not running. start it with <code>cargo run --release</code> ` +
      `(or <code>./target/release/ecotoken</code>) and reload this page.`
    );
    return;
  }
  hideBanner();
  try {
    const [summary, daily, models, providers, equiv] = await Promise.all([
      fetchJson("/api/summary"),
      fetchJson("/api/daily"),
      fetchJson("/api/models"),
      fetchJson("/api/providers"),
      fetchJson("/api/equivalents"),
    ]);
    renderRank(summary);
    renderHero(summary, equiv, daily);
    renderTimeline(daily);
    renderModels(models);
    renderProviders(providers);
    renderEquivalents(equiv);
    renderLeaderboard(models);
    document.getElementById("streak-count").textContent = computeStreak(daily);
    checkMilestones(summary, equiv);
    playRefreshChord();
    if (firstRender) {
      firstRender = false;
      drawLogo();
      startWaterDrops();
      revealHero();
      setupScrollReveals();
    }
  } catch (e) {
    console.error(e);
    showBanner(`<strong>fetch failed:</strong> ${escapeHtml(String(e.message || e))}`);
  }
}

// ---- audio (WebAudio) ----------------------------------------------
let audioCtx = null;
let audioUnlocked = false;
let muted = false;

function ensureAudio() {
  if (!audioCtx && typeof AudioContext !== "undefined") {
    try { audioCtx = new AudioContext(); } catch (_) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function playTone({ freq = 440, type = "sine", duration = 0.12, gain = 0.05, delay = 0, detuneTo = null }) {
  if (!audioUnlocked || muted || !audioCtx) return;
  const now = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (detuneTo != null) {
    osc.frequency.exponentialRampToValueAtTime(detuneTo, now + duration);
  }
  osc.connect(g);
  g.connect(audioCtx.destination);
  const atk = 0.006, rel = 0.12;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + atk);
  g.gain.linearRampToValueAtTime(gain * 0.45, now + atk + duration);
  g.gain.linearRampToValueAtTime(0, now + atk + duration + rel);
  osc.start(now);
  osc.stop(now + atk + duration + rel + 0.05);
}

// A gentle four-note chord, one note per metric. Staggered so each is distinct.
function playRefreshChord() {
  if (!audioUnlocked || muted) return;
  // water → soft ping
  playTone({ freq: 440, type: "sine",     duration: 0.10, gain: 0.05, delay: 0.00 });
  // energy → buzzy rising blip
  playTone({ freq: 660, type: "triangle", duration: 0.08, gain: 0.04, delay: 0.12, detuneTo: 830 });
  // CO₂ → low thud
  playTone({ freq: 140, type: "sine",     duration: 0.18, gain: 0.07, delay: 0.26 });
  // tokens → bell (harmonics)
  playTone({ freq: 880,  type: "sine", duration: 0.12, gain: 0.04,  delay: 0.40 });
  playTone({ freq: 1320, type: "sine", duration: 0.08, gain: 0.025, delay: 0.40 });
}

// Ascending major arpeggio on achievement unlock.
function playFanfare() {
  if (!audioUnlocked || muted) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    playTone({ freq: f, type: "triangle", duration: 0.14, gain: 0.05, delay: i * 0.09 });
  });
}

function playClick() {
  playTone({ freq: 520, type: "sine", duration: 0.04, gain: 0.04 });
}

function updateMuteIcon() {
  const btn = document.getElementById("mute-toggle");
  if (!btn) return;
  btn.classList.toggle("muted", muted);
  const waves = document.getElementById("mute-waves");
  const x = document.getElementById("mute-x");
  if (waves) waves.style.display = muted ? "none" : "";
  if (x)     x.style.display     = muted ? ""     : "none";
  btn.setAttribute("aria-label", muted ? "unmute sound" : "mute sound");
}

function initAudio() {
  try { muted = localStorage.getItem("ecotoken:muted") === "1"; } catch (_) {}
  updateMuteIcon();
  document.getElementById("mute-toggle")?.addEventListener("click", () => {
    muted = !muted;
    try { localStorage.setItem("ecotoken:muted", muted ? "1" : "0"); } catch (_) {}
    updateMuteIcon();
    if (!muted) {
      ensureAudio();
      // Small confirmation chirp so the user hears it worked.
      setTimeout(() => playTone({ freq: 780, type: "sine", duration: 0.08, gain: 0.05 }), 40);
    }
  });
  // Browsers require a user gesture before an AudioContext can play.
  const unlock = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    ensureAudio();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

// ---- theme switcher ------------------------------------------------
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

function applyTheme(theme, animateIcon = true) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("ecotoken:theme", theme); } catch (_) {}
  COLORS = themedColors();
  const rays = document.getElementById("theme-rays");
  const icon = document.getElementById("theme-icon-path");
  if (!icon) return;
  const targetSel = theme === "dark" ? "#theme-target-moon" : "#theme-target-sun";
  const raysOpacity = theme === "dark" ? 0 : 1;
  if (!animateIcon) {
    try { icon.setAttribute("d", document.querySelector(targetSel).getAttribute("d")); } catch (_) {}
    if (rays) rays.style.opacity = raysOpacity;
    return;
  }
  try {
    animate(icon, {
      d: svg.morphTo(targetSel),
      duration: DUR.theme,
      ease: "inOutQuad",
    });
  } catch (e) {
    console.warn("theme morph failed", e);
  }
  if (rays) {
    animate(rays, {
      opacity: raysOpacity,
      scale: theme === "dark" ? 0.6 : 1,
      duration: DUR.rays,
      ease: "outExpo",
    });
  }
  animate(document.getElementById("theme-toggle"), {
    rotate: theme === "dark" ? [0, -40, 0] : [0, 40, 0],
    duration: DUR.theme,
    ease: "outExpo",
  });
  // Let CSS tokens settle, then re-render charts with new colors.
  setTimeout(() => refresh(), 250);
}

function initTheme() {
  let theme = "dark";
  try { theme = localStorage.getItem("ecotoken:theme") || theme; } catch (_) {}
  if (!["dark", "light"].includes(theme)) theme = "dark";
  applyTheme(theme, false);
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
    playClick();
  });
}

// ---- wiring --------------------------------------------------------
document.querySelectorAll(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const m = btn.dataset.metric;
    enabled[m] = !enabled[m];
    btn.classList.toggle("active", enabled[m]);
    refresh();
  });
});

// ---- boot ----------------------------------------------------------
initAudio();
initTheme();
startParticles();
attachTilt(".stat-card", 7);
attachTilt(".viz-card", 4);
refresh();
setInterval(refresh, 60_000);
