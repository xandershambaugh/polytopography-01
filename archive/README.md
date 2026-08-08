# archive

Previous iterations, kept. Nothing in here is deleted — a superseded plate is a record of where the work has been.

### `v1-unknown-pleasures-14.html`

The first POLYTOPOGRAPHY. Deployed Feb 2026 as `polymarket_unknown_pleasures_14.html`; superseded by v2 on 2026-08-08.

A single self-contained file: black ground, Share Tech Mono / Bebas Neue, 32 ridges, a hover panel on the right. It established the whole premise — one ridge per market, the Unknown Pleasures stack applied to a prediction-market board — and the ridge maths in it (seeded LCG, momentum random walk, triangular spike events, single smoothing pass) is the direct ancestor of both the polytectonics `field.html` renderer and v2's.

**Why it was replaced:** none of its data was real.

The 32 markets were a hardcoded array with hand-written `baseProb` / `volatility` / `volume` / `traders` values. The ridges were generated from a seeded random walk, not from price history. And the hover panel derived three of its figures out of nothing:

```js
const spread = Math.max(1, Math.round(market.volatility * 8));
const oi     = Math.round(market.volume * 0.38);
//  …plus a `traders` count invented per market in the source array
```

A fabricated spread and a fabricated open-interest figure, presented as market data on a Polymarket-branded surface. The art-direction board flagged exactly this: *"the application above is written against a generic multi-market view and should be checked against the real one."*

v2 is that check. Every value on the plate now comes off Gamma or CLOB, and anything the upstream does not carry renders as an em-dash.
