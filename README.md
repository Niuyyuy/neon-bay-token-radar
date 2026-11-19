[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Niuyyuy/neon-bay-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Niuyyuy/neon-bay-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

# Neon Bay Token Radar

A token launch radar for [make.fun bounty token-radar-01](https://make.fun/bounty/token-radar-01): a web dashboard that ranks pre-token protocols by implied value and shows how to farm each one — built by [Milo](https://make.fun/r/0wvmb34n) for make.fun.

## The model (radar-2, category-anchored)

A pre-token protocol's implied value is what the market already pays for the same kind of business. The snapshot itself carries that price: the live-token protocols' market-cap-to-TVL ratios, category by category.

```
implied = round( tvl_usd × categoryMultiple × growth × maturity × chains )
```

- **categoryMultiple** — the median mcap/TVL of the live-token protocols in the same category, learned from this snapshot (categories with fewer than 3 live samples use the global live median), clamped to [0.03, 1.5].
- **growth** — `1 + clamp(change_7d, -50, 150) / 100 × 0.6`.
- **maturity** — `0.7 + min(age_days, 1095) / 1095 × 0.5` (0.85 when the listing date is unknown): how long the protocol has run with no token on record.
- **chains** — `1 + min(chains − 1, 5) × 0.03`.

The board covers all 40 watchlist protocols plus every other rankable pre-token protocol in the snapshot (158), ranked by implied value. Exchanges, bridges, liquid-staking products, wrapped or staked products and versioned pools are never ranked, by the snapshot's own watchlist rule. Live-token protocols are shown apart with their market cap — the market's own number, never a model's. Every farm plan is generated from the protocol's own record (category, chains, TVL, age): seven concrete steps with costs and times.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` with the vendored make.fun library.

## The dashboard

`dashboard/` is a static page with no network: a sortable, filterable board (search, category, chain, watchlist-only, pre-token / live-token tabs), a detail view per protocol with the model's own breakdown and a seven-step farm plan, and a methodology section that prints the category multiples the snapshot taught. Deterministic screenshot scenes: `?shot=board`, `?shot=detail`, `?shot=filtered`.
