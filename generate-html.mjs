import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(__dirname, "oll-cases.json"), "utf8"));
const notes = JSON.parse(readFileSync(join(__dirname, "cubehead-notes.json"), "utf8"));

const categoryDe = {
  "Dot Case": "Punkt-Fälle",
  "Square Shapes": "Quadrat",
  "Lightning Shapes": "Blitz",
  "Fish Shapes": "Fisch",
  "Knight Move Shapes": "Springer",
  "OCLL": "OCLL (gelöstes Kreuz)",
  "All Corners Oriented": "Alle Ecken orientiert",
  "Awkward Shapes": "Awkward",
  "T Shapes": "T-Form",
  "P Shapes": "P-Form",
  "C Shapes": "C-Form",
  "L Shapes": "L-Form",
  "Line Shapes": "Linie",
  "W Shapes": "W-Form",
};

function visualUrl(setup) {
  // Correct host: visualcube.api.cubing.net (api.cubing.net/v0/visualcube → 404)
  const params = new URLSearchParams({
    fmt: "svg",
    size: "160",
    view: "plan",
    stage: "oll",
    bg: "t",
    alg: setup || "R U R' U R U2' R'",
  });
  return `https://visualcube.api.cubing.net/?${params}`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const cards = cases
  .map((c) => {
    const ch = notes[String(c.num)] || {};
    const primary = ch.primary || c.primary;
    const secondary = ch.secondary !== undefined && ch.secondary !== "" ? ch.secondary : c.secondary;
    const title = ch.name ? `OLL ${c.num} · ${ch.name}` : `OLL ${c.num}`;
    const group = categoryDe[c.category] || c.category;
    return { ...c, ch, primary, secondary, title, group };
  })
  .sort((a, b) => a.num - b.num);

const cardHtml = cards
  .map(
    (c) => `
    <article class="card">
      <header class="card-head">
        <h1>${esc(c.title)}</h1>
        <p class="meta">${esc(c.group)}</p>
      </header>
      <div class="card-body">
        <figure class="diagram">
          <img src="${visualUrl(c.setup)}" alt="OLL ${c.num} Muster" loading="lazy" />
        </figure>
        <div class="algs">
          <section>
            <h2>Setup <span class="hint">(Fall erzeugen)</span></h2>
            <p class="alg">${esc(c.setup)}</p>
          </section>
          <section>
            <h2>Algorithmus <span class="hint">(CubeHead / Standard)</span></h2>
            <p class="alg primary">${esc(c.primary)}</p>
          </section>
          ${
            c.secondary
              ? `<section>
            <h2>Alternative</h2>
            <p class="alg">${esc(c.secondary)}</p>
          </section>`
              : ""
          }
          ${
            c.ch.notes
              ? `<section class="notes">
            <h2>Hinweise</h2>
            <p>${esc(c.ch.notes)}</p>
          </section>`
              : ""
          }
        </div>
      </div>
      <footer class="card-foot">OLL in One Month · CubeHead · Training</footer>
    </article>`
  )
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OLL Trainingskarten (DIN A6)</title>
  <style>
    :root {
      --ink: #1a1a1f;
      --muted: #5c5c66;
      --accent: #2563eb;
      --border: #d4d4dc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: var(--ink);
      background: #e8e8ee;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      padding: 0.75rem 1rem;
      background: #fff;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }
    .toolbar p { margin: 0; flex: 1; font-size: 0.9rem; color: var(--muted); }
    .toolbar button {
      padding: 0.5rem 1rem;
      font-size: 0.95rem;
      cursor: pointer;
      border: 1px solid var(--accent);
      background: var(--accent);
      color: #fff;
      border-radius: 6px;
    }
    .preview-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
    }
    .card {
      width: 105mm;
      min-height: 148mm;
      background: #fff;
      border: 1px solid var(--border);
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      padding: 4mm 5mm;
    }
    .card-head h1 {
      margin: 0;
      font-size: 11pt;
      line-height: 1.2;
    }
    .meta {
      margin: 1mm 0 0;
      font-size: 8pt;
      color: var(--muted);
    }
    .card-body {
      flex: 1;
      display: grid;
      grid-template-columns: 38mm 1fr;
      gap: 3mm;
      margin-top: 3mm;
      align-items: start;
    }
    .diagram {
      margin: 0;
      text-align: center;
    }
    .diagram img {
      width: 36mm;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .algs section { margin-bottom: 2.5mm; }
    .algs h2 {
      margin: 0 0 1mm;
      font-size: 7pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      font-weight: 600;
    }
    .hint { font-weight: 400; text-transform: none; letter-spacing: 0; }
    .alg {
      margin: 0;
      font-family: "Cascadia Mono", "Consolas", monospace;
      font-size: 7.5pt;
      line-height: 1.35;
      word-break: break-word;
    }
    .alg.primary { font-weight: 600; color: #0f172a; }
    .notes p {
      margin: 0;
      font-size: 7pt;
      line-height: 1.35;
      color: #334155;
    }
    .card-foot {
      margin-top: 2mm;
      padding-top: 2mm;
      border-top: 1px solid var(--border);
      font-size: 6pt;
      color: var(--muted);
      text-align: center;
    }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .preview-wrap { padding: 0; gap: 0; }
      .card {
        box-shadow: none;
        border: none;
        page-break-after: always;
        break-after: page;
      }
      .card:last-child { page-break-after: auto; }
    }
    @page {
      size: 105mm 148mm;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <p><strong>${cards.length} OLL-Karten</strong> · DIN A6 (105×148 mm) · Bilder laden beim ersten Öffnen (Internet nötig). Drucken: „Als PDF speichern“ oder doppelseitig schneiden.</p>
    <button type="button" onclick="window.print()">Drucken / PDF</button>
  </div>
  <main class="preview-wrap">
${cardHtml}
  </main>
</body>
</html>`;

writeFileSync(join(__dirname, "index.html"), html, "utf8");
console.log(`Wrote index.html with ${cards.length} cards`);
