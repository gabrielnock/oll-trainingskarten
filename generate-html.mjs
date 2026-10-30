import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ollData = JSON.parse(readFileSync(join(__dirname, "all-data.json"), "utf8"));
const cacheDir = join(__dirname, "svg-cache");
mkdirSync(cacheDir, { recursive: true });

const algOrderLibJs = readFileSync(join(__dirname, "alg-order-lib.mjs"), "utf8")
  .replace(/^export /gm, "")
  .replace(/\nexport \{[\s\S]*?\}\s*$/m, "\n");

/** Recolor VisualCube defaults to match the page palette. */
const COLOR_MAP = {
  "#FEFE00": "#E8C20A", // yellow stickers (brighter gold)
  "#404040": "#424656", // dark grey → slate
};

const GROUP_BY_ID = Object.fromEntries(
  (ollData.groups || []).map((g) => [g.id, g])
);

function visualUrl(setup, size = 200) {
  const params = new URLSearchParams({
    fmt: "svg",
    size: String(size),
    view: "plan",
    stage: "oll",
    bg: "t",
    alg: setup || "R U R' U R U2' R'",
  });
  return `https://visualcube.api.cubing.net/?${params}`;
}

function recolorSvg(svg, extraClass = "") {
  let out = svg
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .trim();
  for (const [from, to] of Object.entries(COLOR_MAP)) {
    out = out.replaceAll(from, to);
    out = out.replaceAll(from.toLowerCase(), to);
  }
  const cls = ["cube-svg", extraClass].filter(Boolean).join(" ");
  out = out.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    if (/\bclass\s*=/.test(attrs)) {
      return `<svg${attrs.replace(/\bclass=(['"])(.*?)\1/, `class=$1$2 ${cls}$1`)}>`;
    }
    return `<svg class="${cls}"${attrs}>`;
  });
  return out;
}

async function fetchCubeSvg(setup, size, extraClass = "") {
  const key = createHash("sha1").update(`${size}|${setup || ""}`).digest("hex");
  const cachePath = join(cacheDir, `${key}.svg`);
  let raw;
  if (existsSync(cachePath)) {
    raw = readFileSync(cachePath, "utf8");
  } else {
    const res = await fetch(visualUrl(setup, size));
    if (!res.ok) throw new Error(`VisualCube ${res.status} for size=${size}`);
    raw = await res.text();
    writeFileSync(cachePath, raw, "utf8");
  }
  return recolorSvg(raw, extraClass);
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeAlg(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const alg = entry.trim();
    return alg ? { alg, order: null, tip: "" } : null;
  }
  const alg = String(entry.alg || "").trim();
  if (!alg) return null;
  const order =
    entry.order != null && Number.isFinite(Number(entry.order))
      ? Number(entry.order)
      : null;
  return {
    alg,
    order,
    tip: String(entry.tip || "").trim(),
  };
}

const cardsBase = (ollData.cases || []).map((c) => {
  const meta = GROUP_BY_ID[c.group] || {
    id: c.group,
    label: c.group,
    order: 99,
  };
  const primary = normalizeAlg(c.primary);
  const secondary = normalizeAlg(c.secondary);
  if (!primary) throw new Error("Case #" + c.num + " is missing primary.alg");
  return {
    num: c.num,
    group: meta.label,
    slug: meta.id,
    order: meta.order,
    name: c.name || `OLL ${c.num}`,
    setup: c.setup,
    primary: primary.alg,
    primaryOrder: primary.order,
    tip: primary.tip,
    secondary: secondary ? secondary.alg : "",
    secondaryOrder: secondary ? secondary.order : null,
    secondaryTip: secondary ? secondary.tip : "",
  };
});

console.log(`Fetching ${cardsBase.length} cube SVGs…`);
const cards = await mapPool(cardsBase, 8, async (c) => {
  const [svg, thumbSvg] = await Promise.all([
    fetchCubeSvg(c.setup, 200),
    fetchCubeSvg(c.setup, 56, "cube-thumb"),
  ]);
  process.stdout.write(`  #${c.num} `);
  return { ...c, svg, thumbSvg };
});
console.log("\nSVGs ready.");

const groups = [...new Set(cards.map((c) => c.slug))]
  .map((slug) => {
    const sample = cards.find((c) => c.slug === slug);
    return {
      slug,
      label: sample.group,
      order: sample.order,
      cases: cards.filter((c) => c.slug === slug).sort((a, b) => a.num - b.num),
    };
  })
  .sort((a, b) => a.order - b.order);

function cardHtml(c) {
  const tip = c.tip
    ? `<div class="inline-box tip-box alg-meta" data-alg-tip-box><span class="inline-label" title="Tip"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span class="sr-only">Tip</span></span><span class="inline-value" data-alg-tip>${esc(c.tip)}</span></div>`
    : "";
  const primaryOrderAttr =
    c.primaryOrder != null ? ` data-order-default="${esc(String(c.primaryOrder))}"` : "";
  const secondaryOrderAttr =
    c.secondaryOrder != null ? ` data-order-default="${esc(String(c.secondaryOrder))}"` : "";
  const altRow = c.secondary
    ? `
        <div class="alg-row" data-slot="secondary" data-builtin="1">
          <div class="alg-body">
            <div class="alg-tools screen-only">
              <button type="button" class="btn-alg-tool" data-edit="secondary" data-tooltip="Edit" aria-label="Edit algorithm"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
              <span class="alg-order" data-alg-order-wrap data-tooltip="Order of permutation — times to repeat this alg to return to start" aria-label="Order of permutation">
                <span class="alg-order-n" data-alg-order>?</span>
              </span>
              <label class="fav" data-tooltip="Favorite" aria-label="Favorite">
                <input type="checkbox" data-fav="secondary" />
                <span>★</span>
              </label>
            </div>
            <p class="alg" data-alg-text data-alg-raw="${esc(c.secondary)}" data-alg-default="${esc(c.secondary)}" data-tip-default="${esc(c.secondaryTip || "")}"${secondaryOrderAttr}>${esc(c.secondary)}</p>
          </div>
        </div>`
    : "";

  return `
  <div class="case-row" data-case="${c.num}" data-group="${c.slug}" data-status="red" id="oll-${c.num}">
    <article class="card">
      <header class="card-header">
        <span class="group">${esc(c.group)}</span>
      </header>
      <div class="title-row">
        <h1 class="title">${esc(c.name)}</h1>
        <span class="case-no">#${c.num}</span>
        <button type="button" class="status-toggle screen-only" data-status-toggle aria-expanded="false" aria-label="Learning status" title="Status">
          <span class="status-pip" aria-hidden="true"></span>
        </button>
      </div>
      <div class="inline-box setup-box">
        <span class="inline-label" title="Setup"><i class="fa-solid fa-shuffle" aria-hidden="true"></i><span class="sr-only">Setup</span></span>
        <span class="inline-value alg">${esc(c.setup)}</span>
      </div>
      <div class="diagram-tools screen-only">
        <button type="button" class="btn-rotate" data-rotate="-90" title="Rotate 90° left" aria-label="Rotate diagram 90 degrees counter-clockwise">
          <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
        </button>
        <button type="button" class="btn-rotate" data-rotate="90" title="Rotate 90° right" aria-label="Rotate diagram 90 degrees clockwise">
          <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
        </button>
      </div>
      <figure class="diagram">
        ${c.svg}
      </figure>
      <div class="alg-list" data-alg-list>
        <div class="alg-row" data-slot="primary" data-builtin="1">
          <div class="alg-body">
            <div class="alg-tools screen-only">
              <button type="button" class="btn-alg-tool" data-edit="primary" data-tooltip="Edit" aria-label="Edit algorithm"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
              <span class="alg-order" data-alg-order-wrap data-tooltip="Order of permutation — times to repeat this alg to return to start" aria-label="Order of permutation">
                <span class="alg-order-n" data-alg-order>?</span>
              </span>
              <label class="fav" data-tooltip="Favorite" aria-label="Favorite">
                <input type="checkbox" data-fav="primary" checked />
                <span>★</span>
              </label>
            </div>
            <p class="alg primary" data-alg-text data-alg-raw="${esc(c.primary)}" data-alg-default="${esc(c.primary)}" data-tip-default="${esc(c.tip)}"${primaryOrderAttr}>${esc(c.primary)}</p>
            ${tip}
          </div>
        </div>${altRow}
      </div>
      <div class="card-actions screen-only">
        <button type="button" class="btn-card-quiet btn-show-hidden" data-show-hidden hidden title="Show hidden algorithms" aria-label="Show hidden algorithms">
          <i class="fa-solid fa-eye" aria-hidden="true"></i>
          <span class="n" data-hidden-count>0</span>
        </button>
        <button type="button" class="btn-card-quiet btn-add-alg" data-add-alg title="Add algorithm" aria-label="Add algorithm">+</button>
      </div>
    </article>
    <aside class="status-panel screen-only" aria-label="Learning status">
      <label class="status-opt red" title="Not learned">
        <input type="checkbox" data-status="red" checked />
        <span class="dot"></span>
        <span class="status-text">Not learned</span>
      </label>
      <label class="status-opt orange" title="Learning">
        <input type="checkbox" data-status="orange" />
        <span class="dot"></span>
        <span class="status-text">Learning</span>
      </label>
      <label class="status-opt green" title="Learned">
        <input type="checkbox" data-status="green" />
        <span class="dot"></span>
        <span class="status-text">Learned</span>
      </label>
    </aside>
  </div>`;
}

