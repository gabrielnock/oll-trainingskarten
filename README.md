# OLL Training Cards (A6)

Interactive A6 flashcards for all **57 OLL cases** (CubeHead nicknames), with learning status, favorite algs, notes, and JSON progress export.

## Quick start

```bash
npm run open
# or
npm start
```

## Features

- Sticky glass header with group anchors + status filters (red / yellow / green / unmarked)
- Case thumbnails in each group submenu
- Status checkboxes beside each card (not learned / learning / learned)
- ★ favorite toggle per alg — favorite is bold and shown first (also in Print/PDF)
- **+ Alg** button opens a modal to add your own algorithms
- One note field per card (bottom)
- **Export JSON** / **Import** for backup & migration (`oll-progress.json`)
- Progress also auto-saved in `localStorage`

## Progress file format

See `oll-progress.example.json`:

```json
{
  "version": 1,
  "updatedAt": "…",
  "cases": {
    "27": {
      "status": "green",
      "favorite": "custom-0",
      "note": "…",
      "custom": ["R U R' U R U2 R'"]
    }
  }
}
```

## Rebuild

```bash
npm run parse
npm run build   # fetches VisualCube SVGs (cached in svg-cache/), recolors, writes index.html
```

Cube diagrams are **inline SVGs**. Yellow `#FEFE00` → `#D4AE00`, grey `#404040` → `#5C6A78`.