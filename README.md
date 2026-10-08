# Gabis OLL Trainer

Interactive A6 flashcards for all **57 OLL cases** (CubeHead nicknames), with learning status, favorite algs, per-alg notes, and JSON progress export.

## Quick start

```bash
npm run open
# or
npm start
```

## Features

- Sticky glass header with group anchors + status filters (red / orange / green)
- Case thumbnails in each group submenu
- Status beside each card (not learned / learning / learned) — default is not learned
- ★ favorite toggle per alg — favorite is bold and shown first (also in Print/PDF)
- **+ Alg** opens a modal to add your own algorithms (with optional note)
- **Edit** on custom algs to change alg/note or remove
- Tips shown with the default primary algorithm
- **Export JSON** / **Import** for backup & migration (`oll-progress.json`)
- Progress auto-saved in `localStorage`
- On load: if `oll-progress.json` exists next to the app, that file is used; otherwise `localStorage`
- Practice mode: filtered cases in random order

## Progress file format

Put an exported `oll-progress.json` in the same folder as `index.html` (e.g. commit it for GitHub Pages) to share progress across devices. Edits in the browser still only update `localStorage` until you export and replace that file.

See `oll-progress.example.json`:

```json
{
  "version": 2,
  "updatedAt": "…",
  "cases": {
    "27": {
      "status": "green",
      "favorite": "custom-0",
      "custom": [
        { "alg": "R U R' U R U2 R'", "note": "…" }
      ]
    }
  }
}
```

## Rebuild

```bash
npm run parse
npm run build   # fetches VisualCube SVGs (cached in svg-cache/), recolors, writes index.html
```

## Styles

Edit **`styles.css`** for layout/colors. Linked from `index.html` (no rebuild needed for CSS-only tweaks — just refresh). Run `npm run build` after changing `generate-html.mjs`.

Cube diagrams are **inline SVGs**. Yellow `#FEFE00` → `#E8C20A`, grey `#404040` → `#424656`.