const navLinks = groups
  .map(
    (g) =>
      `<a class="nav-chip" href="#${g.slug}" data-group-nav="${g.slug}">` +
      `<span class="nav-chip-label">${esc(g.label)}</span>` +
      `<span class="nav-chip-bar" aria-hidden="true">` +
      `<span class="nav-chip-seg red" data-seg="red"></span>` +
      `<span class="nav-chip-seg orange" data-seg="orange"></span>` +
      `<span class="nav-chip-seg green" data-seg="green"></span>` +
      `</span></a>`
  )
  .join("\n        ");

const practiceGroupChecks = groups
  .map(
    (g) =>
      `<label class="practice-check practice-check-group" data-practice-group-bar="${g.slug}">` +
      `<input type="checkbox" data-practice-group="${g.slug}" />` +
      `<span class="practice-check-label">${esc(g.label)}</span>` +
      `<span class="nav-chip-bar" aria-hidden="true">` +
      `<span class="nav-chip-seg red" data-seg="red"></span>` +
      `<span class="nav-chip-seg orange" data-seg="orange"></span>` +
      `<span class="nav-chip-seg green" data-seg="green"></span>` +
      `</span></label>`
  )
  .join("\n          ");

const groupSections = groups
  .map((g) => {
    const list = g.cases
      .map(
        (c) => `
      <div class="ref-row" data-case="${c.num}" data-status="red">
        <a class="ref-link" href="#oll-${c.num}">
          <strong>#${c.num}</strong>
          <span class="thumb">${c.thumbSvg}</span>
          <span>${esc(c.name)}</span>
        </a>
        <span class="ref-alg" data-ref-alg>${esc(c.primary)}</span>
      </div>`
      )
      .join("");
    return `
  <section class="group-section" id="${g.slug}" data-group="${g.slug}">
    <h2 class="group-heading">${esc(g.label)}</h2>
    <div class="ref-list">${list}</div>
    <div class="cards">${g.cases.map(cardHtml).join("\n")}</div>
  </section>`;
  })
  .join("\n");

