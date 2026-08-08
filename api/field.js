// ─────────────────────────────────────────────────────────────────────────────
// THE DATA BOUNDARY.
//
// Everything the field draws comes through this function and nothing else. The
// client receives rows of normalised 0..1 probability samples plus the real
// market facts that sit behind each row; it never talks to Polymarket directly.
//
// Two upstreams, both public, both CORS-open (we proxy anyway — for the shared
// edge cache, and so the shape below is the only contract the client knows):
//
//   gamma-api.polymarket.com/markets   → the market register: question, slug,
//                                        outcomePrices, volume, liquidity, dates
//   clob.polymarket.com/prices-history → the trace: real executed price over the
//                                        market's life (capped ~1 month lookback)
//   clob.polymarket.com/book           → real best bid / best ask → real spread
//
// NOTHING HERE IS SYNTHESISED. v1 of this site invented `spread` (volatility×8),
// `open interest` (volume×0.38) and a per-market `traders` count out of nothing.
// Those fields are gone. If a number is on screen it came off the wire, and if
// the wire does not carry it, it is not on screen. That is the whole rule.
//
// THE GEO SEAM — not yet drawn, deliberately left standing.
// Every row carries `region[]` and `related[]`. `region` is inferred here from
// the event's own tags plus a gazetteer pass over the question text; `related`
// is the adjacency the eventual map layer will draw along (US-invades-Iran →
// Strait of Hormuz → crude → pump prices). Both are populated now and unused by
// the v2 UI apart from the dossier chips. When the map arrives, it reads these
// fields and nothing below this line has to change.
// ─────────────────────────────────────────────────────────────────────────────

const GAMMA = 'https://gamma-api.polymarket.com';
const CLOB = 'https://clob.polymarket.com';

const ROWS = 34;        // rows in the stack — the population
const SAMPLES = 240;    // samples per trace after resampling onto the shared axis
const UA = { 'User-Agent': 'polytopography/2.0 (+https://polytopography.com)' };

// ── the gazetteer ────────────────────────────────────────────────────────────
// Deliberately shallow. It exists to prove the seam works, not to be a world
// atlas. The eventual map layer should replace this with Gamma's own tag graph
// once we confirm the tag taxonomy is stable enough to key off.
const GAZETTEER = [
  ['Iran', /\biran(ian)?\b|hormuz|tehran/i],
  ['Israel', /\bisrael(i)?\b|gaza|netanyahu|idf|tel aviv/i],
  ['Egypt', /\begypt(ian)?\b|suez|cairo|sisi/i],
  ['Russia', /\brussia(n)?\b|putin|moscow|kremlin/i],
  ['Ukraine', /\bukrain(e|ian)\b|zelensky|kyiv|kiev/i],
  ['China', /\bchina|chinese|taiwan|xi jinping|beijing|hong kong/i],
  ['Venezuela', /\bvenezuela(n)?\b|maduro|caracas/i],
  ['Mexico', /\bmexico|mexican|sheinbaum/i],
  ['India', /\bindia(n)?\b|modi|new delhi/i],
  ['Pakistan', /\bpakistan(i)?\b|islamabad/i],
  ['North Korea', /north korea|dprk|kim jong/i],
  ['Ethiopia', /\bethiopia(n)?\b|addis ababa|abiy/i],
  ['Saudi Arabia', /saudi|riyadh|mbs\b|opec/i],
  ['Venezuela', /\bmaduro\b/i],
  ['United Kingdom', /\buk\b|britain|british|starmer|downing street/i],
  ['France', /\bfrance|french|macron|paris\b/i],
  ['Germany', /\bgerman(y)?\b|berlin|scholz|merz/i],
  ['Japan', /\bjapan(ese)?\b|tokyo|boj\b/i],
  ['United States', /\bu\.?s\.?\b|america(n)?|trump|biden|congress|senate|fed\b|federal reserve|white house|scotus|supreme court/i],
];

