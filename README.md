# Gabis OLL Trainer

Interactive A6 flashcards for all **57 OLL cases** (CubeHead nicknames), with learning status, favorite algs, tips, permutation order, and a single JSON file for everything.

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
- **+ Alg** opens a modal to add your own algorithms (tip + order of permutation)
- **Edit** to change alg / tip / order, or **Hide** (permanent remove only from Hidden algs)
- Setup scramble + tip icons; order pill with tooltip
- **Export / Import** of the full `all-data.json`
- Progress auto-saved in `localStorage`
- On load: saved browser data (`localStorage`) first, else `all-data.json` / embedded defaults (first visit only)
- Practice mode: filtered cases in random order

## Data file (`all-data.json`)

One file holds **defaults and learning state**:

```json
{
  "version": 3,
  "updatedAt": null,
  "groups": [{ "id": "ocll", "label": "OCLL", "order": 0 }],
  "cases": [
    {
      "num": 25,
      "group": "ocll",
      "name": "Chameleon",
      "setup": "…",
      "status": "red",
      "favorite": "primary",
      "hidden": [],
      "discarded": [],
      "custom": [],
      "primary": { "alg": "(r U R' U') (r' F R F')", "order": 3, "tip": "…" },
      "secondary": { "alg": "…", "order": 3 }
    }
  ]
}
```

Edit `all-data.json`, then `npm run build`. Export/import use the same format so one file is a full snapshot of the app.

## Rebuild

```bash
npm run build   # reads all-data.json, fetches VisualCube SVGs (cached), writes index.html
```

## Styles

Edit **`styles.css`** for layout/colors. Linked from `index.html` (no rebuild needed for CSS-only tweaks — just refresh). Run `npm run build` after changing `generate-html.mjs` or `all-data.json`.

Cube diagrams are **inline SVGs**. Yellow `#FEFE00` → `#E8C20A`, grey `#404040` → `#424656`.
