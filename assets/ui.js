/* ─────────────────────────────────────────────────────────────────────────────
   UI — the colorway popup (bottom left) and the market dossier.

   The dossier's contract: every value shown is one the API actually carried.
   Where the upstream has nothing, the row renders an em-dash. v1 of this site
   printed a fabricated spread, a fabricated open-interest figure and an invented
   trader count on a Polymarket-branded surface; the `dash()` helper below is the
   mechanism that keeps that from happening again. Do not add a field here
   without a real source in api/field.js.
   ───────────────────────────────────────────────────────────────────────────── */

import { pricePair } from './format.js';

// ── colorways ────────────────────────────────────────────────────────────────
// `ground` / `dot` / `line` / `accent` drive the preview chip only. The real
// values live in assets/site.css — these must be kept in step with it by hand,
// but a drifted chip is a cosmetic bug, not a broken plate.
export const COLORWAYS = [
  { id: 'paper',      name: 'Paper',      desc: 'White ground, blue line',
    ground: '#F2F2EF', dot: 'transparent',         line: '#2E5CFF', accent: '#2E5CFF' },
  { id: 'paper-grid', name: 'Paper Grid',  desc: 'Light grey, dot grid',
    ground: '#E9E9E5', dot: 'rgba(20,22,26,.28)',  line: '#2E5CFF', accent: '#2E5CFF' },
  { id: 'carbon',     name: 'Carbon',      desc: 'Black, dots, blue on hover',
    ground: '#000000', dot: 'rgba(255,255,255,.34)', line: '#FFFFFF', accent: '#2E5CFF' },
  { id: 'tectonic',   name: 'Tectonic',    desc: 'Polytectonics black-green',
    ground: '#0A1410', dot: 'rgba(122,201,158,.42)', line: '#BEEBD0', accent: '#9FE8BE' },
  { id: 'forest',     name: 'Forest',      desc: 'Deep forest, no grid',
    ground: '#16301F', dot: 'transparent',         line: '#D6EED6', accent: '#7FE0A0' },
];

const STORE_KEY = 'polytopography.colorway';

