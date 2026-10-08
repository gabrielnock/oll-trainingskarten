import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(__dirname, "oll-cases.json"), "utf8"));
const notes = JSON.parse(readFileSync(join(__dirname, "cubehead-notes.json"), "utf8"));
const cacheDir = join(__dirname, "svg-cache");
mkdirSync(cacheDir, { recursive: true });

/** Recolor VisualCube defaults to match the page palette. */
const COLOR_MAP = {
  "#FEFE00": "#E8C20A", // yellow stickers (brighter gold)
  "#404040": "#424656", // dark grey → slate
};

const GROUP_META = {
  OCLL: { label: "OCLL", slug: "ocll", order: 0 },
  "All Corners Oriented": { label: "Oriented Corners", slug: "oriented-corners", order: 1 },
  "T Shapes": { label: "T", slug: "t-cases", order: 2 },
  "Square Shapes": { label: "Square", slug: "square-cases", order: 3 },
  "Lightning Shapes": { label: "Lightning", slug: "lightning-cases", order: 4 },
  "P Shapes": { label: "P", slug: "p-cases", order: 5 },
  "C Shapes": { label: "C", slug: "c-cases", order: 6 },
  "Fish Shapes": { label: "Fish", slug: "fish-cases", order: 7 },
  "W Shapes": { label: "W", slug: "w-cases", order: 8 },
  "L Shapes": { label: "L", slug: "l-cases", order: 9 },
  "Line Shapes": { label: "Line", slug: "line-cases", order: 10 },
  "Knight Move Shapes": { label: "Knight Move", slug: "knight-cases", order: 11 },
  "Awkward Shapes": { label: "Awkward", slug: "awkward-cases", order: 12 },
  "Dot Case": { label: "Dot", slug: "dot-cases", order: 13 },
};

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

function pickAlg(preferred, fallback) {
  if (preferred !== undefined && preferred !== null && String(preferred).trim() !== "") {
    return String(preferred).trim();
  }
  return (fallback || "").trim();
}