// Commodity / macro channels — the edges the map will eventually draw along.
// A market that touches Hormuz and a market that prices crude are adjacent even
// though they share no country tag.
const CHANNELS = [
  ['oil', /\boil\b|crude|brent|wti|opec|hormuz|petrol|gasoline|gas price/i],
  ['rates', /\bfed\b|interest rate|fomc|basis point|bps\b|inflation|cpi\b/i],
  ['equities', /s&p|nasdaq|dow jones|stock market|market cap/i],
  ['crypto', /bitcoin|btc\b|ethereum|eth\b|solana|crypto/i],
  ['conflict', /\bwar\b|invade|invasion|strike|ceasefire|troops|missile|nuclear/i],
  // `sports` is tested BEFORE `election` and short-circuits it: a football or
  // tennis market otherwise trips the election pattern on words like "win",
  // "open" and "final", and mislabelled channels would poison the adjacency
  // graph the map layer is going to be built on.
  ['sports', /\bnba\b|\bnfl\b|\bmlb\b|\bnhl\b|premier league|uefa|champions league|super bowl|world cup|\bopen\b.*\bvs\b|\bvs\.?\b|match winner|game \d|series winner|tournament|playoff|f1\b|grand prix|ballon d'?or|\blol:|\bdota\b|\bcs2\b|esports|valorant/i],
  ['election', /\belection\b|\bballot\b|primary\b|nominee|presidential|\bsenate\b|governor|parliament|prime minister|electoral/i],
  ['energy', /\benergy\b|lng|pipeline|refinery|natural gas/i],
];

function tagsFor(text, eventTags) {
  const hay = `${text} ${(eventTags || []).join(' ')}`;
  const region = [];
  for (const [name, re] of GAZETTEER) {
    if (re.test(hay) && !region.includes(name)) region.push(name);
  }
  const channels = [];
  for (const [name, re] of CHANNELS) {
    if (re.test(hay) && !channels.includes(name)) channels.push(name);
  }
  // A sports market is a sports market. Without this, "Champions League" and
  // "National Bank Open" both come back tagged `election`.
  if (channels.includes('sports')) {
    const i = channels.indexOf('election');
    if (i >= 0) channels.splice(i, 1);
  }
  return { region, channels };
}

// ── plumbing ─────────────────────────────────────────────────────────────────

async function getJSON(url, { timeout = 9000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Bounded concurrency. 34 rows × 2 calls would otherwise open 68 sockets at once
// and CLOB starts refusing well before that.
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        try { out[i] = await fn(items[i], i); }
        catch { out[i] = null; }
      }
    })
  );
  return out;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function parseJSONField(v, fallback) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

// ── the trace ────────────────────────────────────────────────────────────────
// Resample a real (t, p) series onto SAMPLES evenly spaced points.
//
// The x-axis is the market's own life, normalised, with the RIGHT EDGE PINNED TO
// NOW for every row. That is the move the art direction turns on: a ninety-day
// election and a ten-day sports market land on the same axis and become directly
// comparable curves, aligned on phase rather than on the calendar. Rows are
// therefore read across, not against a date.
function resample(history, n) {
  const pts = (history || [])
    .map((h) => [Number(h.t), Number(h.p)])
    .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p));
  if (pts.length < 2) return null;

  pts.sort((a, b) => a[0] - b[0]);
  const t0 = pts[0][0];
  const t1 = pts[pts.length - 1][0];
  if (!(t1 > t0)) return null;

  const out = new Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i / (n - 1)) * (t1 - t0);
    while (j < pts.length - 2 && pts[j + 1][0] < t) j++;
    const [ta, pa] = pts[j];
    const [tb, pb] = pts[j + 1];
    const span = tb - ta;
    const w = span > 0 ? (t - ta) / span : 0;
    const p = pa + (pb - pa) * Math.max(0, Math.min(1, w));
    out[i] = Math.round(Math.max(0, Math.min(1, p)) * 1e4) / 1e4;
  }
  return { series: out, from: t0, to: t1 };
}

