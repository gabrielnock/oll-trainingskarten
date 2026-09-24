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

  function saveLocal() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const stamp = document.getElementById("save-stamp");
    if (stamp) stamp.textContent = "Saved locally · " + new Date().toLocaleTimeString();
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.cases) {
        state = { version: 2, updatedAt: parsed.updatedAt || null, cases: parsed.cases };
        Object.keys(state.cases).forEach((k) => {
          state.cases[k] = migrateCase(state.cases[k]);
        });
      }
    } catch (_) {}
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
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed.cases !== "object") throw new Error("Invalid file");
        state = { version: 2, updatedAt: parsed.updatedAt || null, cases: parsed.cases };
        Object.keys(state.cases).forEach((k) => {
          state.cases[k] = migrateCase(state.cases[k]);
        });
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

  loadLocal();
  bindGlobal();
  applyAll();
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
  <style>
    :root {
      --main: #566996;
      --main-lt: #a6abbd;
      --gold: #a44f5f;
      --brown: #424656;
      --white: #ffffff;
      --off: #f2f3f6;
      --dove: #a6abbd;
      --dove-mid: #7a8090;
      --dove-blue: var(--main);
      --dove-blue-lt: var(--main-lt);
      --anthracite: var(--brown);
      --ink: #424656;
      --text: #424656;
      --muted: #6e7486;
      --coral: var(--gold);
      --mustard: var(--gold);
      --teal: var(--main);
      --sage: var(--main-lt);
      --sky: var(--main-lt);
      --status-red: #9a1212;
      --status-orange: #ffb347;
      --status-green: #2e7d32;
      --cream: #f7f2f3;
      --mist: #eceef2;
      --line: rgba(86, 105, 150, 0.18);
      --card: var(--white);
      --glass: rgba(242, 243, 246, 0.94);
      --shadow: 0 12px 36px rgba(66, 70, 86, 0.14);
      --radius: 16px;
      --font: "IBM Plex Mono", "Courier New", monospace;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: auto; }
    body {
      margin: 0;
      font-family: var(--font);
      color: var(--text);
      background-color: var(--off);
      background-image:
        linear-gradient(135deg, rgba(86, 105, 150, 0.14) 0%, transparent 42%),
        linear-gradient(225deg, rgba(164, 79, 95, 0.14) 0%, transparent 40%),
        linear-gradient(180deg, #f7f8fa 0%, var(--off) 40%, #e6e8ee 100%),
        repeating-linear-gradient(-18deg, transparent, transparent 18px, rgba(86,105,150,0.03) 18px, rgba(86,105,150,0.03) 19px);
      min-height: 100vh;
      position: relative;
    }
    body::before,
    body::after {
      content: "";
      position: fixed;
      pointer-events: none;
      z-index: 0;
      border-radius: 40% 60% 55% 45%;
      filter: blur(2px);
    }
    body::before {
      width: min(52vw, 420px);
      height: min(52vw, 420px);
      top: -8%;
      right: -6%;
      background: radial-gradient(circle, rgba(164, 79, 95, 0.3), transparent 70%);
    }
    body::after {
      width: min(48vw, 380px);
      height: min(48vw, 380px);
      bottom: 5%;
      left: -8%;
      background: radial-gradient(circle, rgba(166, 171, 189, 0.4), transparent 70%);
    }
    .toolbar, main, .modal { position: relative; z-index: 1; }

    .toolbar {
      position: sticky;
      top: 0;
      z-index: 80;
      padding: 0.7rem 1rem 0.85rem;
      background: var(--glass);
      backdrop-filter: blur(18px) saturate(1.15);
      -webkit-backdrop-filter: blur(18px) saturate(1.15);
      border-bottom: 3px solid var(--anthracite);
      box-shadow: 0 10px 30px rgba(42,46,51,0.08);
    }
    .toolbar::after {
      content: "";
      position: absolute;
      left: 0; right: 0; bottom: -6px;
      height: 6px;
      background: linear-gradient(90deg, var(--main), var(--main-lt) 35%, var(--gold) 70%, var(--brown));
    }
    .toolbar-top {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 0.75rem;
      align-items: center;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      font-size: 1.02rem;
      color: var(--anthracite);
      min-width: 0;
    }
    .brand-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .brand-mark {
      width: 1.7rem;
      height: 1.7rem;
      flex-shrink: 0;
      display: block;
      border-radius: 0.4rem;
    }
    #save-stamp {
      font-size: 0.65rem;
      color: var(--muted);
      margin-left: 0.15rem;
    }

    .actions {
      margin-left: auto;
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .icon-btn {
      appearance: none;
      width: 2.1rem;
      height: 2.1rem;
      padding: 0;
      border: 2px solid var(--dove);
      border-radius: 10px;
      background: rgba(255,255,255,0.9);
      color: var(--anthracite);
      cursor: pointer;
      display: grid;
      place-items: center;
      box-shadow: 2px 2px 0 rgba(42,46,51,0.08);
    }
    .icon-btn:hover,
    .icon-btn[aria-expanded="true"] {
      border-color: var(--anthracite);
      background: var(--mist);
    }
    .icon-btn svg,
    .icon-btn i { font-size: 0.95rem; line-height: 1; display: block; }
    .actions-panel {
      display: none;
      position: absolute;
      top: calc(100% + 0.35rem);
      right: 0;
      z-index: 90;
      min-width: 11.5rem;
      padding: 0.4rem;
      background: var(--white);
      border: 2px solid var(--anthracite);
      border-radius: 12px;
      box-shadow: 4px 4px 0 var(--dove-blue);
      flex-direction: column;
      gap: 0.3rem;
    }
    .actions.is-open .actions-panel { display: flex; }
    .actions-panel .btn {
      width: 100%;
      justify-content: flex-start;
      box-shadow: none;
    }
    .btn {
      appearance: none;
      border: 2px solid var(--anthracite);
      border-radius: 10px;
      padding: 0.42rem 0.9rem;
      font-size: 0.76rem;
      font-weight: 700;
      font-family: var(--font);
      cursor: pointer;
      background: var(--white);
      color: var(--anthracite);
      box-shadow: 3px 3px 0 var(--dove);
      transition: transform .12s ease, box-shadow .12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--dove-blue); }
    .btn-primary {
      color: var(--white);
      background: var(--anthracite);
      box-shadow: 3px 3px 0 var(--gold);
    }
    .btn-primary:hover { box-shadow: 4px 4px 0 var(--mustard); }
    .btn-ghost { background: rgba(255,255,255,0.85); }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.7rem;
      align-items: center;
    }
    .filter-chip {
      border: 2px solid var(--dove);
      background: var(--white);
      border-radius: 999px;
      padding: 0.32rem 0.75rem;
      font-size: 0.72rem;
      font-weight: 700;
      font-family: var(--font);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--anthracite);
      box-shadow: 2px 2px 0 rgba(42,46,51,0.08);
    }
    .filter-chip .pip {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 50%;
      background: var(--dove-mid);
    }
    .filter-chip[data-filter="red"] .pip { background: var(--status-red); }
    .filter-chip[data-filter="orange"] .pip { background: var(--status-orange); }
    .filter-chip[data-filter="green"] .pip { background: var(--status-green); }
    .filter-chip.is-on {
      color: var(--white);
      border-color: transparent;
    }
    .filter-chip.is-on[data-filter="red"] { background: var(--status-red); }
    .filter-chip.is-on[data-filter="orange"] { background: var(--status-orange); }
    .filter-chip.is-on[data-filter="green"] { background: var(--status-green); }
    .filter-chip .n {
      font-variant-numeric: tabular-nums;
      opacity: 0.9;
      font-size: 0.68rem;
      background: rgba(255,255,255,0.25);
      border-radius: 999px;
      padding: 0 0.35rem;
    }

    .anchors-wrap {
      margin-top: 0.85rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .anchors-toggle {
      appearance: none;
      width: 2.1rem;
      height: 2.1rem;
      padding: 0;
      border: 2px solid var(--dove);
      background: rgba(255,255,255,0.9);
      border-radius: 10px;
      color: var(--anthracite);
      cursor: pointer;
      display: grid;
      place-items: center;
      box-shadow: 2px 2px 0 rgba(42,46,51,0.08);
      flex-shrink: 0;
    }
    .anchors-toggle:hover,
    .anchors-toggle[aria-expanded="true"] {
      border-color: var(--anthracite);
      background: var(--mist);
    }
    .anchors-toggle i { font-size: 0.95rem; line-height: 1; }
    .anchors {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: 0.5rem;
      align-items: center;
      justify-content: flex-end;
      width: 100%;
    }
    .anchors-wrap.is-collapsed .anchors {
      display: none;
    }
    .nav-chip {
      text-decoration: none;
      color: var(--anthracite);
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.35rem 0.65rem;
      border-radius: 8px;
      background: var(--white);
      border: 2px solid var(--dove);
      white-space: nowrap;
    }
    .nav-chip:hover {
      border-color: var(--anthracite);
      background: var(--mist);
      color: var(--anthracite);
    }
    .filter-chip .lbl-short { display: none; }

    .mode-chip {
      border: 2px solid var(--dove);
      background: var(--white);
      border-radius: 999px;
      padding: 0.32rem 0.75rem;
      font-size: 0.72rem;
      font-weight: 700;
      font-family: var(--font);
      cursor: pointer;
      color: var(--anthracite);
      box-shadow: 2px 2px 0 rgba(42,46,51,0.08);
    }
    .mode-chip[aria-pressed="true"] {
      background: var(--main);
      color: var(--white);
      border-color: transparent;
    }

    main { padding: 1.25rem 1rem 3.5rem; max-width: 1140px; margin: 0 auto; }
    .group-section {
      margin-bottom: 2.5rem;
      scroll-margin-top: 8.5rem;
      padding: 0.85rem 0.9rem 1rem;
      background: rgba(255,255,255,0.55);
      border: 2px solid var(--dove);
      border-radius: 18px;
      box-shadow: var(--shadow);
    }
    .group-section:nth-child(4n+1) { border-top: 5px solid var(--main); }
    .group-section:nth-child(4n+2) { border-top: 5px solid var(--gold); }
    .group-section:nth-child(4n+3) { border-top: 5px solid var(--main-lt); }
    .group-section:nth-child(4n+4) { border-top: 5px solid var(--brown); }
    .group-heading {
      margin: 0 0 0.75rem;
      font-size: 1.28rem;
      letter-spacing: -0.03em;
      color: var(--anthracite);
      display: flex;
      gap: 0.5rem;
      align-items: baseline;
    }
    .group-heading .count {
      font-size: 0.78rem;
      color: var(--white);
      font-weight: 700;
      background: var(--anthracite);
      border-radius: 999px;
      padding: 0.1rem 0.5rem;
    }

    .ref-list {
      background: var(--white);
      border: 2px solid var(--dove);
      border-radius: 14px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .ref-row {
      display: grid;
      grid-template-columns: minmax(12rem, 15rem) 1fr;
      gap: 0.5rem 1rem;
      padding: 0.42rem 0.75rem;
      border-bottom: 1px solid rgba(196,191,182,0.55);
      align-items: center;
    }
    .ref-row:nth-child(odd) { background: rgba(232,238,243,0.35); }
    .ref-row:last-child { border-bottom: none; }
    .ref-row[data-status="red"] { box-shadow: inset 4px 0 0 var(--status-red); background: rgba(154, 18, 18, 0.08); }
    .ref-row[data-status="orange"] { box-shadow: inset 4px 0 0 var(--status-orange); background: rgba(255, 179, 71, 0.16); }
    .ref-row[data-status="green"] { box-shadow: inset 4px 0 0 var(--status-green); background: rgba(46, 125, 50, 0.1); }
    .ref-link {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      color: var(--anthracite);
      text-decoration: none;
      font-size: 0.82rem;
      min-width: 0;
      font-weight: 600;
    }
    .ref-link:hover { color: var(--main); }
    .thumb {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: var(--cream);
      border: 2px solid var(--dove);
      flex-shrink: 0;
      display: inline-grid;
      place-items: center;
      overflow: hidden;
    }
    .thumb .cube-svg,
    .cube-thumb {
      width: 26px;
      height: 26px;
      display: block;
    }
    .ref-alg {
      font-size: 0.72rem;
      color: var(--muted);
      word-break: break-word;
    }

    .cards {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.2rem;
    }
    .case-row {
      display: flex;
      gap: 0.7rem;
      align-items: flex-start;
      width: min(100%, 148mm);
      scroll-margin-top: 8.5rem;
    }
    .case-row[hidden],
    .case-row.is-filtered-out,
    .ref-row[hidden],
    .ref-row.is-filtered-out,
    .group-section[hidden] {
      display: none !important;
    }
    .case-row[data-status="red"] .card { box-shadow: 0 0 0 3px rgba(154, 18, 18, 0.4), 5px 5px 0 var(--main-lt); }
    .case-row[data-status="orange"] .card { box-shadow: 0 0 0 3px rgba(255, 179, 71, 0.55), 5px 5px 0 var(--main-lt); }
    .case-row[data-status="green"] .card { box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.4), 5px 5px 0 var(--main-lt); }

    .card {
      width: 105mm;
      height: 148mm;
      background: var(--card);
      border: 2px solid var(--anthracite);
      border-radius: 6px;
      box-shadow: 5px 5px 0 var(--dove-blue-lt);
      padding: 3.8mm 4.5mm 3.2mm;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      position: relative;
      overflow: hidden;
    }
    .card-accent {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3.2mm;
      background: linear-gradient(90deg, var(--main), var(--main-lt), var(--gold));
    }
    .group {
      margin: 3mm 0 0;
      font-size: 6.2pt;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--dove-blue);
      font-weight: 700;
    }
    .title-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 3mm;
      margin-top: 0.6mm;
    }
    .status-toggle {
      appearance: none;
      border: 2px solid var(--dove);
      background: var(--white);
      width: 1.55rem;
      height: 1.55rem;
      border-radius: 0.45rem;
      padding: 0;
      cursor: pointer;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      align-self: center;
      box-shadow: 2px 2px 0 rgba(42,46,51,0.08);
    }
    .status-toggle[aria-expanded="true"] {
      border-color: var(--anthracite);
      background: var(--mist);
    }
    .status-pip {
      width: 0.65rem;
      height: 0.65rem;
      border-radius: 0.2rem;
      background: var(--status-red);
    }
    .case-row[data-status="red"] .status-pip { background: var(--status-red); }
    .case-row[data-status="orange"] .status-pip { background: var(--status-orange); }
    .case-row[data-status="green"] .status-pip { background: var(--status-green); }
    .title {
      margin: 0;
      font-size: 13.5pt;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--anthracite);
      flex: 1;
    }
    .case-no {
      font-size: 8pt;
      color: var(--white);
      font-weight: 700;
      background: var(--anthracite);
      border-radius: 999px;
      padding: 0.4mm 1.6mm;
    }
    .diagram {
      margin: 1.6mm auto 1.2mm;
      padding: 0;
      background: transparent;
      border: none;
    }
    .diagram .cube-svg {
      width: 38mm;
      height: auto;
      display: block;
      transform-origin: 50% 50%;
      transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
      will-change: transform;
    }
    .alg-auf {
      opacity: 0.28;
      font-weight: 500;
      transition: opacity 0.35s ease;
    }
    .alg-rest { font-weight: inherit; }
    .ref-alg .alg-auf { opacity: 0.35; }

    .inline-box {
      display: flex;
      align-items: stretch;
      width: 100%;
      min-height: 5.5mm;
      border: 1.5px solid var(--dove);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 1.3mm;
      background: var(--white);
    }
    .inline-label {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      padding: 0 2mm;
      font-size: 5.8pt;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--white);
      background: var(--anthracite);
      white-space: nowrap;
    }
    .inline-value {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      padding: 0.8mm 1.8mm;
      font-size: 8.6pt;
      line-height: 1.25;
      display: flex;
      align-items: center;
      color: var(--ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .inline-value.alg {
      font-size: 9pt;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      padding-top: 1.1mm;
      padding-bottom: 1.1mm;
    }
    .setup-box { border-color: var(--gold); }
    .setup-box .inline-label { background: var(--brown); }
    .setup-box .inline-value { background: var(--cream); font-size: 9pt; }
    .alg-meta {
      margin-top: 1.4mm;
      width: 100%;
    }
    .tip-box { border-color: var(--main-lt); margin-top: 0; }
    .tip-box .inline-label { background: var(--main); }
    .tip-box .inline-value {
      background: var(--mist);
      color: var(--main);
      font-size: 7.2pt;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .note-box { border-color: var(--dove-blue); margin-top: 0; }
    .note-box .inline-label { background: var(--dove-blue); }
    .note-box .inline-value {
      background: #f3f6f8;
      font-size: 7.2pt;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .alg-list {
      display: flex;
      flex-direction: column;
      gap: 1.4mm;
      margin-top: 0.5mm;
      flex: 1;
    }
    .alg-row {
      display: grid;
      grid-template-columns: 7mm 1fr;
      gap: 1.4mm;
      align-items: stretch;
      border: 2px solid var(--dove);
      border-radius: 6px;
      padding: 1.2mm 1.5mm 1.2mm 0.8mm;
      background: #fafaf8;
      will-change: transform;
    }
    .alg-row.is-flipping {
      position: relative;
      z-index: 3;
      box-shadow: 0 6px 18px rgba(86, 105, 150, 0.18);
    }
    .alg-row.is-favorite {
      margin-bottom: 5.5mm;
      border-color: var(--anthracite);
      background: var(--white);
      box-shadow: inset 3px 0 0 var(--gold);
    }
    .alg-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2mm;
    }
    .alg-label {
      margin: 0;
      font-size: 5.5pt;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--dove-blue);
      font-weight: 700;
    }
    .alg {
      margin: 0.5mm 0 0;
      font-size: 9.5pt;
      line-height: 1.28;
      word-break: break-word;
      color: var(--ink);
    }
    .alg.primary, .alg-row.is-favorite .alg { font-weight: 700; }
    .fav {
      display: grid;
      place-items: center;
      cursor: pointer;
      user-select: none;
      align-self: start;
      margin-top: 0.8mm;
    }
    .fav input { position: absolute; opacity: 0; pointer-events: none; }
    .fav span {
      font-size: 11pt;
      line-height: 1;
      color: var(--dove);
      transition: color .15s ease, transform .15s ease;
    }
    .fav input:checked + span,
    .alg-row.is-favorite .fav span {
      color: var(--gold);
    }
    .btn-edit-alg {
      appearance: none;
      border: 1.5px solid var(--dove);
      background: var(--white);
      color: var(--anthracite);
      cursor: pointer;
      font-size: 6.5pt;
      font-weight: 700;
      font-family: var(--font);
      line-height: 1;
      padding: 0.8mm 1.6mm;
      border-radius: 999px;
    }
    .btn-edit-alg:hover {
      border-color: var(--anthracite);
      background: var(--mist);
    }

    .card-actions {
      margin: auto 0 0;
      padding-top: 1.2mm;
      display: flex;
      justify-content: flex-end;
    }
    .btn-add-alg {
      appearance: none;
      border: 1px solid rgba(158, 151, 140, 0.55);
      background: rgba(232, 238, 243, 0.45);
      color: rgba(102, 112, 122, 0.75);
      border-radius: 999px;
      width: 5.2mm;
      height: 5.2mm;
      padding: 0;
      font-size: 9pt;
      font-weight: 600;
      font-family: var(--font);
      line-height: 1;
      cursor: pointer;
      display: grid;
      place-items: center;
      opacity: 0.7;
    }
    .btn-add-alg:hover {
      opacity: 1;
      border-color: var(--dove-blue);
      color: var(--anthracite);
      background: rgba(232, 238, 243, 0.9);
    }

    .status-panel {
      width: 34mm;
      background: var(--white);
      border: 2px solid var(--anthracite);
      border-radius: 12px;
      padding: 2.4mm;
      display: none;
      flex-direction: column;
      gap: 2mm;
      box-shadow: 4px 4px 0 var(--gold);
      align-self: flex-start;
      margin-top: 0;
    }
    .case-row.status-open .status-panel {
      display: flex;
    }
    .status-opt {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
      font-size: 0.66rem;
      font-weight: 700;
      user-select: none;
    }
    .status-opt input { position: absolute; opacity: 0; pointer-events: none; }
    .status-opt .dot {
      width: 0.9rem;
      height: 0.9rem;
      border-radius: 0.28rem;
      border: 2px solid var(--dove);
      background: var(--white);
      flex-shrink: 0;
    }
    .status-opt.red .dot { border-color: var(--status-red); }
    .status-opt.orange .dot { border-color: var(--status-orange); }
    .status-opt.green .dot { border-color: var(--status-green); }
    .status-opt input:checked + .dot {
      background: currentColor;
      box-shadow: inset 0 0 0 2px #fff;
    }
    .status-opt.red { color: var(--status-red); }
    .status-opt.orange { color: var(--status-orange); }
    .status-opt.green { color: var(--status-green); }

    .modal {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .modal.is-open { display: flex; }
    .modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(23, 26, 29, 0.5);
      backdrop-filter: blur(4px);
    }
    .modal-panel {
      position: relative;
      width: min(100%, 420px);
      background: var(--white);
      border-radius: 16px;
      padding: 1.1rem 1.15rem 1rem;
      box-shadow: 8px 8px 0 var(--anthracite);
      border: 2px solid var(--anthracite);
      font-family: var(--font);
    }
    .modal-panel h3 {
      margin: 0 0 0.75rem;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
      color: var(--anthracite);
    }
    .modal-panel label {
      display: grid;
      gap: 0.35rem;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--dove-blue);
      margin-top: 0.65rem;
    }
    .modal-panel label:first-of-type { margin-top: 0; }
    .modal-panel input[type="text"] {
      width: 100%;
      border: 2px solid var(--dove);
      border-radius: 10px;
      padding: 0.7rem 0.8rem;
      font-size: 0.9rem;
      font-family: var(--font);
      color: var(--ink);
      background: var(--off);
    }
    .modal-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.45rem;
      margin-top: 0.9rem;
    }
    .modal-actions-spacer { flex: 1; }
    .btn-danger {
      color: var(--white);
      background: var(--status-red);
      border-color: var(--status-red);
      box-shadow: 3px 3px 0 rgba(154, 18, 18, 0.35);
      margin-right: auto;
    }
    .btn-danger:hover { box-shadow: 4px 4px 0 rgba(154, 18, 18, 0.45); }

    .practice-bar {
      display: none;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 70;
      padding: 0.65rem 1rem calc(0.65rem + env(safe-area-inset-bottom));
      background: var(--glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-top: 2px solid var(--anthracite);
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      box-shadow: 0 -8px 24px rgba(42,46,51,0.08);
    }
    body.practice-mode .practice-bar { display: flex; }
    body.practice-mode .group-heading,
    body.practice-mode .ref-list { display: none !important; }
    body.practice-mode .group-section {
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      box-shadow: none;
    }
    body.practice-mode .group-section[hidden] { display: none !important; }
    body.practice-mode .cards { gap: 0; min-height: 70vh; justify-content: center; }
    body.practice-mode .case-row { display: none; }
    body.practice-mode .case-row.is-practice-current {
      display: flex;
      margin: 0 auto;
    }
    body.practice-mode main { padding-bottom: 5.5rem; }
    .practice-bar .btn { min-width: 2.5rem; }
    .practice-meta {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--anthracite);
      min-width: 5.5rem;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 720px) {
      .toolbar {
        padding-top: max(0.55rem, env(safe-area-inset-top));
        padding-bottom: 0.65rem;
        padding-left: max(0.75rem, env(safe-area-inset-left));
        padding-right: max(0.75rem, env(safe-area-inset-right));
      }
      .brand { font-size: 0.88rem; }
      #save-stamp { display: none; }
      .ref-row { grid-template-columns: 1fr; }
      .case-row { flex-direction: column; align-items: center; }
      .case-row.status-open .status-panel {
        width: min(105mm, 100%);
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
      }
      .filters {
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 0.15rem;
        margin-left: -0.15rem;
        margin-right: -0.15rem;
        padding-left: 0.15rem;
        padding-right: 0.15rem;
      }
      .filters::-webkit-scrollbar { display: none; }
      .anchors {
        justify-content: flex-end;
      }
      .filter-chip {
        flex-shrink: 0;
        min-height: 2rem;
        padding: 0.28rem 0.6rem;
      }
      .filter-chip .lbl-full { display: none; }
      .filter-chip .lbl-short { display: inline; }
      .nav-chip { flex-shrink: 0; min-height: 2rem; display: inline-flex; align-items: center; }
      .anchors-wrap { margin-top: 0.7rem; padding-top: 0.7rem; }
      main {
        padding: 1rem max(0.75rem, env(safe-area-inset-left)) calc(2.5rem + env(safe-area-inset-bottom));
        padding-right: max(0.75rem, env(safe-area-inset-right));
      }
      body.practice-mode main {
        padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
      }
      .group-section { scroll-margin-top: 7.5rem; }
      .modal-panel input,
      #alg-modal-input,
      #alg-modal-note { font-size: 16px; }
      body.practice-mode .card {
        width: min(105mm, calc(100vw - 1.5rem));
        height: auto;
        min-height: 0;
        max-height: none;
      }
    }

    @media print {
      body { background: #fff; }
      body::before, body::after { display: none !important; }
      .toolbar, .ref-list, .group-heading, .screen-only, .modal, .card-accent, .practice-bar { display: none !important; }
      body.practice-mode .case-row:not(.is-filtered-out) { display: block !important; }
      body.practice-mode .group-section { display: block !important; }
      .group-section {
        margin: 0;
        padding: 0;
        border: none;
        background: transparent;
        box-shadow: none;
      }
      main { padding: 0; max-width: none; }
      .cards, .case-row { gap: 0; width: auto; display: block; }
      .case-row { page-break-after: always; break-after: page; }
      .case-row[hidden], .case-row.is-filtered-out { display: none !important; }
      .card {
        box-shadow: none !important;
        border: none;
        border-radius: 0;
        width: 105mm;
        height: 148mm;
      }
      .alg-row.is-favorite { margin-bottom: 5mm; }
      .diagram { border: none; }
      .tip-box .inline-value,
      .note-box .inline-value { white-space: normal; overflow: visible; text-overflow: unset; }
      .note-box:not(:has(.inline-value:not(:empty))) { display: none; }
    }
    @page { size: 105mm 148mm; margin: 0; }
  </style>

</head>
<body>
  <header class="toolbar">
    <div class="toolbar-top">
      <div class="brand"><img class="brand-mark" src="favicon.svg" width="27" height="27" alt="" /><span class="brand-text">Gabis OLL Trainer</span></div>
      <span id="save-stamp"></span>
      <div class="actions" id="actions-menu">
        <button type="button" class="mode-chip" id="btn-practice" aria-pressed="false" title="Practice filtered cases in random order">Practice</button>
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