const cardsBase = cases.map((c) => {
  const ch = notes[String(c.num)] || {};
  const meta = GROUP_META[c.category] || {
    label: c.category,
    slug: c.category.toLowerCase().replace(/\s+/g, "-"),
    order: 99,
  };
  return {
    num: c.num,
    group: meta.label,
    slug: meta.slug,
    order: meta.order,
    name: ch.name || `OLL ${c.num}`,
    setup: c.setup,
    primary: pickAlg(ch.primary, c.primary),
    secondary: pickAlg(ch.secondary, c.secondary),
    tip: (ch.notes || "").trim(),
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
    ? `<div class="inline-box tip-box alg-meta"><span class="inline-label">Tip</span><span class="inline-value">${esc(c.tip)}</span></div>`
    : "";
  const altRow = c.secondary
    ? `
        <div class="alg-row" data-slot="secondary" data-builtin="1">
          <label class="fav" title="Favorite">
            <input type="checkbox" data-fav="secondary" />
            <span>★</span>
          </label>
          <div class="alg-body">
            <div class="alg-label-row"><span class="alg-label" data-label>ALT</span></div>
            <p class="alg" data-alg-text data-alg-raw="${esc(c.secondary)}">${esc(c.secondary)}</p>
          </div>
        </div>`
    : "";

  return `
  <div class="case-row" data-case="${c.num}" data-status="red" id="oll-${c.num}">
    <article class="card">
      <div class="card-accent" aria-hidden="true"></div>
      <p class="group">${esc(c.group)}</p>
      <div class="title-row">
        <h1 class="title">${esc(c.name)}</h1>
        <span class="case-no">#${c.num}</span>
        <button type="button" class="status-toggle screen-only" data-status-toggle aria-expanded="false" aria-label="Learning status" title="Status">
          <span class="status-pip" aria-hidden="true"></span>
        </button>
      </div>
      <div class="inline-box setup-box">
        <span class="inline-label">Setup</span>
        <span class="inline-value alg">${esc(c.setup)}</span>
      </div>
      <figure class="diagram">
        ${c.svg}
      </figure>
      <div class="alg-list" data-alg-list>
        <div class="alg-row" data-slot="primary" data-builtin="1">
          <label class="fav" title="Favorite">
            <input type="checkbox" data-fav="primary" checked />
            <span>★</span>
          </label>
          <div class="alg-body">
            <div class="alg-label-row"><span class="alg-label" data-label>ALG</span></div>
            <p class="alg primary" data-alg-text data-alg-raw="${esc(c.primary)}">${esc(c.primary)}</p>
            ${tip}
          </div>
        </div>${altRow}
      </div>
      <div class="card-actions screen-only">
        <button type="button" class="btn-add-alg" data-add-alg title="Add algorithm">+</button>
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
  .map((g) => `<a class="nav-chip" href="#${g.slug}">${esc(g.label)}</a>`)
  .join("\n        ");

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
  <section class="group-section" id="${g.slug}">
    <h2 class="group-heading">${esc(g.label)} <span class="count">${g.cases.length}</span></h2>
    <div class="ref-list">${list}</div>
    <div class="cards">${g.cases.map(cardHtml).join("\n")}</div>
  </section>`;
  })
  .join("\n");

const clientJs = `
(() => {
  const STORAGE_KEY = "oll-progress-v1";
  const FILE_NAME = "oll-progress.json";

  const defaultCase = () => ({
    status: "red",
    favorite: "primary",
    custom: [],
  });

  let state = { version: 2, updatedAt: null, cases: {} };
  let modalCase = null;
  let modalEditIdx = null;
  let practiceOn = false;
  let practiceIndex = 0;
  let practiceQueue = [];
  let touchStartX = null;

  function normalizeCustomEntry(item) {
    if (item && typeof item === "object" && typeof item.alg === "string") {
      return { alg: item.alg, note: typeof item.note === "string" ? item.note : "" };
    }
    return { alg: String(item || ""), note: "" };
  }

  function migrateCase(raw) {
    const c = { ...defaultCase(), ...(raw || {}) };
    const legacyNote =
      typeof c.note === "string"
        ? c.note
        : raw && raw.notes && typeof raw.notes === "object"
          ? raw.notes.primary || raw.notes.secondary || ""
          : "";
    delete c.note;
    delete c.notes;
    if (!Array.isArray(c.custom)) c.custom = [];
    c.custom = c.custom.map(normalizeCustomEntry);
    if (legacyNote) {
      if (String(c.favorite).startsWith("custom-")) {
        const i = Number(String(c.favorite).replace("custom-", ""));
        if (c.custom[i] && !c.custom[i].note) c.custom[i].note = legacyNote;
      } else if (c.custom.length === 1 && !c.custom[0].note) {
        c.custom[0].note = legacyNote;
      }
    }
    if (!c.favorite) c.favorite = "primary";
    if (c.status === "yellow") c.status = "orange";
    if (c.status !== "red" && c.status !== "orange" && c.status !== "green") c.status = "red";
    return c;
  }

  function ensure(num) {
    const key = String(num);
    state.cases[key] = migrateCase(state.cases[key]);
    return state.cases[key];
  }

  function setStamp(text) {
    const stamp = document.getElementById("save-stamp");
    if (stamp) stamp.textContent = text || "";
  }

  function setSourceStamp(source) {
    const el = document.getElementById("source-stamp");
    if (!el) return;
    const online = source === "online";
    el.dataset.source = online ? "online" : "local";
    el.textContent = online ? "online" : "local";
    el.title = online ? "Progress from oll-progress.json" : "Progress from this device";
  }

  function applyParsedState(parsed) {
    if (!parsed || typeof parsed.cases !== "object") throw new Error("Invalid progress file");
    state = { version: 2, updatedAt: parsed.updatedAt || null, cases: parsed.cases };
    Object.keys(state.cases).forEach((k) => {
      state.cases[k] = migrateCase(state.cases[k]);
    });
  }

  function saveLocal() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStamp("Saved · " + new Date().toLocaleTimeString());
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      applyParsedState(JSON.parse(raw));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadRemoteProgress() {
    try {
      const res = await fetch(FILE_NAME, { cache: "no-store" });
      if (!res.ok) return false;
      const parsed = await res.json();
      applyParsedState(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadProgress() {
    if (await loadRemoteProgress()) {
      setSourceStamp("online");
      return "online";
    }
    loadLocal();
    setSourceStamp("local");
    return "local";
  }

  function exportFile() {
    state.updatedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
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
        alert("Could not import progress file: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  function makeCustomRow(slot, entry) {
    const row = document.createElement("div");
    row.className = "alg-row";
    row.dataset.slot = slot;
    const noteHtml = entry.note
      ? '<div class="inline-box note-box alg-meta"><span class="inline-label">Note</span><span class="inline-value">' +
        escHtml(entry.note) +
        "</span></div>"
      : "";
    row.innerHTML =
      '<label class="fav" title="Favorite">' +
      '<input type="checkbox" data-fav="' + slot + '" />' +
      "<span>★</span></label>" +
      '<div class="alg-body">' +
      '<div class="alg-label-row">' +
      '<span class="alg-label" data-label>ALT</span>' +
      '<button type="button" class="btn-edit-alg screen-only" data-edit="' + slot + '" title="Edit">Edit</button>' +
      "</div>" +
      '<p class="alg" data-alg-text></p>' +
      noteHtml +
      "</div>";
    const algEl = row.querySelector("[data-alg-text]");
    algEl.dataset.algRaw = entry.alg;
    algEl.textContent = entry.alg;
    return row;
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

  function applyDiagramRotation(row, deg) {
    const svg = row.querySelector(".diagram .cube-svg");
    if (!svg) return;
    svg.style.transform = "rotate(" + (deg || 0) + "deg)";
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

  function applyAlgOrder(row, animate) {
    const data = ensure(row.dataset.case);
    const list = row.querySelector("[data-alg-list]");
    if (!list) return;

    const items = [...list.querySelectorAll(".alg-row")];
    const slots = items.map((el) => el.dataset.slot);
    let fav = data.favorite;
    if (!slots.includes(fav)) fav = "primary";

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
    list.querySelectorAll(".alg-row").forEach((r, idx) => {
      const isFav = r.dataset.slot === fav;
      r.classList.toggle("is-favorite", isFav);
      const cb = r.querySelector("[data-fav]");
      if (cb) cb.checked = isFav;
      const label = r.querySelector("[data-label]");
      const text = r.querySelector("[data-alg-text]");
      if (label) label.textContent = isFav ? "ALG" : "ALT";
      if (text) {
        if (!text.dataset.algRaw) text.dataset.algRaw = text.textContent.trim();
        const deg = renderAlgDisplay(text, text.dataset.algRaw, isFav);
        text.classList.toggle("primary", isFav);
        if (isFav) favDeg = deg;
      }
      r.classList.toggle("is-first-alt", !isFav && idx === 1);
    });

    playAlgFlip(ordered, first);
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
    if (practiceOn) refreshPractice();
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

  function syncPracticeQueue() {
    const visibleIds = visibleCaseRows().map((r) => r.dataset.case);
    const visibleSet = new Set(visibleIds);
    const currentId = practiceQueue[practiceIndex];
    practiceQueue = practiceQueue.filter((id) => visibleSet.has(id));
    const inQueue = new Set(practiceQueue);
    const missing = visibleIds.filter((id) => !inQueue.has(id));
    if (missing.length) practiceQueue = practiceQueue.concat(shuffleIds(missing));
    if (!practiceQueue.length && visibleIds.length) {
      practiceQueue = shuffleIds(visibleIds);
    }
    if (currentId) {
      const idx = practiceQueue.indexOf(currentId);
      practiceIndex = idx >= 0 ? idx : 0;
    } else {
      practiceIndex = 0;
    }
  }

  function setPracticeUi(on) {
    practiceOn = on;
    document.body.classList.toggle("practice-mode", on);
    const btn = document.getElementById("btn-practice");
    if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (!on) {
      practiceQueue = [];
      practiceIndex = 0;
      document.querySelectorAll(".case-row.is-practice-current").forEach((r) => {
        r.classList.remove("is-practice-current");
      });
    }
  }

  function refreshPractice() {
    if (!practiceOn) return;
    syncPracticeQueue();
    if (!practiceQueue.length) {
      document.querySelectorAll(".case-row").forEach((r) => r.classList.remove("is-practice-current"));
      const meta = document.getElementById("practice-meta");
      if (meta) meta.textContent = "0 / 0";
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
    const meta = document.getElementById("practice-meta");
    if (meta) meta.textContent = (practiceIndex + 1) + " / " + practiceQueue.length;
    const name = current.querySelector(".title")?.textContent?.trim() || ("#" + current.dataset.case);
    if (meta) meta.title = name + " · random order";
    current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function practiceStep(delta) {
    if (!practiceOn) return;
    syncPracticeQueue();
    if (!practiceQueue.length) return;
    practiceIndex = (practiceIndex + delta + practiceQueue.length) % practiceQueue.length;
    refreshPractice();
  }

  function enterPractice(fromCase) {
    const rows = visibleCaseRows();
    if (!rows.length) return;
    practiceQueue = shuffleIds(rows.map((r) => r.dataset.case));
    if (fromCase != null) {
      const idx = practiceQueue.indexOf(String(fromCase));
      practiceIndex = idx >= 0 ? idx : 0;
    } else {
      practiceIndex = 0;
    }
    setPracticeUi(true);
    setAnchorsCollapsed(true);
    refreshPractice();
  }

  function exitPractice() {
    const current = document.querySelector(".case-row.is-practice-current");
    const id = current?.id;
    setPracticeUi(false);
    if (id) {
      requestAnimationFrame(() => scrollToId(id, 180));
    }
  }

  function setAnchorsCollapsed(collapsed) {
    const wrap = document.getElementById("anchors-wrap");
    const btn = document.getElementById("btn-groups");
    if (!wrap || !btn) return;
    wrap.classList.toggle("is-collapsed", collapsed);
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
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
      const addBtn = e.target.closest("[data-add-alg]");
      if (addBtn) {
        openModal(row.dataset.case, null);
        return;
      }
      const editBtn = e.target.closest("[data-edit]");
      if (editBtn) {
        const m = /^custom-(\\d+)$/.exec(editBtn.dataset.edit);
        if (!m) return;
        openModal(row.dataset.case, Number(m[1]));
      }
    });
  }

  function openModal(caseNum, editIdx) {
    modalCase = caseNum;
    modalEditIdx = editIdx == null ? null : editIdx;
    const modal = document.getElementById("alg-modal");
    const input = document.getElementById("alg-modal-input");
    const note = document.getElementById("alg-modal-note");
    const title = document.getElementById("alg-modal-title");
    const saveBtn = document.getElementById("alg-modal-save");
    const removeBtn = document.getElementById("alg-modal-remove");
    const editing = modalEditIdx != null;
    if (title) title.textContent = (editing ? "Edit alg" : "Add alg") + " · OLL #" + caseNum;
    if (saveBtn) saveBtn.textContent = editing ? "Save" : "Add";
    if (removeBtn) removeBtn.hidden = !editing;
    if (editing) {
      const entry = normalizeCustomEntry(ensure(caseNum).custom[modalEditIdx] || { alg: "", note: "" });
      if (input) input.value = entry.alg;
      if (note) note.value = entry.note;
    } else {
      if (input) input.value = "";
      if (note) note.value = "";
    }
    modal?.classList.add("is-open");
    modal?.setAttribute("aria-hidden", "false");
    setTimeout(() => input?.focus(), 30);
  }

  function closeModal() {
    modalCase = null;
    modalEditIdx = null;
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
    const noteEl = document.getElementById("alg-modal-note");
    const alg = (input?.value || "").trim();
    const note = (noteEl?.value || "").trim();
    if (!alg || modalCase == null) return;
    const data = ensure(modalCase);
    const entry = { alg, note };
    if (modalEditIdx != null) {
      data.custom[modalEditIdx] = entry;
    } else {
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

  function removeModalAlg() {
    if (modalCase == null || modalEditIdx == null) return;
    const data = ensure(modalCase);
    const idx = modalEditIdx;
    data.custom.splice(idx, 1);
    if (String(data.favorite).startsWith("custom-")) {
      const favIdx = Number(String(data.favorite).replace("custom-", ""));
      if (favIdx === idx) data.favorite = "primary";
      else if (favIdx > idx) data.favorite = "custom-" + (favIdx - 1);
    }
    saveLocal();
    const row = document.querySelector('.case-row[data-case="' + modalCase + '"]');
    if (row) {
      syncCustomRows(row);
      applyAlgOrder(row);
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

    let lastScrollY = window.scrollY;
    window.addEventListener(
      "scroll",
      () => {
        if (!window.matchMedia("(max-width: 720px)").matches) return;
        const y = window.scrollY;
        if (y > lastScrollY + 24) setAnchorsCollapsed(true);
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
    document.getElementById("alg-modal-remove")?.addEventListener("click", removeModalAlg);
    document.getElementById("alg-modal-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitModal();
      }
      if (e.key === "Escape") closeModal();
    });
    document.getElementById("alg-modal-note")?.addEventListener("keydown", (e) => {
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

</head>
<body>
  <header class="toolbar">
    <div class="toolbar-top">
      <div class="brand"><img class="brand-mark" src="favicon.svg" width="27" height="27" alt="" /><span class="brand-text">Gabis OLL Trainer</span><span id="source-stamp" class="source-stamp" data-source="local" title="Progress source">local</span></div>
      <span id="save-stamp"></span>
      <div class="actions" id="actions-menu">
        <button type="button" class="mode-chip" id="btn-practice" aria-pressed="false" title="Practice filtered cases in random order">Practice</button>
        <button type="button" class="icon-btn" id="btn-notation" aria-label="Cube notation" title="Notation">
          <i class="fa-solid fa-book" aria-hidden="true"></i>
        </button>
        <button type="button" class="icon-btn" id="btn-menu" aria-expanded="false" aria-controls="actions-panel" aria-label="File actions" title="File">
          <i class="fa-solid fa-file" aria-hidden="true"></i>
        </button>
        <div class="actions-panel" id="actions-panel" role="menu">
          <button type="button" class="btn btn-ghost" id="btn-import" role="menuitem">Import</button>
          <button type="button" class="btn btn-ghost" id="btn-export" role="menuitem">Export JSON</button>
          <button type="button" class="btn btn-primary" id="btn-print" role="menuitem">Print / PDF</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden />
      </div>
    </div>
    <div class="filters" aria-label="Status filter">
      <button type="button" class="filter-chip" data-filter="red"><span class="pip"></span><span class="lbl-full"> Not learned </span><span class="lbl-short"> Not </span><span class="n" data-count="red">0</span></button>
      <button type="button" class="filter-chip" data-filter="orange"><span class="pip"></span><span class="lbl-full"> Learning </span><span class="lbl-short"> Learn </span><span class="n" data-count="orange">0</span></button>
      <button type="button" class="filter-chip" data-filter="green"><span class="pip"></span><span class="lbl-full"> Learned </span><span class="lbl-short"> Done </span><span class="n" data-count="green">0</span></button>
    </div>
    <div class="anchors-wrap is-collapsed" id="anchors-wrap">
      <button type="button" class="anchors-toggle" id="btn-groups" aria-expanded="false" aria-controls="anchors-nav" aria-label="Groups" title="Groups">
        <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
      </button>
      <nav class="anchors" id="anchors-nav" aria-label="Groups">
        ${navLinks}
      </nav>
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
        Note
        <input type="text" id="alg-modal-note" placeholder="Optional note for this alg" autocomplete="off" />
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn-danger" id="alg-modal-remove" hidden>Remove</button>
        <span class="modal-actions-spacer"></span>
        <button type="button" class="btn btn-ghost" id="alg-modal-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="alg-modal-save">Add</button>
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

const example = {
  version: 2,
  updatedAt: null,
  cases: {
    "27": {
      status: "green",
      favorite: "custom-0",
      custom: [{ alg: "R U R' U R U2 R'", note: "Muscle memory solid" }],
    },
    "26": {
      status: "orange",
      favorite: "secondary",
      custom: [],
    },
  },
};
writeFileSync(join(__dirname, "oll-progress.example.json"), JSON.stringify(example, null, 2) + "\n", "utf8");

console.log(`Wrote index.html · ${cards.length} cases · ${groups.length} groups`);