export function initColorways(mount) {
  // Precedence: ?c=<id> beats the stored choice beats the default. The URL param
  // makes a colorway shareable — and is how the plate gets screenshotted in all
  // five without clicking through them.
  const fromUrl = new URLSearchParams(location.search).get('c');
  const saved = (() => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } })();
  const start =
    COLORWAYS.some((c) => c.id === fromUrl) ? fromUrl :
    COLORWAYS.some((c) => c.id === saved) ? saved : 'paper';
  apply(start);

  mount.innerHTML = `
    <button class="swatch-toggle" aria-expanded="false" aria-haspopup="true">
      <span class="bead" aria-hidden="true"></span><span class="lbl">Colorway</span>
    </button>
    <div class="swatch-pop" role="radiogroup" aria-label="Colorway">
      <h4>Colorway</h4>
      ${COLORWAYS.map((c) => `
        <button class="swatch-row" role="radio" data-id="${c.id}" aria-checked="${c.id === start}">
          <span class="chipwrap" style="--c-ground:${c.ground};--c-dot:${c.dot};--c-line:${c.line};--c-accent:${c.accent}">
            <i></i><b></b>
          </span>
          <span>
            <span class="nm">${c.name}</span>
            <span class="ds">${c.desc}</span>
          </span>
          <span class="tick" aria-hidden="true">●</span>
        </button>`).join('')}
    </div>`;

  const toggle = mount.querySelector('.swatch-toggle');
  const label = mount.querySelector('.swatch-toggle .lbl');
  label.textContent = COLORWAYS.find((c) => c.id === start).name;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = mount.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  mount.querySelectorAll('.swatch-row').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      apply(id);
      try { localStorage.setItem(STORE_KEY, id); } catch { /* private mode */ }
      mount.querySelectorAll('.swatch-row').forEach((b) =>
        b.setAttribute('aria-checked', String(b.dataset.id === id)));
      label.textContent = COLORWAYS.find((c) => c.id === id).name;
    });
  });

  // Click-away and Escape close the popup.
  document.addEventListener('click', (e) => {
    if (!mount.contains(e.target)) {
      mount.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      mount.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  function apply(id) {
    document.documentElement.setAttribute('data-theme', id);
    const cw = COLORWAYS.find((c) => c.id === id);
    // Keep the browser chrome (mobile address bar) in step with the plate.
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = cw.ground;
  }
}

// ── formatting ───────────────────────────────────────────────────────────────
// One helper decides what "no data" looks like everywhere: an em-dash.
const dash = (v, fmt) => (v == null || Number.isNaN(v) ? '—' : fmt(v));

const money = (v) => dash(v, (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
});

const cents = (v) => dash(v, (n) => (n * 100).toFixed(1) + '¢');
const pct   = (v) => dash(v, (n) => (n * 100).toFixed(1) + '%');

const dateFmt = (iso) => dash(iso && Date.parse(iso) ? iso : null, (s) =>
  new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase());

const stamp = (unixSec) => dash(unixSec, (t) =>
  new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase());

// ── dossier ──────────────────────────────────────────────────────────────────
export function initDossier(root, scrim) {
  let open = false;

  function close() {
    open = false;
    root.classList.remove('open');
    scrim.classList.remove('open');
  }

  scrim.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });

  function show(m, allRows) {
    const yes = m.yes, no = m.no;
    // One rounding for both sides — see assets/format.js. The bar width comes
    // from the same call, so it cannot disagree with the number above it.
    const pair = pricePair(yes, no);

    // Related markets, resolved from the adjacency the API computed. This is the
    // geo layer's seam showing through: today it is a line of text, later it is
    // the edge set of the map.
    const byId = new Map((allRows || []).map((r) => [r.id, r]));
    const related = (m.related || [])
      .map((r) => ({ row: byId.get(r.id), via: r.via }))
      .filter((r) => r.row)
      .slice(0, 4);

    // For a standalone binary market the event title IS the question, and
    // printing both stacks the same sentence twice. Only show the eyebrow when
    // it actually adds the parent context (a multi-candidate event, a series).
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const eyebrow = m.eventTitle && norm(m.eventTitle) !== norm(m.question)
      ? m.eventTitle
      : (m.region[0] || m.channels[0] || 'Market');

    root.innerHTML = `
      <div class="d-top">
        ${m.icon ? `<img class="d-icon" src="${esc(m.icon)}" alt="" loading="lazy">` : ''}
        <div style="flex:1;min-width:0">
          <div class="d-eyebrow">${esc(eyebrow)}</div>
          <h2>${esc(m.question)}</h2>
        </div>
        <button class="d-close" aria-label="Close">✕</button>
      </div>

      <div class="d-price">
        <div>
          <div class="big">${pair.yes}</div>
          <div class="side">${esc((m.outcomes && m.outcomes[0]) || 'Yes')}</div>
        </div>
        <div class="no">
          <b>${pair.no}</b>
          <div class="side">${esc((m.outcomes && m.outcomes[1]) || 'No')}</div>
        </div>
      </div>
      <div class="d-bar"><i style="width:${pair.barPct}%"></i></div>

      <canvas class="d-spark"></canvas>
      <div class="d-note" style="margin-top:0">
        Trace — executed price, ${stamp(m.observedFrom)} → ${stamp(m.observedTo)}
      </div>

      <div class="d-grid">
        <div class="d-row"><span class="k">Best bid</span><span class="v">${cents(m.bestBid)}</span></div>
        <div class="d-row"><span class="k">Best ask</span><span class="v">${cents(m.bestAsk)}</span></div>
        <div class="d-row"><span class="k">Spread</span><span class="v">${cents(m.spread)}</span></div>
        <div class="d-row"><span class="k">Last trade</span><span class="v">${cents(m.lastTrade)}</span></div>
        <div class="d-row"><span class="k">Volume — total</span><span class="v">${money(m.volume)}</span></div>
        <div class="d-row"><span class="k">Liquidity</span><span class="v">${money(m.liquidity)}</span></div>
        <div class="d-row"><span class="k">Volume — 24h</span><span class="v">${money(m.volume24hr)}</span></div>
        <div class="d-row"><span class="k">Volume — 7d</span><span class="v">${money(m.volume1wk)}</span></div>
        <div class="d-row"><span class="k">Implied prob.</span><span class="v">${pct(yes)}</span></div>
        <div class="d-row"><span class="k">Tick size</span><span class="v">${dash(m.tickSize, (n) => cents(n))}</span></div>
        <div class="d-row"><span class="k">Resolves</span><span class="v">${dateFmt(m.endDate)}</span></div>
        <div class="d-row"><span class="k">Days left</span><span class="v">${dash(m.daysToResolve, (n) => n < 0 ? 'PAST DUE' : n + 'D')}</span></div>
      </div>

      ${(m.region.length || m.channels.length) ? `
        <div class="d-sec">
          <h5>Attribution</h5>
          <div class="chips">
            ${m.region.map((r) => `<span class="geo">${esc(r)}</span>`).join('')}
            ${m.channels.map((c) => `<span>${esc(c)}</span>`).join('')}
          </div>
        </div>` : ''}

      ${related.length ? `
        <div class="d-sec">
          <h5>Adjacent markets</h5>
          <div class="chips">
            ${related.map((r) => `<span>${esc(r.row.label)} · ${esc(r.via[0])}</span>`).join('')}
          </div>
        </div>` : ''}

      <a class="d-go" href="${esc(m.url)}" target="_blank" rel="noopener">Open on Polymarket ↗</a>
      <div class="d-note">
        All figures read live from Polymarket's public Gamma and CLOB APIs.
        Fields the API does not carry are shown as —.
      </div>`;

    root.querySelector('.d-close').addEventListener('click', close);
    sparkline(root.querySelector('.d-spark'), m.series);

    open = true;
    root.classList.add('open');
    scrim.classList.add('open');
    root.scrollTop = 0;
  }

  return { show, close };
}

// The row's own trace, drawn at readable size inside the dossier. Same data the
// ridge is built from — so the shape in the panel is provably the shape on the
// plate, not a second, prettier rendering of it.
function sparkline(cv, series) {
  if (!cv || !series || series.length < 2) return;
  const cs = getComputedStyle(document.documentElement);
  const accent = (cs.getPropertyValue('--accent') || '#2E5CFF').trim();
  const hair = (cs.getPropertyValue('--hairline') || 'rgba(0,0,0,.12)').trim();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 480;
  const h = cv.clientHeight || 76;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const pad = 6;
  const x = (i) => (i / (series.length - 1)) * (w - 2) + 1;
  // Fixed 0..1 probability scale, never auto-ranged: an auto-ranged sparkline
  // makes a market that moved 2¢ look identical to one that moved 60¢.
  const y = (p) => h - pad - p * (h - pad * 2);

  // 50¢ reference line
  c.strokeStyle = hair;
  c.lineWidth = 1;
  c.setLineDash([2, 3]);
  c.beginPath(); c.moveTo(0, y(0.5)); c.lineTo(w, y(0.5)); c.stroke();
  c.setLineDash([]);

  c.beginPath();
  c.moveTo(x(0), y(series[0]));
  for (let i = 1; i < series.length; i++) c.lineTo(x(i), y(series[i]));
  c.strokeStyle = accent;
  c.lineWidth = 1.4;
  c.lineJoin = 'round';
  c.stroke();
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
