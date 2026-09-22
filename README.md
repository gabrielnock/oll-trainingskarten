# OLL Trainingskarten (DIN A6)

Standalone project: printable training cards for all **57 OLL cases**, based on CubeHead’s *How to Learn OLL in One Month*, with setup algs and diagrams.

## Quick start

```bash
npm run open    # open index.html in the browser
# or
npm start       # local server on http://localhost:4173
```

Then use **Drucken / PDF** (or `Ctrl+P`). Paper size: **A6** (105 × 148 mm). Images need internet (VisualCube).

## Each card

- Name & group
- Top-view diagram
- **Setup** alg (create the case)
- Main alg (+ alternative)
- Tips from the CubeHead PDF

## Rebuild after edits

```bash
npm run parse   # speedcubedb-oll.txt → oll-cases.json
npm run build   # regenerate index.html
```

Edit `cubehead-notes.json` for nicknames and tips; non-empty `primary` / `secondary` there override the database algs.