const clientJs = `
(() => {
  ${algOrderLibJs}

  const STORAGE_KEY = "oll-all-data-v3";
  const FILE_NAME = "all-data.json";
  const EMBEDDED_ALL_DATA = ${JSON.stringify(ollData)};

  let state = cloneData(EMBEDDED_ALL_DATA);
  let modalCase = null;
  let modalEditSlot = null;
  let hiddenModalCase = null;
  let practiceOn = false;
  let practiceIndex = 0;
  let practiceQueue = [];
  let practiceShuffle = true;
  let touchStartX = null;

  function cloneData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function normalizeAlgSide(entry) {
    if (!entry) return null;
    if (typeof entry === "string") {
      const alg = entry.trim();
      return alg ? { alg: alg, order: null } : null;
    }
    if (typeof entry !== "object") return null;
    const alg = String(entry.alg || "").trim();
    if (!alg) return null;
    const out = { alg: alg };
    if (entry.order != null && Number.isFinite(Number(entry.order))) {
      out.order = Number(entry.order);
    }
    const tip =
      typeof entry.tip === "string"
        ? entry.tip.trim()
        : typeof entry.note === "string"
          ? entry.note.trim()
          : "";
    if (tip) out.tip = tip;
    return out;
  }

  function normalizeCustomEntry(item) {
    return normalizeAlgSide(item) || { alg: String(item || "") };
  }

  function normalizeCase(raw) {
    const c = Object.assign({}, raw || {});
    c.num = Number(c.num);
    c.primary = normalizeAlgSide(c.primary) || { alg: "" };
    c.secondary = normalizeAlgSide(c.secondary);
    if (!Array.isArray(c.custom)) c.custom = [];
    c.custom = c.custom.map(normalizeCustomEntry).filter((e) => e && e.alg);
    if (!c.favorite) c.favorite = "primary";
    if (!Array.isArray(c.hidden)) c.hidden = [];
    c.hidden = c.hidden.map(String).filter(Boolean);
    if (!Array.isArray(c.discarded)) c.discarded = [];
    c.discarded = c.discarded.map(String).filter(Boolean);
    if (c.status === "yellow") c.status = "orange";
    if (c.status !== "red" && c.status !== "orange" && c.status !== "green") c.status = "red";
    // Drop legacy overlay maps if present
    delete c.algs;
    delete c.orders;
    delete c.tips;
    delete c.note;
    delete c.notes;
    return c;
  }

  function casesToMap(cases) {
    const map = {};
    (cases || []).forEach((raw) => {
      const c = normalizeCase(raw);
      if (!Number.isFinite(c.num)) return;
      map[String(c.num)] = c;
    });
    return map;
  }

  function casesToArray(map) {
    return Object.keys(map)
      .map((k) => map[k])
      .sort((a, b) => a.num - b.num);
  }

  function exportableState() {
    return {
      version: 3,
      updatedAt: state.updatedAt || null,
      groups: state.groups || EMBEDDED_ALL_DATA.groups || [],
      cases: casesToArray(state.cases),
    };
  }

  function mergeLegacyProgress(baseData, progress) {
    const merged = cloneData(baseData);
    const map = casesToMap(merged.cases);
    const src = progress && progress.cases ? progress.cases : {};
    Object.keys(src).forEach((key) => {
      const p = src[key] || {};
      if (!map[key]) {
        map[key] = normalizeCase({ num: Number(key), primary: { alg: "" }, ...p });
        return;
      }
      const c = map[key];
      if (p.status) c.status = p.status;
      if (p.favorite) c.favorite = p.favorite;
      if (Array.isArray(p.hidden)) c.hidden = p.hidden.map(String);
      if (Array.isArray(p.discarded)) c.discarded = p.discarded.map(String);
      if (Array.isArray(p.custom)) c.custom = p.custom.map(normalizeCustomEntry);
      if (p.algs && typeof p.algs === "object") {
        if (typeof p.algs.primary === "string" && p.algs.primary.trim()) {
          c.primary = c.primary || { alg: "" };
          c.primary.alg = p.algs.primary.trim();
        }
        if (typeof p.algs.secondary === "string" && p.algs.secondary.trim()) {
          c.secondary = c.secondary || { alg: "" };
          c.secondary.alg = p.algs.secondary.trim();
        }
      }
      if (p.orders && typeof p.orders === "object") {
        if (p.orders.primary != null && c.primary) c.primary.order = Number(p.orders.primary);
        if (p.orders.secondary != null && c.secondary) {
          c.secondary.order = Number(p.orders.secondary);
        }
      }
      if (p.tips && typeof p.tips === "object") {
        if (typeof p.tips.primary === "string" && c.primary) c.primary.tip = p.tips.primary;
        if (typeof p.tips.secondary === "string") {
          c.secondary = c.secondary || { alg: "" };
          c.secondary.tip = p.tips.secondary;
        }
      }
      if (typeof p.note === "string" && p.note.trim() && c.primary && !c.primary.tip) {
        c.primary.tip = p.note.trim();
      }
      map[key] = normalizeCase(c);
    });
    merged.cases = casesToArray(map);
    merged.version = 3;
    merged.updatedAt = progress.updatedAt || null;
    return merged;
  }

  function applyParsedState(parsed) {
    if (!parsed) throw new Error("Invalid data file");
    let next;
    if (Array.isArray(parsed.cases) && parsed.groups) {
      next = {
        version: 3,
        updatedAt: parsed.updatedAt || null,
        groups: parsed.groups,
        cases: casesToMap(parsed.cases),
      };
    } else if (parsed.cases && typeof parsed.cases === "object" && !Array.isArray(parsed.cases)) {
      // Legacy progress-only file
      const merged = mergeLegacyProgress(EMBEDDED_ALL_DATA, parsed);
      next = {
        version: 3,
        updatedAt: merged.updatedAt || null,
        groups: merged.groups,
        cases: casesToMap(merged.cases),
      };
    } else {
      throw new Error("Invalid data file");
    }
    // Ensure every embedded case exists
    const baseMap = casesToMap(EMBEDDED_ALL_DATA.cases);
    Object.keys(baseMap).forEach((k) => {
      if (!next.cases[k]) next.cases[k] = baseMap[k];
      else {
        // Keep identity fields from base if missing
        const b = baseMap[k];
        const c = next.cases[k];
        if (!c.name) c.name = b.name;
        if (!c.setup) c.setup = b.setup;
        if (!c.group) c.group = b.group;
        if (!c.primary || !c.primary.alg) c.primary = b.primary;
        if (c.secondary == null && b.secondary) c.secondary = b.secondary;
        next.cases[k] = normalizeCase(c);
      }
    });
    state = next;
  }

  function ensure(num) {
    const key = String(num);
    if (!state.cases[key]) {
      const base = casesToMap(EMBEDDED_ALL_DATA.cases)[key];
      state.cases[key] = normalizeCase(
        base || { num: Number(num), primary: { alg: "" }, status: "red", favorite: "primary" }
      );
    } else {
      state.cases[key] = normalizeCase(state.cases[key]);
    }
    return state.cases[key];
  }

  function setStamp(text) {
    const stamp = document.getElementById("save-stamp");
    if (stamp) stamp.textContent = text || "";
  }

  function saveLocal() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exportableState()));
    setStamp("Saved · " + new Date().toLocaleTimeString());
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Migrate old progress key if present
        const legacy = localStorage.getItem("oll-progress-v1");
        if (!legacy) return false;
        applyParsedState(JSON.parse(legacy));
        saveLocal();
        return true;
      }
      applyParsedState(JSON.parse(raw));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadRemoteData() {
    try {
      const res = await fetch(FILE_NAME, { cache: "no-store" });
      if (!res.ok) return false;
      const parsed = await res.json();
      applyParsedState(parsed);
      // Seed only — do not overwrite an existing local save on later visits.
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(exportableState()));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadProgress() {
    // Prefer browser storage so imports / learning survive reopen.
    // Remote / embedded all-data.json is only the first-visit default.
    if (loadLocal()) return "local";
    if (await loadRemoteData()) return "online";
    applyParsedState(EMBEDDED_ALL_DATA);
    return "embedded";
  }

  function exportFile() {
    state.updatedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(exportableState(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = FILE_NAME;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyParsedState(JSON.parse(reader.result));
        saveLocal();
        applyAll();
      } catch (err) {
        alert("Could not import data file: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  function makeCustomRow(slot, entry) {
    const row = document.createElement("div");
    row.className = "alg-row";
    row.dataset.slot = slot;
    row.innerHTML =
      '<div class="alg-body">' +
      '<div class="alg-tools screen-only">' +
      '<button type="button" class="btn-alg-tool" data-edit="' + slot + '" data-tooltip="Edit" aria-label="Edit algorithm"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>' +
      '<span class="alg-order" data-alg-order-wrap data-tooltip="Order of permutation — times to repeat this alg to return to start" aria-label="Order of permutation">' +
      '<span class="alg-order-n" data-alg-order>?</span>' +
      "</span>" +
      '<label class="fav" data-tooltip="Favorite" aria-label="Favorite">' +
      '<input type="checkbox" data-fav="' + slot + '" />' +
      "<span>★</span></label>" +
      "</div>" +
      '<p class="alg" data-alg-text></p>' +
      "</div>";
    const algEl = row.querySelector("[data-alg-text]");
    algEl.dataset.algRaw = entry.alg;
    algEl.textContent = entry.alg;
    return row;
  }

  function slotAlgEntry(data, slot, create) {
    if (slot === "primary") {
      if (!data.primary && create) data.primary = { alg: "" };
      return data.primary || null;
    }
    if (slot === "secondary") {
      if (!data.secondary && create) data.secondary = { alg: "" };
      return data.secondary || null;
    }
    const m = /^custom-(\\d+)$/.exec(String(slot));
    if (!m) return null;
    return data.custom[Number(m[1])] || null;
  }

  function readStoredOrder(data, slot) {
    const entry = slotAlgEntry(data, slot, false);
    if (entry && entry.order != null && Number.isFinite(Number(entry.order))) {
      return Number(entry.order);
    }
    return null;
  }

  function writeStoredOrder(data, slot, order) {
    const entry = slotAlgEntry(data, slot, true);
    if (!entry) return;
    if (order == null || !Number.isFinite(Number(order))) delete entry.order;
    else entry.order = Number(order);
  }

  function readStoredAlg(data, slot) {
    const entry = slotAlgEntry(data, slot, false);
    return entry && typeof entry.alg === "string" && entry.alg.trim() ? entry.alg : null;
  }

  function writeStoredAlg(data, slot, alg) {
    const text = String(alg || "").trim();
    const entry = slotAlgEntry(data, slot, true);
    if (!entry) return;
    entry.alg = text;
  }

  function readStoredTip(data, slot) {
    const entry = slotAlgEntry(data, slot, false);
    if (!entry) return null;
    if (typeof entry.tip === "string") return entry.tip;
    if (typeof entry.note === "string") return entry.note;
    return null;
  }

  function writeStoredTip(data, slot, tip) {
    const text = String(tip || "").trim();
    const entry = slotAlgEntry(data, slot, true);
    if (!entry) return;
    delete entry.note;
    if (!text) delete entry.tip;
    else entry.tip = text;
  }

  function tipHtml(text) {
    return (
      '<div class="inline-box tip-box alg-meta" data-alg-tip-box>' +
      '<span class="inline-label" title="Tip"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span class="sr-only">Tip</span></span>' +
      '<span class="inline-value" data-alg-tip>' +
      escHtml(text) +
      "</span></div>"
    );
  }

  function syncAlgTip(algRow, caseNum) {
    const body = algRow.querySelector(".alg-body");
    const text = algRow.querySelector("[data-alg-text]");
    if (!body || !text) return;
    const data = ensure(caseNum);
    const slot = algRow.dataset.slot;
    const stored = readStoredTip(data, slot);
    const tipText =
      stored != null ? String(stored).trim() : String(text.dataset.tipDefault || "").trim();
    let box = body.querySelector("[data-alg-tip-box]");
    if (!tipText) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      body.insertAdjacentHTML("beforeend", tipHtml(tipText));
      return;
    }
    const val = box.querySelector("[data-alg-tip]");
    if (val) val.textContent = tipText;
  }

  function ensureAlgLine(algRow) {
    const body = algRow.querySelector(".alg-body");
    const text = algRow.querySelector("[data-alg-text]");
    if (!body || !text) return null;
    body.querySelectorAll(".note-box, [data-alg-order-box]").forEach((el) => el.remove());
    text.removeAttribute("contenteditable");
    text.removeAttribute("spellcheck");
    const tipLabel = body.querySelector(".tip-box .inline-label");
    if (tipLabel && !tipLabel.querySelector("i")) {
      tipLabel.title = "Tip";
      tipLabel.innerHTML =
        '<i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span class="sr-only">Tip</span>';
    }
    // Unwrap legacy .alg-line wrappers
    const legacyLine = text.closest(".alg-line");
    if (legacyLine && legacyLine.parentNode === body) {
      while (legacyLine.firstChild) body.insertBefore(legacyLine.firstChild, legacyLine);
      legacyLine.remove();
    }
    let tools = body.querySelector(".alg-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "alg-tools screen-only";
      body.insertBefore(tools, body.firstChild);
    }
    let wrap = tools.querySelector("[data-alg-order-wrap]");
    if (!wrap) {
      wrap = body.querySelector("[data-alg-order-wrap]");
    }
    if (!wrap) {
      wrap = document.createElement("span");
      wrap.className = "alg-order";
      wrap.dataset.algOrderWrap = "1";
      wrap.dataset.tooltip =
        "Order of permutation — times to repeat this alg to return to start";
      wrap.setAttribute("aria-label", "Order of permutation");
      wrap.innerHTML = '<span class="alg-order-n" data-alg-order>?</span>';
    } else {
      wrap.querySelectorAll("i, input").forEach((el) => el.remove());
      if (!wrap.querySelector("[data-alg-order]")) {
        wrap.innerHTML = '<span class="alg-order-n" data-alg-order>?</span>';
      }
    }
    // Keep order between edit pen and favorite star
    const fav = tools.querySelector(".fav");
    if (fav) tools.insertBefore(wrap, fav);
    else tools.appendChild(wrap);
    return wrap.querySelector("[data-alg-order]");
  }

  function ensureAlgOrderMeta(algRow, caseNum) {
    const text = algRow.querySelector("[data-alg-text]");
    const orderEl = ensureAlgLine(algRow);
    if (!text || !orderEl) return;
    const data = ensure(caseNum);
    const slot = algRow.dataset.slot;
    const stored = readStoredAlg(data, slot);
    if (stored != null) {
      text.dataset.algRaw = stored;
    } else if (!text.dataset.algRaw) {
      text.dataset.algRaw = text.textContent.trim();
    }
    const raw = text.dataset.algRaw || "";
    const computed = computeAlgOrder(raw);
    const storedOrder = readStoredOrder(data, slot);
    const defaultAlg = text.dataset.algDefault || "";
    const defaultOrderRaw = text.dataset.orderDefault;
    const defaultOrder =
      defaultOrderRaw != null &&
      defaultOrderRaw !== "" &&
      Number.isFinite(Number(defaultOrderRaw))
        ? Number(defaultOrderRaw)
        : null;
    const order =
      storedOrder != null
        ? storedOrder
        : raw === defaultAlg && defaultOrder != null
          ? defaultOrder
          : computed;
    orderEl.textContent = order != null ? String(order) : "?";
    const title =
      storedOrder != null
        ? "Order of permutation: " +
          storedOrder +
          " (override · computed " +
          (computed != null ? computed : "?") +
          ") — times to repeat this alg to return to start"
        : order != null
          ? "Order of permutation: " +
            order +
            " — times to repeat this alg to return to start"
          : "Order of permutation unknown — could not compute";
    const wrap = orderEl.closest("[data-alg-order-wrap]");
    if (wrap) {
      wrap.dataset.tooltip = title;
      wrap.setAttribute("aria-label", title);
      wrap.classList.toggle("is-override", storedOrder != null);
    }
    syncAlgTip(algRow, caseNum);
  }

  function parseLeadingY(alg) {
    const trimmed = String(alg || "").trim();
    const m = trimmed.match(/^(y2'|y2|y'|y)(?:\\s+|$)(.*)$/i);
    if (!m) return { auf: null, rest: trimmed, deg: 0 };
    const token = m[1].toLowerCase();
    let deg = 0;
    if (token === "y") deg = 90;
    else if (token === "y'") deg = -90;
    else deg = 180;
    return { auf: m[1], rest: (m[2] || "").trim(), deg };
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderAlgDisplay(el, raw, fadeAuf) {
    if (!el) return 0;
    if (!el.dataset.algRaw) el.dataset.algRaw = raw;
    const source = el.dataset.algRaw || raw || "";
    const { auf, rest, deg } = parseLeadingY(source);
    if (fadeAuf && auf) {
      el.innerHTML =
        '<span class="alg-auf">' + escHtml(auf) + "</span>" +
        (rest ? ' <span class="alg-rest">' + escHtml(rest) + "</span>" : "");
      return deg;
    }
    el.textContent = source;
    return 0;
  }

  function normDeg(deg) {
    return ((Number(deg) || 0) % 360 + 360) % 360;
  }

  function getManualRot(row) {
    return normDeg(row.dataset.manualRot);
  }

  function applyDiagramRotation(row, aufDeg) {
    const figure = row.querySelector(".diagram");
    const svg = figure?.querySelector(".cube-svg");
    if (!svg) return;
    if (aufDeg != null) row.dataset.aufRot = String(normDeg(aufDeg));
    const manual = getManualRot(row);
    const total = normDeg(Number(row.dataset.aufRot || 0) + manual);
    const rot = "rotate(" + total + "deg)";
    svg.style.transform = rot;
    document
      .querySelectorAll('.ref-row[data-case="' + row.dataset.case + '"] .cube-thumb, .ref-row[data-case="' + row.dataset.case + '"] .thumb .cube-svg')
      .forEach((thumb) => {
        thumb.style.transform = rot;
      });
    const twisted = manual !== 0;
    row.classList.toggle("diagram-twisted", twisted);
    if (figure) {
      figure.classList.toggle("is-rotated", twisted);
      figure.title = twisted
        ? "Rotated view — algs assume original orientation. Click image to reset."
        : "";
    }
  }

  function nudgeDiagramRotation(row, delta) {
    row.dataset.manualRot = String(normDeg(getManualRot(row) + delta));
    applyDiagramRotation(row);
  }

  function resetDiagramRotation(row) {
    if (getManualRot(row) === 0) return;
    row.dataset.manualRot = "0";
    applyDiagramRotation(row);
  }

  function syncCustomRows(row) {
    const data = ensure(row.dataset.case);
    const list = row.querySelector("[data-alg-list]");
    if (!list) return;
    list.querySelectorAll('.alg-row[data-slot^="custom-"]').forEach((el) => el.remove());
    data.custom.forEach((entry, i) => {
      list.appendChild(makeCustomRow("custom-" + i, normalizeCustomEntry(entry)));
    });
  }

  function syncRefAlg(row) {
    const list = row.querySelector("[data-alg-list]");
    const favRow =
      list?.querySelector(".alg-row.is-favorite") ||
      list?.querySelector('[data-slot="primary"]');
    const algEl = favRow?.querySelector("[data-alg-text]");
    const raw = algEl?.dataset.algRaw || algEl?.textContent?.trim() || "";
    const { auf, rest } = parseLeadingY(raw);
    document.querySelectorAll('.ref-row[data-case="' + row.dataset.case + '"] [data-ref-alg]').forEach((el) => {
      if (auf) {
        el.innerHTML =
          '<span class="alg-auf">' + escHtml(auf) + "</span>" +
          (rest ? " " + escHtml(rest) : "");
      } else {
        el.textContent = raw;
      }
    });
  }

  function captureAlgPositions(items) {
    const map = new Map();
    items.forEach((el) => {
      map.set(el, el.getBoundingClientRect());
    });
    return map;
  }

  function playAlgFlip(ordered, first) {
    if (!first || ordered.length < 2) return;
    const inversions = [];
    ordered.forEach((el) => {
      const f = first.get(el);
      if (!f) return;
      const last = el.getBoundingClientRect();
      const dx = f.left - last.left;
      const dy = f.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      inversions.push({ el, dx, dy });
    });
    if (!inversions.length) return;

    inversions.forEach(({ el, dx, dy }) => {
      el.classList.add("is-flipping");
      el.style.transition = "none";
      el.style.transform = "translate(" + dx + "px, " + dy + "px)";
    });

    void ordered[0].offsetWidth;

    requestAnimationFrame(() => {
      inversions.forEach(({ el }) => {
        el.style.transition = "transform 0.82s cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = "translate(0, 0)";
      });
    });

    inversions.forEach(({ el }) => {
      const done = (e) => {
        if (e.propertyName && e.propertyName !== "transform") return;
        el.style.transition = "";
        el.style.transform = "";
        el.classList.remove("is-flipping");
        el.removeEventListener("transitionend", done);
      };
      el.addEventListener("transitionend", done);
    });
  }

  function hiddenSet(data) {
    return new Set(Array.isArray(data.hidden) ? data.hidden.map(String) : []);
  }

  function discardedSet(data) {
    return new Set(Array.isArray(data.discarded) ? data.discarded.map(String) : []);
  }

  function absentSet(data) {
    return new Set([...hiddenSet(data), ...discardedSet(data)]);
  }

  function applyHiddenUi(row) {
    const data = ensure(row.dataset.case);
    const absent = absentSet(data);
    const hidden = hiddenSet(data);
    const list = row.querySelector("[data-alg-list]");
    if (list) {
      list.querySelectorAll(".alg-row").forEach((r) => {
        const isGone = absent.has(r.dataset.slot);
        r.hidden = isGone;
        r.classList.toggle("is-alg-hidden", isGone);
      });
    }
    const showBtn = row.querySelector("[data-show-hidden]");
    if (showBtn) {
      const n = hidden.size;
      showBtn.hidden = n === 0;
      const count = showBtn.querySelector("[data-hidden-count]");
      if (count) count.textContent = String(n);
    }
  }

  function hideAlg(row, slot) {
    const data = ensure(row.dataset.case);
    if (!Array.isArray(data.hidden)) data.hidden = [];
    const absent = absentSet(data);
    if (absent.has(slot)) return;
    const visible = [...row.querySelectorAll(".alg-row")].filter(
      (r) => !absent.has(r.dataset.slot) && r.dataset.slot !== slot
    );
    if (!visible.length) return;
    data.hidden.push(slot);
    if (data.favorite === slot) data.favorite = visible[0].dataset.slot;
    saveLocal();
    applyAlgOrder(row, false);
  }

  function unhideAlg(caseNum, slot) {
    const data = ensure(caseNum);
    if (!Array.isArray(data.hidden)) data.hidden = [];
    data.hidden = data.hidden.filter((s) => String(s) !== String(slot));
    saveLocal();
    const row = document.querySelector('.case-row[data-case="' + caseNum + '"]');
    if (row) applyAlgOrder(row, false);
    if (hiddenModalCase === caseNum) {
      if (!data.hidden.length) closeHiddenModal();
      else refreshHiddenModal();
    }
  }

  function afterHiddenListChange(caseNum) {
    const data = ensure(caseNum);
    const row = document.querySelector('.case-row[data-case="' + caseNum + '"]');
    if (row) {
      syncCustomRows(row);
      applyAlgOrder(row, false);
    }
    if (hiddenModalCase === caseNum) {
      if (!Array.isArray(data.hidden) || !data.hidden.length) closeHiddenModal();
      else refreshHiddenModal();
    }
  }

  function deleteCustomAt(caseNum, idx) {
    const data = ensure(caseNum);
    if (!Array.isArray(data.custom) || idx < 0 || idx >= data.custom.length) return false;
    data.custom.splice(idx, 1);
    if (String(data.favorite).startsWith("custom-")) {
      const remapped = remapCustomSlot(data.favorite, idx);
      data.favorite = remapped || "primary";
    }
    if (Array.isArray(data.hidden)) {
      data.hidden = data.hidden
        .map((s) => remapCustomSlot(s, idx))
        .filter(Boolean);
    }
    if (Array.isArray(data.discarded)) {
      data.discarded = data.discarded
        .map((s) => remapCustomSlot(s, idx))
        .filter(Boolean);
    }
    saveLocal();
    return true;
  }

  function discardBuiltin(caseNum, slot) {
    if (slot !== "primary" && slot !== "secondary") return false;
    const data = ensure(caseNum);
    if (!Array.isArray(data.discarded)) data.discarded = [];
    if (!data.discarded.includes(slot)) data.discarded.push(slot);
    if (Array.isArray(data.hidden)) {
      data.hidden = data.hidden.filter((s) => String(s) !== String(slot));
    }
    const row = document.querySelector('.case-row[data-case="' + caseNum + '"]');
    if (data.favorite === slot && row) {
      const absent = absentSet(data);
      const next = [...row.querySelectorAll(".alg-row")].find(
        (r) => !absent.has(r.dataset.slot)
      );
      data.favorite = next ? next.dataset.slot : "primary";
    }
    saveLocal();
    return true;
  }

  function removeHiddenAlg(caseNum, slot) {
    if (!confirm("Remove this algorithm permanently?")) return;
    const m = /^custom-(\\d+)$/.exec(String(slot));
    let ok = false;
    if (m) ok = deleteCustomAt(caseNum, Number(m[1]));
    else ok = discardBuiltin(caseNum, slot);
    if (ok) afterHiddenListChange(caseNum);
  }

  function algTextForSlot(row, slot) {
    const el = row.querySelector('.alg-row[data-slot="' + slot + '"] [data-alg-text]');
    if (!el) return slot;
    return el.dataset.algRaw || el.textContent.trim() || slot;
  }

  function openHiddenModal(caseNum) {
    hiddenModalCase = caseNum;
    const modal = document.getElementById("hidden-modal");
    const title = document.getElementById("hidden-modal-title");
    if (title) title.textContent = "Hidden algs · OLL #" + caseNum;
    refreshHiddenModal();
    modal?.classList.add("is-open");
    modal?.setAttribute("aria-hidden", "false");
  }

  function refreshHiddenModal() {
    const list = document.getElementById("hidden-modal-list");
    if (!list || hiddenModalCase == null) return;
    const data = ensure(hiddenModalCase);
    const row = document.querySelector('.case-row[data-case="' + hiddenModalCase + '"]');
    const hidden = Array.isArray(data.hidden) ? data.hidden.map(String) : [];
    list.innerHTML = "";
    if (!hidden.length) {
      const empty = document.createElement("p");
      empty.className = "hidden-modal-empty";
      empty.textContent = "No hidden algorithms.";
      list.appendChild(empty);
      return;
    }
    hidden.forEach((slot) => {
      const item = document.createElement("div");
      item.className = "hidden-modal-item";
      const text = document.createElement("p");
      text.className = "alg";
      text.textContent = row ? algTextForSlot(row, slot) : slot;
      const actions = document.createElement("div");
      actions.className = "hidden-modal-actions";
      const showBtn = document.createElement("button");
      showBtn.type = "button";
      showBtn.className = "btn btn-ghost btn-icon";
      showBtn.title = "Show";
      showBtn.setAttribute("aria-label", "Show algorithm");
      showBtn.innerHTML = '<i class="fa-solid fa-eye" aria-hidden="true"></i>';
      showBtn.addEventListener("click", () => unhideAlg(hiddenModalCase, slot));
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-danger btn-icon";
      removeBtn.title = "Remove";
      removeBtn.setAttribute("aria-label", "Remove algorithm");
      removeBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
      removeBtn.addEventListener("click", () => removeHiddenAlg(hiddenModalCase, slot));
      actions.appendChild(showBtn);
      actions.appendChild(removeBtn);
      item.appendChild(text);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function closeHiddenModal() {
    hiddenModalCase = null;
    const modal = document.getElementById("hidden-modal");
    modal?.classList.remove("is-open");
    modal?.setAttribute("aria-hidden", "true");
  }

  function applyAlgOrder(row, animate) {
    const data = ensure(row.dataset.case);
    const list = row.querySelector("[data-alg-list]");
    if (!list) return;

    const absent = absentSet(data);
    const items = [...list.querySelectorAll(".alg-row")];
    const slots = items.map((el) => el.dataset.slot);
    const visibleSlots = slots.filter((s) => !absent.has(s));
    let fav = data.favorite;
    if (!visibleSlots.includes(fav)) fav = visibleSlots[0] || slots[0] || "primary";
    if (data.favorite !== fav) data.favorite = fav;

    const ordered = [];
    const favEl = list.querySelector('[data-slot="' + fav + '"]');
    if (favEl) ordered.push(favEl);
    slots.forEach((slot) => {
      if (slot === fav) return;
      const el = list.querySelector('[data-slot="' + slot + '"]');
      if (el) ordered.push(el);
    });

    const orderChanged =
      items.length === ordered.length &&
      items.some((el, i) => el !== ordered[i]);
    const first =
      animate !== false && orderChanged ? captureAlgPositions(items) : null;

    ordered.forEach((el) => list.appendChild(el));

    let favDeg = 0;
    let visibleIdx = 0;
    list.querySelectorAll(".alg-row").forEach((r) => {
      const isHidden = absent.has(r.dataset.slot);
      const isFav = !isHidden && r.dataset.slot === fav;
      r.classList.toggle("is-favorite", isFav);
      const cb = r.querySelector("[data-fav]");
      if (cb) cb.checked = isFav;
      const text = r.querySelector("[data-alg-text]");
      if (text) {
        const stored = readStoredAlg(data, r.dataset.slot);
        if (stored != null) text.dataset.algRaw = stored;
        else if (text.dataset.algDefault) text.dataset.algRaw = text.dataset.algDefault;
        else if (!text.dataset.algRaw) text.dataset.algRaw = text.textContent.trim();
        const deg = renderAlgDisplay(text, text.dataset.algRaw, isFav);
        text.classList.toggle("primary", isFav);
        if (isFav) favDeg = deg;
      }
      ensureAlgOrderMeta(r, row.dataset.case);
      if (!isHidden) {
        r.classList.toggle("is-first-alt", !isFav && visibleIdx === 1);
        visibleIdx += 1;
      } else {
        r.classList.remove("is-first-alt");
      }
    });

    applyHiddenUi(row);
    playAlgFlip(ordered.filter((el) => !absent.has(el.dataset.slot)), first);
    applyDiagramRotation(row, favDeg);
    syncRefAlg(row);
  }

  function applyStatus(row) {
    const data = ensure(row.dataset.case);
    const status =
      data.status === "orange" || data.status === "green" ? data.status : "red";
    data.status = status;
    row.setAttribute("data-status", status);
    row.querySelectorAll("input[data-status]").forEach((cb) => {
      cb.checked = cb.dataset.status === status;
    });
    document.querySelectorAll('.ref-row[data-case="' + row.dataset.case + '"]').forEach((ref) => {
      ref.setAttribute("data-status", status);
    });
  }

  function applyAll() {
    document.querySelectorAll(".case-row").forEach((row) => {
      syncCustomRows(row);
      applyStatus(row);
      applyAlgOrder(row, false);
      bindRow(row);
    });
    applyFilter();
    updateCounts();
  }

  function caseStatus(caseNum) {
    const st = ensure(caseNum).status;
    return st === "orange" || st === "green" ? st : "red";
  }

  function applyFilter() {
    if (practiceOn) {
      document.querySelectorAll(".case-row, .ref-row").forEach((el) => {
        const st = caseStatus(el.dataset.case);
        el.setAttribute("data-status", st);
        el.hidden = false;
        el.classList.remove("is-filtered-out");
      });
      document.querySelectorAll(".group-section").forEach((sec) => {
        sec.hidden = false;
      });
      rebuildPracticeQueue(true);
      refreshPractice();
      return;
    }
    const activeBtn = document.querySelector("[data-filter].is-on");
    const filter = activeBtn ? activeBtn.dataset.filter : "";
    document.querySelectorAll(".case-row, .ref-row").forEach((el) => {
      const st = caseStatus(el.dataset.case);
      el.setAttribute("data-status", st);
      const show = !(filter === "red" || filter === "orange" || filter === "green") || st === filter;
      el.hidden = !show;
      el.classList.toggle("is-filtered-out", !show);
    });
    document.querySelectorAll(".group-section").forEach((sec) => {
      const any = [...sec.querySelectorAll(".case-row")].some(
        (r) => !r.hidden && !r.classList.contains("is-filtered-out")
      );
      sec.hidden = !any;
    });
  }

  function visibleCaseRows() {
    return [...document.querySelectorAll(".case-row")].filter(
      (r) => !r.hidden && !r.classList.contains("is-filtered-out")
    );
  }

  function shuffleIds(ids) {
    const a = ids.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function selectedPracticeStatuses() {
    return new Set(
      [...document.querySelectorAll("[data-practice-status]:checked")].map(
        (el) => el.dataset.practiceStatus
      )
    );
  }

  function selectedPracticeGroups() {
    return new Set(
      [...document.querySelectorAll("[data-practice-group]:checked")].map(
        (el) => el.dataset.practiceGroup
      )
    );
  }

  function practiceEligibleRows() {
    const statuses = selectedPracticeStatuses();
    const groups = selectedPracticeGroups();
    if (!statuses.size && !groups.size) return [];
    return [...document.querySelectorAll(".case-row")].filter((row) => {
      const st = caseStatus(row.dataset.case);
      const statusMatch = statuses.size > 0 && statuses.has(st);
      const groupMatch = groups.size > 0 && groups.has(row.dataset.group);
      return statusMatch || groupMatch;
    });
  }

  function updatePracticePoolCount() {
    const n = practiceEligibleRows().length;
    const el = document.getElementById("practice-pool-count");
    if (el) {
      el.textContent = String(n);
      el.title = n + (n === 1 ? " case" : " cases") + " in practice pool";
    }
  }

  function syncPracticeOrderSwitch() {
    const sw = document.getElementById("practice-order-switch");
    if (!sw) return;
    sw.dataset.mode = practiceShuffle ? "shuffle" : "fixed";
    sw.querySelectorAll("[data-practice-order]").forEach((btn) => {
      const on = btn.dataset.practiceOrder === (practiceShuffle ? "shuffle" : "fixed");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function rebuildPracticeQueue(keepCurrent) {
    const eligibleIds = practiceEligibleRows().map((r) => r.dataset.case);
    const currentId = keepCurrent ? practiceQueue[practiceIndex] : null;
    practiceQueue = practiceShuffle ? shuffleIds(eligibleIds) : eligibleIds.slice();
    if (currentId) {
      const idx = practiceQueue.indexOf(currentId);
      practiceIndex = idx >= 0 ? idx : 0;
    } else {
      practiceIndex = 0;
    }
    updatePracticePoolCount();
  }

  function setPracticeUi(on) {
    practiceOn = on;
    document.body.classList.toggle("practice-mode", on);
    const btn = document.getElementById("btn-practice");
    if (btn) {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "Exit practice" : "Practice";
    }
    const picker = document.getElementById("practice-picker");
    if (picker) {
      picker.hidden = !on;
    }
    if (!on) {
      practiceQueue = [];
      practiceIndex = 0;
      document.querySelectorAll(".case-row.is-practice-current").forEach((r) => {
        r.classList.remove("is-practice-current");
      });
      setActionsOpen(false);
    }
  }

  function refreshPractice() {
    if (!practiceOn) return;
    updatePracticePoolCount();
    if (!practiceQueue.length) {
      document.querySelectorAll(".case-row").forEach((r) => r.classList.remove("is-practice-current"));
      const meta = document.getElementById("practice-meta");
      if (meta) {
        meta.textContent = "0 / 0";
        meta.title = "No cases match the practice filters";
      }
      return;
    }
    if (practiceIndex >= practiceQueue.length) practiceIndex = practiceQueue.length - 1;
    if (practiceIndex < 0) practiceIndex = 0;
    document.querySelectorAll(".case-row").forEach((r) => r.classList.remove("is-practice-current"));
    const current = document.querySelector(
      '.case-row[data-case="' + practiceQueue[practiceIndex] + '"]'
    );
    if (!current) return;
    current.classList.add("is-practice-current");
    current.hidden = false;
    current.classList.remove("is-filtered-out");
    const meta = document.getElementById("practice-meta");
    if (meta) meta.textContent = (practiceIndex + 1) + " / " + practiceQueue.length;
    const name = current.querySelector(".title")?.textContent?.trim() || ("#" + current.dataset.case);
    if (meta) {
      meta.title = name + (practiceShuffle ? " · shuffled" : " · fixed order");
    }
    current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function practiceStep(delta) {
    if (!practiceOn) return;
    if (!practiceQueue.length) {
      rebuildPracticeQueue(false);
      refreshPractice();
      return;
    }
    practiceIndex = (practiceIndex + delta + practiceQueue.length) % practiceQueue.length;
    refreshPractice();
  }

  function onPracticeFilterChange() {
    if (!practiceOn) return;
    rebuildPracticeQueue(true);
    refreshPractice();
  }

  function enterPractice(fromCase) {
    setPracticeUi(true);
    setAnchorsCollapsed(true);
    setActionsOpen(false);
    rebuildPracticeQueue(false);
    if (fromCase != null && practiceQueue.length) {
      const idx = practiceQueue.indexOf(String(fromCase));
      practiceIndex = idx >= 0 ? idx : 0;
    }
    refreshPractice();
  }

  function exitPractice() {
    const current = document.querySelector(".case-row.is-practice-current");
    const id = current?.id;
    setPracticeUi(false);
    applyFilter();
    if (id) {
      requestAnimationFrame(() => scrollToId(id, 180));
    }
  }

  let lastScrollY = window.scrollY;
  let anchorsScrollLockUntil = 0;

  function setAnchorsCollapsed(collapsed) {
    const wrap = document.getElementById("anchors-wrap");
    const btn = document.getElementById("btn-groups");
    if (!wrap || !btn) return;
    wrap.classList.toggle("is-collapsed", collapsed);
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    // Expanding the sticky header shifts layout / URL-bar chrome on phones and
    // can fire a scroll event; ignore that so the toggle does not instantly close.
    lastScrollY = window.scrollY;
    if (!collapsed) anchorsScrollLockUntil = Date.now() + 600;
  }

  function closeAllStatusPanels(exceptRow) {
    document.querySelectorAll(".case-row.status-open").forEach((row) => {
      if (exceptRow && row === exceptRow) return;
      row.classList.remove("status-open");
      const t = row.querySelector("[data-status-toggle]");
      if (t) t.setAttribute("aria-expanded", "false");
    });
  }

  function updateCounts() {
    const counts = { red: 0, orange: 0, green: 0 };
    document.querySelectorAll(".case-row").forEach((row) => {
      const st = ensure(row.dataset.case).status;
      const key = st === "orange" || st === "green" ? st : "red";
      counts[key]++;
    });
    Object.entries(counts).forEach(([k, v]) => {
      const el = document.querySelector('[data-count="' + k + '"]');
      if (el) el.textContent = String(v);
    });
    updateGroupBars();
  }

  function groupStatusTallies(slug) {
    const tallies = { red: 0, orange: 0, green: 0 };
    document.querySelectorAll('.case-row[data-group="' + slug + '"]').forEach((row) => {
      const st = caseStatus(row.dataset.case);
      tallies[st === "orange" || st === "green" ? st : "red"]++;
    });
    return tallies;
  }

  function applyBarTallies(el, tallies, titleBase) {
    const total = tallies.red + tallies.orange + tallies.green;
    ["red", "orange", "green"].forEach((key) => {
      const seg = el.querySelector('[data-seg="' + key + '"]');
      if (!seg) return;
      const n = tallies[key];
      seg.style.flex = n > 0 ? n + " 1 0%" : "0 0 0%";
      seg.style.display = n > 0 ? "block" : "none";
    });
    const label = [
      tallies.red ? tallies.red + " not learned" : "",
      tallies.orange ? tallies.orange + " learning" : "",
      tallies.green ? tallies.green + " learned" : "",
    ]
      .filter(Boolean)
      .join(", ");
    el.title = titleBase + (total ? " · " + label : "");
  }

  function updateGroupBars() {
    document.querySelectorAll(".nav-chip[data-group-nav]").forEach((chip) => {
      const slug = chip.dataset.groupNav;
      const tallies = groupStatusTallies(slug);
      const base = chip.querySelector(".nav-chip-label")?.textContent || slug;
      applyBarTallies(chip, tallies, base);
    });
    document.querySelectorAll(".practice-check-group[data-practice-group-bar]").forEach((chip) => {
      const slug = chip.dataset.practiceGroupBar;
      const tallies = groupStatusTallies(slug);
      const base = chip.querySelector(".practice-check-label")?.textContent || slug;
      applyBarTallies(chip, tallies, base);
    });
  }

  const bound = new WeakSet();
  function bindRow(row) {
    if (bound.has(row)) return;
    bound.add(row);

    row.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches("[data-status]")) {
        const data = ensure(row.dataset.case);
        data.status = t.checked ? t.dataset.status : "red";
        if (data.status !== "red" && data.status !== "orange" && data.status !== "green") {
          data.status = "red";
        }
        saveLocal();
        applyStatus(row);
        applyFilter();
        updateCounts();
        closeAllStatusPanels();
      }
      if (t.matches("[data-fav]")) {
        const data = ensure(row.dataset.case);
        data.favorite = t.checked ? t.dataset.fav : "primary";
        saveLocal();
        applyAlgOrder(row);
      }
    });

    row.addEventListener("click", (e) => {
      const statusToggle = e.target.closest("[data-status-toggle]");
      if (statusToggle) {
        const open = !row.classList.contains("status-open");
        closeAllStatusPanels(open ? row : null);
        row.classList.toggle("status-open", open);
        statusToggle.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }
      const rotBtn = e.target.closest("[data-rotate]");
      if (rotBtn) {
        nudgeDiagramRotation(row, Number(rotBtn.dataset.rotate) || 0);
        return;
      }
      if (e.target.closest(".diagram")) {
        resetDiagramRotation(row);
        return;
      }
      const addBtn = e.target.closest("[data-add-alg]");
      if (addBtn) {
        openModal(row.dataset.case, null);
        return;
      }
      const showHiddenBtn = e.target.closest("[data-show-hidden]");
      if (showHiddenBtn) {
        openHiddenModal(row.dataset.case);
        return;
      }
      const editBtn = e.target.closest("[data-edit]");
      if (editBtn) {
        openModal(row.dataset.case, editBtn.dataset.edit);
      }
    });
  }

  function syncModalOrderFromAlg(force) {
    const input = document.getElementById("alg-modal-input");
    const orderInput = document.getElementById("alg-modal-order");
    if (!input || !orderInput) return;
    if (!force && orderInput.dataset.manual === "1") return;
    const computed = computeAlgOrder((input.value || "").trim());
    orderInput.value = computed != null ? String(computed) : "";
    orderInput.dataset.manual = "0";
  }

  function openModal(caseNum, editSlot) {
    modalCase = caseNum;
    modalEditSlot = editSlot == null || editSlot === "" ? null : String(editSlot);
    const modal = document.getElementById("alg-modal");
    const input = document.getElementById("alg-modal-input");
    const orderInput = document.getElementById("alg-modal-order");
    const tipInput = document.getElementById("alg-modal-tip");
    const title = document.getElementById("alg-modal-title");
    const saveBtn = document.getElementById("alg-modal-save");
    const hideBtn = document.getElementById("alg-modal-hide");
    const editing = modalEditSlot != null;
    if (title) title.textContent = (editing ? "Edit alg" : "Add alg") + " · OLL #" + caseNum;
    if (saveBtn) {
      const saveIcon = editing ? "fa-check" : "fa-plus";
      const saveLabel = editing ? "Save" : "Add";
      saveBtn.title = saveLabel;
      saveBtn.setAttribute("aria-label", saveLabel);
      saveBtn.innerHTML = '<i class="fa-solid ' + saveIcon + '" aria-hidden="true"></i>';
    }
    if (hideBtn) hideBtn.hidden = !editing;
    let algText = "";
    if (editing) {
      const data = ensure(caseNum);
      const row = document.querySelector('.case-row[data-case="' + caseNum + '"]');
      const fromDom = row
        ? row.querySelector('.alg-row[data-slot="' + modalEditSlot + '"] [data-alg-text]')
        : null;
      const stored = readStoredAlg(data, modalEditSlot);
      algText =
        stored ||
        fromDom?.dataset.algRaw ||
        fromDom?.textContent?.trim() ||
        "";
      if (input) input.value = algText;
      const computed = computeAlgOrder(algText);
      const storedOrder = readStoredOrder(data, modalEditSlot);
      const defaultAlg = fromDom?.dataset.algDefault || "";
      const defaultOrder =
        fromDom?.dataset.orderDefault != null &&
        fromDom.dataset.orderDefault !== "" &&
        Number.isFinite(Number(fromDom.dataset.orderDefault))
          ? Number(fromDom.dataset.orderDefault)
          : null;
      if (orderInput) {
        const shown =
          storedOrder != null
            ? storedOrder
            : algText === defaultAlg && defaultOrder != null
              ? defaultOrder
              : computed;
        orderInput.value = shown != null ? String(shown) : "";
        orderInput.dataset.manual = storedOrder != null ? "1" : "0";
      }
      const storedTip = readStoredTip(data, modalEditSlot);
      if (tipInput) {
        tipInput.value =
          storedTip != null
            ? storedTip
            : String(fromDom?.dataset.tipDefault || "").trim();
      }
    } else {
      if (input) input.value = "";
      if (orderInput) {
        orderInput.value = "";
        orderInput.dataset.manual = "0";
      }
      if (tipInput) tipInput.value = "";
    }
    modal?.classList.add("is-open");
    modal?.setAttribute("aria-hidden", "false");
    setTimeout(() => input?.focus(), 30);
  }

  function closeModal() {
    modalCase = null;
    modalEditSlot = null;
    const modal = document.getElementById("alg-modal");
    modal?.classList.remove("is-open");
    modal?.setAttribute("aria-hidden", "true");
  }

  function openNotationModal() {
    const modal = document.getElementById("notation-modal");
    modal?.classList.add("is-open");
    modal?.setAttribute("aria-hidden", "false");
  }

  function closeNotationModal() {
    const modal = document.getElementById("notation-modal");
    modal?.classList.remove("is-open");
    modal?.setAttribute("aria-hidden", "true");
  }

  function submitModal() {
    const input = document.getElementById("alg-modal-input");
    const orderInput = document.getElementById("alg-modal-order");
    const tipInput = document.getElementById("alg-modal-tip");
    const alg = (input?.value || "").trim();
    if (!alg || modalCase == null) return;
    const data = ensure(modalCase);
    const tip = (tipInput?.value || "").trim();
    const computed = computeAlgOrder(alg);
    const orderVal = Number(orderInput?.value);
    const hasOrder = Number.isFinite(orderVal) && orderVal >= 1;
    // Store override only when it differs from the computed order.
    let finalOrder = null;
    if (hasOrder) {
      finalOrder = Math.round(orderVal);
      if (computed != null && finalOrder === computed) finalOrder = null;
    }
    if (modalEditSlot != null) {
      const rowEl = document.querySelector('.case-row[data-case="' + modalCase + '"]');
      const algEl = rowEl?.querySelector(
        '.alg-row[data-slot="' + modalEditSlot + '"] [data-alg-text]'
      );
      writeStoredAlg(data, modalEditSlot, alg, algEl?.dataset.algDefault);
      writeStoredOrder(data, modalEditSlot, finalOrder);
      writeStoredTip(data, modalEditSlot, tip, algEl?.dataset.tipDefault);
    } else {
      const entry = { alg };
      if (finalOrder != null) entry.order = finalOrder;
      if (tip) entry.tip = tip;
      data.custom.push(entry);
      data.favorite = "custom-" + (data.custom.length - 1);
    }
    saveLocal();
    const row = document.querySelector('.case-row[data-case="' + modalCase + '"]');
    if (row) {
      syncCustomRows(row);
      applyAlgOrder(row);
    }
    closeModal();
  }

  function remapCustomSlot(slot, removedIdx) {
    const m = /^custom-(\\d+)$/.exec(String(slot));
    if (!m) return slot;
    const i = Number(m[1]);
    if (i === removedIdx) return null;
    if (i > removedIdx) return "custom-" + (i - 1);
    return slot;
  }

  function hideModalAlg() {
    if (modalCase == null || modalEditSlot == null) return;
    const row = document.querySelector('.case-row[data-case="' + modalCase + '"]');
    if (!row) return;
    const slot = modalEditSlot;
    hideAlg(row, slot);
    const data = ensure(modalCase);
    if (!hiddenSet(data).has(slot)) {
      alert("Keep at least one algorithm visible.");
      return;
    }
    closeModal();
  }

  function scrollToId(id, durationMs) {
    const target = document.getElementById(id);
    if (!target) return;
    const duration = durationMs == null ? 220 : durationMs;
    const startY = window.scrollY || window.pageYOffset;
    const header = document.querySelector(".toolbar");
    const offset = (header ? header.getBoundingClientRect().height : 0) + 10;
    const rect = target.getBoundingClientRect();
    const endY = startY + rect.top - offset;
    const dist = endY - startY;
    if (Math.abs(dist) < 1 || duration <= 0) {
      window.scrollTo(0, endY);
      return;
    }
    const t0 = performance.now();
    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }
    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, startY + dist * easeOutCubic(t));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function setActionsOpen(open) {
    const menu = document.getElementById("actions-menu");
    const btn = document.getElementById("btn-menu");
    if (!menu || !btn) return;
    menu.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function bindGlobal() {
    document.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wasOn = btn.classList.contains("is-on");
        document.querySelectorAll("[data-filter]").forEach((b) => b.classList.remove("is-on"));
        if (!wasOn) btn.classList.add("is-on");
        applyFilter();
      });
    });

    document.querySelectorAll('a.nav-chip[href^="#"], a.ref-link[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = (a.getAttribute("href") || "").slice(1);
        if (!id || !document.getElementById(id)) return;
        e.preventDefault();
        if (practiceOn) exitPractice();
        scrollToId(id, a.classList.contains("nav-chip") ? 180 : 240);
        history.pushState(null, "", "#" + id);
        if (window.matchMedia("(max-width: 720px)").matches) setAnchorsCollapsed(true);
      });
    });

    document.getElementById("btn-groups")?.addEventListener("click", () => {
      const wrap = document.getElementById("anchors-wrap");
      setAnchorsCollapsed(!(wrap && wrap.classList.contains("is-collapsed")));
    });

    document.getElementById("btn-practice")?.addEventListener("click", () => {
      if (practiceOn) exitPractice();
      else enterPractice();
    });
    document.getElementById("btn-notation")?.addEventListener("click", () => {
      setActionsOpen(false);
      openNotationModal();
    });
    document.getElementById("notation-modal-backdrop")?.addEventListener("click", closeNotationModal);
    document.getElementById("notation-modal-close")?.addEventListener("click", closeNotationModal);
    document.getElementById("practice-prev")?.addEventListener("click", () => practiceStep(-1));
    document.getElementById("practice-next")?.addEventListener("click", () => practiceStep(1));
    document.getElementById("practice-exit")?.addEventListener("click", () => exitPractice());
    document.getElementById("practice-picker")?.addEventListener("change", (e) => {
      if (e.target.matches("[data-practice-status], [data-practice-group]")) {
        onPracticeFilterChange();
      }
    });
    document.getElementById("practice-order-switch")?.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-practice-order]");
      if (!opt) return;
      const nextShuffle = opt.dataset.practiceOrder === "shuffle";
      if (nextShuffle === practiceShuffle) return;
      practiceShuffle = nextShuffle;
      syncPracticeOrderSwitch();
      if (!practiceOn) return;
      rebuildPracticeQueue(true);
      refreshPractice();
    });
    syncPracticeOrderSwitch();

    document.getElementById("btn-menu")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = document.getElementById("actions-menu");
      setActionsOpen(!(menu && menu.classList.contains("is-open")));
    });
    document.addEventListener("click", (e) => {
      const menu = document.getElementById("actions-menu");
      if (menu && menu.classList.contains("is-open") && !menu.contains(e.target)) {
        setActionsOpen(false);
      }
      if (!e.target.closest(".case-row") && !e.target.closest(".status-panel")) {
        closeAllStatusPanels();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        setActionsOpen(false);
        closeAllStatusPanels();
        closeModal();
        closeHiddenModal();
        closeNotationModal();
        if (practiceOn) exitPractice();
        return;
      }
      if (!practiceOn) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        practiceStep(-1);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        practiceStep(1);
      }
    });

    window.addEventListener(
      "scroll",
      () => {
        if (!window.matchMedia("(max-width: 720px)").matches) return;
        const y = window.scrollY;
        if (Date.now() < anchorsScrollLockUntil) {
          lastScrollY = y;
          return;
        }
        if (y > lastScrollY + 48) setAnchorsCollapsed(true);
        lastScrollY = y;
      },
      { passive: true }
    );

    const swipeRoot = document.querySelector("main");
    swipeRoot?.addEventListener(
      "touchstart",
      (e) => {
        if (!practiceOn || e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
      },
      { passive: true }
    );
    swipeRoot?.addEventListener(
      "touchend",
      (e) => {
        if (!practiceOn || touchStartX == null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        touchStartX = null;
        if (Math.abs(dx) < 48) return;
        practiceStep(dx < 0 ? 1 : -1);
      },
      { passive: true }
    );

    document.getElementById("btn-print")?.addEventListener("click", () => {
      setActionsOpen(false);
      document.querySelectorAll(".case-row").forEach(applyAlgOrder);
      window.print();
    });
    document.getElementById("btn-export")?.addEventListener("click", () => {
      setActionsOpen(false);
      exportFile();
    });
    document.getElementById("btn-import")?.addEventListener("click", () => {
      setActionsOpen(false);
      document.getElementById("import-file")?.click();
    });
    document.getElementById("import-file")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) importFile(file);
      e.target.value = "";
    });

    document.getElementById("alg-modal-cancel")?.addEventListener("click", closeModal);
    document.getElementById("alg-modal-backdrop")?.addEventListener("click", closeModal);
    document.getElementById("alg-modal-save")?.addEventListener("click", submitModal);
    document.getElementById("alg-modal-hide")?.addEventListener("click", hideModalAlg);
    document.getElementById("hidden-modal-close")?.addEventListener("click", closeHiddenModal);
    document.getElementById("hidden-modal-backdrop")?.addEventListener("click", closeHiddenModal);
    document.getElementById("alg-modal-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitModal();
      }
      if (e.key === "Escape") closeModal();
    });
    document.getElementById("alg-modal-input")?.addEventListener("input", () => {
      syncModalOrderFromAlg(false);
    });
    document.getElementById("alg-modal-order")?.addEventListener("input", (e) => {
      e.target.dataset.manual = "1";
    });
    document.getElementById("alg-modal-order")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitModal();
      }
      if (e.key === "Escape") closeModal();
    });
    document.getElementById("alg-modal-tip")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitModal();
      }
      if (e.key === "Escape") closeModal();
    });

    setAnchorsCollapsed(window.matchMedia("(max-width: 720px)").matches);
  }

  (async () => {
    await loadProgress();
    bindGlobal();
    applyAll();
  })();
})();
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Gabis OLL Trainer</title>
  <meta name="theme-color" content="#566996" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Gabis OLL" />
  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="apple-touch-icon.png" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="styles.css" />
  <!-- Optional visual refresh — delete this line (and styles-spice.css) to undo -->
  <link rel="stylesheet" href="styles-spice.css" />

</head>
<body>
  <header class="toolbar">
    <div class="toolbar-top">
      <div class="brand"><img class="brand-mark" src="favicon.svg" width="27" height="27" alt="" /><span class="brand-text">Gabis OLL Trainer</span></div>
      <span id="save-stamp"></span>
      <div class="actions" id="actions-menu">
        <button type="button" class="btn" id="btn-practice" aria-pressed="false" title="Practice selected cases in random order">Practice</button>
        <button type="button" class="icon-btn browse-only" id="btn-notation" aria-label="Cube notation" title="Notation">
          <i class="fa-solid fa-book" aria-hidden="true"></i>
        </button>
        <button type="button" class="icon-btn browse-only" id="btn-menu" aria-expanded="false" aria-controls="actions-panel" aria-label="File actions" title="File">
          <i class="fa-solid fa-file" aria-hidden="true"></i>
        </button>
        <div class="actions-panel browse-only" id="actions-panel" role="menu">
          <button type="button" class="btn btn-ghost" id="btn-import" role="menuitem">Import</button>
          <button type="button" class="btn btn-ghost" id="btn-export" role="menuitem">Export JSON</button>
          <button type="button" class="btn btn-primary" id="btn-print" role="menuitem">Print / PDF</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden />
      </div>
    </div>
    <div class="filters browse-only" aria-label="Status filter">
      <button type="button" class="btn filter-chip" data-filter="red"><span class="pip"></span><span class="lbl-full"> Not learned </span><span class="lbl-short"> Not </span><span class="n" data-count="red">0</span></button>
      <button type="button" class="btn filter-chip" data-filter="orange"><span class="pip"></span><span class="lbl-full"> Learning </span><span class="lbl-short"> Learn </span><span class="n" data-count="orange">0</span></button>
      <button type="button" class="btn filter-chip" data-filter="green"><span class="pip"></span><span class="lbl-full"> Learned </span><span class="lbl-short"> Done </span><span class="n" data-count="green">0</span></button>
    </div>
    <div class="anchors-wrap browse-only is-collapsed" id="anchors-wrap">
      <button type="button" class="anchors-toggle" id="btn-groups" aria-expanded="false" aria-controls="anchors-nav" aria-label="Groups" title="Groups">
        <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
      </button>
      <nav class="anchors" id="anchors-nav" aria-label="Groups">
        ${navLinks}
      </nav>
    </div>
    <div class="practice-picker screen-only" id="practice-picker" hidden>
      <div class="practice-picker-options">
        <label class="practice-check practice-check-status" title="Not learned"><input type="checkbox" data-practice-status="red" /><span class="pip red" aria-hidden="true"></span></label>
        <label class="practice-check practice-check-status" title="Learning"><input type="checkbox" data-practice-status="orange" /><span class="pip orange" aria-hidden="true"></span></label>
        <label class="practice-check practice-check-status" title="Learned"><input type="checkbox" data-practice-status="green" /><span class="pip green" aria-hidden="true"></span></label>
        <span class="practice-picker-sep" aria-hidden="true"></span>
        ${practiceGroupChecks}
        <div class="practice-picker-end">
          <span class="practice-picker-count" id="practice-pool-count" title="Cases in practice pool">0</span>
          <div class="practice-order-switch" id="practice-order-switch" data-mode="shuffle" role="group" aria-label="Practice order">
            <span class="practice-order-thumb" aria-hidden="true"></span>
            <button type="button" class="practice-order-opt" data-practice-order="shuffle" aria-pressed="true" title="Shuffled" aria-label="Shuffled">
              <i class="fa-solid fa-shuffle" aria-hidden="true"></i>
            </button>
            <button type="button" class="practice-order-opt" data-practice-order="fixed" aria-pressed="false" title="Fixed order" aria-label="Fixed order">
              <i class="fa-solid fa-arrow-down-short-wide" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
  <main>
${groupSections}
  </main>

  <div class="practice-bar screen-only" id="practice-bar" aria-label="Practice navigation">
    <button type="button" class="btn btn-ghost" id="practice-prev" aria-label="Previous case">‹</button>
    <span class="practice-meta" id="practice-meta">0 / 0</span>
    <button type="button" class="btn btn-ghost" id="practice-next" aria-label="Next case">›</button>
    <button type="button" class="btn btn-primary" id="practice-exit">Exit</button>
  </div>

  <div class="modal" id="alg-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="alg-modal-title">
    <div class="modal-backdrop" id="alg-modal-backdrop"></div>
    <div class="modal-panel">
      <h3 id="alg-modal-title">Add alg</h3>
      <label>
        Algorithm
        <input type="text" id="alg-modal-input" placeholder="e.g. R U R' U R U2' R'" autocomplete="off" />
      </label>
      <label>
        Tip
        <input type="text" id="alg-modal-tip" placeholder="Optional tip for this alg" autocomplete="off" />
      </label>
      <label>
        Order of permutation
        <input type="number" id="alg-modal-order" min="1" max="1260" inputmode="numeric" placeholder="Repeat count to return to start" autocomplete="off" />
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost btn-icon" id="alg-modal-hide" hidden title="Hide" aria-label="Hide algorithm"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i></button>
        <span class="modal-actions-spacer"></span>
        <button type="button" class="btn btn-ghost btn-icon" id="alg-modal-cancel" title="Cancel" aria-label="Cancel"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        <button type="button" class="btn btn-primary btn-icon" id="alg-modal-save" title="Add" aria-label="Add"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
      </div>
    </div>
  </div>

  <div class="modal" id="hidden-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="hidden-modal-title">
    <div class="modal-backdrop" id="hidden-modal-backdrop"></div>
    <div class="modal-panel modal-panel-wide">
      <h3 id="hidden-modal-title">Hidden algs</h3>
      <div id="hidden-modal-list" class="hidden-modal-list"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary btn-icon" id="hidden-modal-close" title="Close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
    </div>
  </div>

  <div class="modal" id="notation-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="notation-modal-title">
    <div class="modal-backdrop" id="notation-modal-backdrop"></div>
    <div class="modal-panel modal-panel-wide">
      <h3 id="notation-modal-title">Cube notation</h3>
      <p class="notation-lead">Hold the cube with the U face on top and F facing you. Letters are clockwise quarter turns from that hold.</p>
      <div class="notation-grid">
        <div class="notation-block">
          <h4>Faces</h4>
          <dl class="notation-list">
            <div><dt>R</dt><dd>Right</dd></div>
            <div><dt>L</dt><dd>Left</dd></div>
            <div><dt>U</dt><dd>Up</dd></div>
            <div><dt>D</dt><dd>Down</dd></div>
            <div><dt>F</dt><dd>Front</dd></div>
            <div><dt>B</dt><dd>Back</dd></div>
          </dl>
        </div>
        <div class="notation-block">
          <h4>Modifiers</h4>
          <dl class="notation-list">
            <div><dt>R</dt><dd>90° clockwise</dd></div>
            <div><dt>R'</dt><dd>90° counter-clockwise (prime)</dd></div>
            <div><dt>R2</dt><dd>180°</dd></div>
            <div><dt>R2'</dt><dd>180° the other way (same end)</dd></div>
          </dl>
        </div>
        <div class="notation-block">
          <h4>Wide moves</h4>
          <dl class="notation-list">
            <div><dt>r</dt><dd>Right + middle (Rw)</dd></div>
            <div><dt>l</dt><dd>Left + middle (Lw)</dd></div>
            <div><dt>u</dt><dd>Up + middle (Uw)</dd></div>
            <div><dt>d</dt><dd>Down + middle (Dw)</dd></div>
            <div><dt>f</dt><dd>Front + middle (Fw)</dd></div>
            <div><dt>b</dt><dd>Back + middle (Bw)</dd></div>
          </dl>
        </div>
        <div class="notation-block">
          <h4>Slices</h4>
          <dl class="notation-list">
            <div><dt>M</dt><dd>Middle, like L (between L &amp; R)</dd></div>
            <div><dt>E</dt><dd>Equator, like D (between U &amp; D)</dd></div>
            <div><dt>S</dt><dd>Standing, like F (between F &amp; B)</dd></div>
          </dl>
        </div>
        <div class="notation-block">
          <h4>Cube rotations</h4>
          <dl class="notation-list">
            <div><dt>x</dt><dd>Whole cube like R</dd></div>
            <div><dt>y</dt><dd>Whole cube like U</dd></div>
            <div><dt>z</dt><dd>Whole cube like F</dd></div>
          </dl>
        </div>
        <div class="notation-block">
          <h4>Tips</h4>
          <ul class="notation-tips">
            <li>Lowercase = wide (two layers).</li>
            <li>Parentheses group fingertricks, e.g. (R U R').</li>
            <li>Leading y / y' / y2 often means rotate before the alg.</li>
          </ul>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" id="notation-modal-close">Close</button>
      </div>
    </div>
  </div>

  <script>${clientJs}</script>
</body>
</html>`;

writeFileSync(join(__dirname, "index.html"), html, "utf8");

console.log(`Wrote index.html · ${cards.length} cases · ${groups.length} groups`);
