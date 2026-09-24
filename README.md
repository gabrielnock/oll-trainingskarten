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
- Progress also auto-saved in `localStorage`
- Practice mode: filtered cases in random order

## Progress file format

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

Cube diagrams are **inline SVGs**. Yellow `#FEFE00` → `#E8C20A`, grey `#404040` → `#424656`.
