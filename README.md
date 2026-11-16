# CryptRadar

Every protocol DefiLlama tracks that is still before launch, ranked by what its
launch would be worth — with a farm plan for each one.

## The model

```
implied = TVL x category multiple x growth x maturity x chain breadth
```

- **Category multiple** — what a token in that line of business is worth
  relative to the value locked in it: RWA 0.35, lending and trading 0.30,
  yield and curators 0.28, everything else 0.25, thin-margin lines 0.22.
- **Growth** — the 7-day TVL change, clamped to -60%…+120%, weighted one-half.
- **Maturity** — 0.60 for a new protocol, up to 1.00 after three years tracked
  before launch.
- **Chain breadth** — +2% per extra chain, capped at +10%.

No protocol name is special-cased. The board covers the full 40-protocol
watchlist plus 160 early finds below the $50M floor — 200 rows in all.
Live-token protocols are shown apart, at the market's own values.

"Before launch" here means the snapshot's record shows the protocol before
its launch. That is the record, not a promise of a launch.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes
`board.json`, `data.js`, the `dashboard/` and `screenshots/` copies, and
`dossier.json` via `vendor/makefun-board.ts`. The dashboard is a static page
that renders with no network: open `out/dashboard/index.html`.

## Layout

- `main.ts` — entrypoint
- `lib/model.ts` — the model, the board, the farm plans
- `dashboard/` — `index.html`, `app.css`, `app.js`
- `screenshots/` — board, detail view, filtered view
- `vendor/makefun-board.ts` — make.fun's dossier library, copied unchanged
