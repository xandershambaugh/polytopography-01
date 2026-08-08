# POLYTOPOGRAPHY

**The live Polymarket board, read as terrain.** Thirty-four markets, one ridge each. Click a ridge and the market behind it opens.

Live: **[polytopography.com](https://polytopography.com)** · Vercel project `polytopography-01` (team `xandershambaughs-projects`, account `xander@polymarket.com`)

---

## The lineage

Peter Saville's *Unknown Pleasures* sleeve, 1979, Factory FACT 10 — which is not an illustration. It is a scientific chart reproduced almost unaltered: Harold Craft's plot, from his 1970 Cornell PhD thesis, of 80 successive radio pulses from CP 1919, the first pulsar ever observed, stacked one above the next.

Craft's stack is the canonical ancestor of the ridgeline plot — the chart type nicknamed the "joyplot" after this cover. Its grammar is four rules: one shared x-axis, one repeated measurement, a vertical offset that encodes **sequence** rather than magnitude, and just enough overlap that density reads as terrain.

The other inherited discipline is **subtraction**. Saville's edit was removing every label from Craft's figure. This plate carries the minimum furniture that still lets the shape be trusted — one time axis, one shared height scale, market names on the left rail, live price on the right, and nothing else.

Art direction board: Figma `fnBLQkqekgJwcPrYaKoy45` → page **Topography**.

---

## What you are looking at

| | |
|---|---|
| **One row** | one Polymarket event, at its favourite (the leading outcome) |
| **The x-axis** | that market's life, normalised, **right edge pinned to NOW for every row** |
| **Ridge height** | how far the market has **repriced from its own low** over the window |
| **The gain** | **shared by every row** — a 60¢ swing is three times the ridge of a 20¢ swing, everywhere |
| **Left rail** | market name |
| **Right rail** | live price, in cents |
| **Row order** | resolution date, soonest first |

Normalising the x-axis to time-to-resolution rather than wall-clock is the move the whole piece turns on: a ninety-day election and a ten-day sports market land on the same axis and become directly comparable curves, aligned on **phase** rather than on the calendar.

You are not reading a number. You are reading a population and its exceptions.

### Why height is repricing and not probability

Plotting absolute probability is the obvious first move and it is visually dead. These markets are stable across a month — the within-row variation is a few cents against a full 0..1 axis — so every trace renders as a flat horizontal line parked at its price, 34 of them read as ruled paper, and no line sits anywhere near its own label.

Subtracting each row's own minimum fixes that and costs nothing in honesty, **because the gain stays shared**. What is lost is absolute level, so the right rail carries the live price and the dossier sparkline redraws the same series against a fixed, un-normalised 0..1 scale.

Per-row min-max normalising — the usual sparkline treatment — is deliberately **not** done. It would make a 2¢ market and a 60¢ market look identical.

---

## Nothing here is synthesised

Every number on screen came off the wire. Two public upstreams, both proxied through `api/field.js` for the shared edge cache:

- `gamma-api.polymarket.com/markets` — the register: question, slug, outcome prices, volume, liquidity, dates
- `clob.polymarket.com/prices-history` — the trace: real executed price over the market's life
- `clob.polymarket.com/book` — real best bid / best ask, and therefore a **real** spread

Where an upstream carries nothing, the field renders an em-dash rather than a plausible guess.

> **v1 did not do this.** It shipped a fabricated spread (`volatility × 8`), a fabricated open-interest figure (`volume × 0.38`) and an invented per-market trader count, on a Polymarket-branded surface. That is why v2 exists. v1 is preserved at `archive/v1-unknown-pleasures-14.html`.

---

## Colorways

Bottom-left popup. Persisted to `localStorage`; shareable per-load with `?c=<id>`.

| id | | |
|---|---|---|
| `paper` | white ground, blue line work | **default** — Craft before Saville inverted him |
| `paper-grid` | light grey + Kiko dot grid | |
| `carbon` | black + dot grid, white stack | Saville's inversion; hover is the only blue on the plate |
| `tectonic` | black-green + dot grid | [polytectonics.com](https://polytectonics.com), verbatim |
| `forest` | deep forest, no grid | |

**The rule that makes this work:** the canvas hardcodes no colour. `field.js` re-reads `--ground`, `--accent`, `--line-rgb` and `--glow` out of the computed root style on every frame.

`--ground` is the **occlusion fill** — each ridge paints a solid `--ground` polygon under its own stroke to hide the rows behind it, and that occlusion is the entire reason a stack of 34 jagged lines reads as receding terrain instead of a ball of wool. It must be opaque and it must equal the painted page background exactly. Mismatch it and every ridge paints a visible band across its neighbours.

The dot grid sits at `z-index:-1`, behind the canvas: dots read in the open sky and the terrain occludes them. Ridges are in front of the ground, not printed on it.

---

## Where this is going

The topography should attribute to **places**, and the links between them should become visible — *US invades Iran* wiring through the Strait of Hormuz to crude to pump prices in Mexico or Nebraska; Israel to Egypt; the sports markets clustering on their own.

Not built. The seam is standing and already populated — every row carries:

- `region[]` — gazetteer pass over question, event title and event tags
- `channels[]` — `oil rates equities crypto conflict sports election energy`
- `related[]` — adjacency, ranked by shared region or channel

It already works: the four Iran markets link to each other, and Hormuz carries both `Iran` and `oil`. The dossier renders these as chips today. The map layer will read the same fields, and nothing below the data boundary has to change.

---

## Running it

```sh
vercel dev --listen 3010
open http://localhost:3010/?c=carbon
```

Screenshot a colorway headlessly:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --window-size=1600,1000 \
  --screenshot=out.png --virtual-time-budget=12000 \
  "http://localhost:3010/?c=tectonic"
```

Deploy: `vercel --prod`. The GitHub repo is the Vercel git source, so push `main` too.

Agent brief: `~/.claude/agents/polytopography.md`.

```
index.html          the plate
assets/site.css     five colorways as complete token blocks + all chrome
assets/field.js     canvas renderer — ridges, rails, hover, hit-testing
assets/ui.js        colorway popup, dossier, sparkline
api/field.js        the data boundary
archive/            previous iterations, kept
```