// A short display label for the left rail — 10px mono, so full questions do not
// fit and truncating mid-word reads as breakage rather than as an edit.
//
// The EVENT title is the label, not the market question. Since we draw one row
// per event, the market's own `groupItemTitle` is a leg within it — "August 31",
// "Game 1 Winner", "Berhanu Nega" — which is meaningless stripped of its parent.
// The event title ("Strait of Hormuz traffic returns to normal") is the thing
// the row is actually about.
function shortLabel(m, ev) {
  let s = ((ev && ev.title) || '').trim();
  if (!s) s = (m.question || '').trim();

  s = s
    .replace(/^will\s+/i, '')
    .replace(/\?+$/, '')
    .replace(/\s+before\s+\d{4}$/i, '')
    .replace(/\s+in\s+20\d\d$/i, '')
    .replace(/\s*[—–-]\s*20\d\d[-/]\d\d?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (s.length > 30) s = s.slice(0, 29).replace(/[\s,;:—–-]+$/, '') + '…';
  return s;
}

// ── handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    // Over-fetch: we drop non-orderbook markets, thin markets, and all but the
    // deepest market per event, so the register has to be several times ROWS.
    const raw = await getJSON(
      `${GAMMA}/markets?limit=220&order=volume1wk&ascending=false&closed=false&active=true`
    );

    // One row per EVENT. Without this, "Next Prime Minister of Ethiopia" alone
    // supplies six near-identical rows and the stack stops being a population.
    //
    // Two separate decisions, and conflating them is what made the first cut of
    // this file draw a third of the field as dead flat lines:
    //
    //   WHICH EVENTS  — ranked by the event's total weekly volume, i.e. where the
    //                   money actually is.
    //   WHICH MARKET  — within an event, the FAVOURITE (highest YES price), not
    //     WITHIN IT     the highest-volume leg. In a multi-candidate event the
    //                   volume leader is routinely an 0.8¢ long shot, which is a
    //                   true fact about a market nobody is reading and a flat
    //                   line on the plate. The front-runner is the row that
    //                   carries the event's argument.
    const byEvent = new Map();
    for (const m of raw) {
      if (m.enableOrderBook === false) continue;
      const prices = parseJSONField(m.outcomePrices, null);
      if (!prices || prices.length < 2) continue;
      const tokens = parseJSONField(m.clobTokenIds, null);
      if (!tokens || !tokens[0]) continue;

      const ev = (m.events && m.events[0]) || {};
      const key = ev.id || ev.slug || m.id;
      const vol = num(m.volume1wk) ?? num(m.volume) ?? 0;
      const price = num(prices[0]) ?? 0;

      const prev = byEvent.get(key);
      if (!prev) {
        byEvent.set(key, { ...m, _price: price, _eventVol: vol, _event: ev });
      } else {
        prev._eventVol += vol;                       // the event's total weight
        if (price > prev._price) {                   // …but the favourite is the row
          byEvent.set(key, { ...m, _price: price, _eventVol: prev._eventVol, _event: ev });
        }
      }
    }

    const picked = [...byEvent.values()]
      .sort((a, b) => b._eventVol - a._eventVol)
      .slice(0, ROWS);

    // Trace + order book, per market, in parallel.
    const rows = await pool(picked, 8, async (m) => {
      const tokens = parseJSONField(m.clobTokenIds, []);
      const yesToken = tokens[0];

      const [hist, book] = await Promise.all([
        getJSON(`${CLOB}/prices-history?market=${yesToken}&interval=max&fidelity=60`).catch(() => null),
        getJSON(`${CLOB}/book?token_id=${yesToken}`).catch(() => null),
      ]);

      const tr = resample(hist && hist.history, SAMPLES);
      if (!tr) return null;   // no trace, no row — we do not draw invented shapes

      // Real book. CLOB returns bids ascending and asks descending, so the best
      // of each is the LAST element. Getting this backwards silently produces a
      // plausible-looking wrong spread, which is exactly the failure this whole
      // file exists to prevent.
      let bestBid = null, bestAsk = null;
      if (book) {
        const bids = book.bids || [], asks = book.asks || [];
        if (bids.length) bestBid = num(bids[bids.length - 1].price);
        if (asks.length) bestAsk = num(asks[asks.length - 1].price);
      }
      const spread = bestBid != null && bestAsk != null
        ? Math.round((bestAsk - bestBid) * 1e4) / 1e4
        : null;

      const prices = parseJSONField(m.outcomePrices, ['0', '0']).map(num);
      const outcomes = parseJSONField(m.outcomes, ['Yes', 'No']);
      const ev = m._event || {};
      const evTags = (ev.tags || []).map((t) => (typeof t === 'string' ? t : t && t.label) || '');
      const { region, channels } = tagsFor(`${m.question} ${ev.title || ''} ${m.description || ''}`, evTags);

      const end = m.endDate ? new Date(m.endDate) : null;
      const daysToResolve = end ? Math.round((end - Date.now()) / 864e5) : null;

      return {
        id: String(m.id),
        slug: m.slug || null,
        question: m.question || '',
        label: shortLabel(m, ev),
        eventTitle: ev.title || null,
        eventSlug: ev.slug || null,
        url: ev.slug
          ? `https://polymarket.com/event/${ev.slug}`
          : (m.slug ? `https://polymarket.com/market/${m.slug}` : 'https://polymarket.com'),
        icon: m.icon || ev.icon || null,

        outcomes,
        yes: prices[0],
        no: prices[1],
        bestBid, bestAsk, spread,
        lastTrade: book ? num(book.last_trade_price) : null,
        tickSize: book ? num(book.tick_size) : null,

        volume: num(m.volume),
        volume24hr: num(m.volume24hr),
        volume1wk: num(m.volume1wk),
        liquidity: num(m.liquidity),

        startDate: m.startDate || null,
        endDate: m.endDate || null,
        daysToResolve,
        observedFrom: tr.from,
        observedTo: tr.to,

        // ── the geo seam ──
        region,
        channels,
        tags: evTags.filter(Boolean).slice(0, 8),
        related: [],   // filled below, once every row is known

        series: tr.series,
      };
    });

    const markets = rows.filter(Boolean);

    // ROW ORDER IS A DESIGN DECISION. The art direction is explicit that the
    // vertical offset encodes sequence rather than magnitude — rows stack in
    // whatever order carries the argument: volume, category, or close date.
    //
    // Close date it is, soonest first. Not an arbitrary pick — ordering must be
    // UNCORRELATED WITH RIDGE HEIGHT, and that rules out the obvious choice.
    // Sorting by probability was tried and is wrong: height already encodes
    // probability, so sorting by it makes offset and amplitude climb together and
    // the stack renders as a fan of near-parallel lines with every tall ridge
    // piled at one end. Ordering by resolution date scatters tall ridges among
    // short ones, which is what makes a stack of traces read as terrain — and it
    // agrees with the x-axis, which is already normalised time-to-resolution.
    markets.sort((a, b) => {
      const A = a.daysToResolve, B = b.daysToResolve;
      if (A == null && B == null) return 0;
      if (A == null) return 1;
      if (B == null) return -1;
      return A - B;
    });

    // Adjacency: two rows are related if they share a region or a channel. This
    // is the edge list the map layer will draw along — Iran-invasion sits next to
    // Hormuz sits next to crude. Cheap O(n²) over ~34 rows.
    for (const a of markets) {
      const links = [];
      for (const b of markets) {
        if (a.id === b.id) continue;
        const shared = [
          ...a.region.filter((r) => b.region.includes(r)),
          ...a.channels.filter((c) => b.channels.includes(c)),
        ];
        if (shared.length) links.push({ id: b.id, via: shared });
      }
      a.related = links.sort((x, y) => y.via.length - x.via.length).slice(0, 6);
    }

    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=900');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      generated: Date.now(),
      source: 'gamma-api.polymarket.com + clob.polymarket.com',
      samples: SAMPLES,
      count: markets.length,
      markets,
    });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'upstream_failed', detail: String(err && err.message || err) });
  }
}
