/* ─────────────────────────────────────────────────────────────────────────────
   THE FIELD

   34 live Polymarket markets, one row each. The trace is real executed
   probability over the market's life, resampled server-side onto a shared axis
   whose right edge is pinned to NOW for every row — so a ninety-day election and
   a ten-day sports market land on the same scale and become comparable on phase
   rather than on the calendar.

   COLOUR IS NEVER HARDCODED HERE.
   Every frame re-reads --ground / --accent / --line-rgb / --glow off the root
   computed style. This is not fastidiousness — it is the only thing that lets
   the colorway switcher work. Each ridge paints a solid --ground polygon under
   its own stroke to occlude the rows behind it, and if that fill stops matching
   the real page background, every ridge paints a visible band across its
   neighbours and 34 ridges collapse into one solid block. Hardcode a colour here
   and four of the five colorways break instantly and obviously.
   ───────────────────────────────────────────────────────────────────────────── */

export function createField(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const onHover = opts.onHover || (() => {});
  const onPick = opts.onPick || (() => {});

  let rows = [];          // market records from /api/field
  let W = 0, H = 0;
  let mx = -1e5, my = -1e5;
  let hover = -1;
  let raf = 0;
  let intro = 0;          // 0→1 reveal on first paint
  let introStart = 0;

  // ── tokens ────────────────────────────────────────────────────────────────
  // Resolved once per frame, not once per ridge: getComputedStyle is a forced
  // style recalc and calling it 34× a frame is a measurable stall.
  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => (cs.getPropertyValue(n) || d).trim();
    return {
      ground: g('--ground', '#F2F2EF'),
      accent: g('--accent', '#2E5CFF'),
      glow:   g('--glow', 'rgba(46,92,255,.16)'),
      line:   g('--line-rgb', '46,92,255'),
      lo:     parseFloat(g('--line-lo', '.30')) || .3,
      hi:     parseFloat(g('--line-hi', '.68')) || .68,
      faint:  g('--ink-faint', '#9AA0A8'),
      soft:   g('--ink-soft', '#5B6068'),
    };
  }

  // ── layout ────────────────────────────────────────────────────────────────
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── WHAT THE HEIGHT MEANS ───────────────────────────────────────────────────
  // Ridge height is the market's REPRICING: how far it has moved from its own
  // low over the observed window, on a gain shared by every row.
  //
  // Plotting absolute probability instead was the obvious first move and it is
  // visually dead. These markets are stable across a month — the within-row
  // variation is a few cents against a 0..1 axis — so every trace renders as a
  // flat horizontal line parked at its price, and 34 of them read as ruled paper.
  // Worse, the line then sits nowhere near its own label.
  //
  // Subtracting each row's own minimum fixes both and costs nothing in honesty,
  // because THE GAIN IS SHARED: a market that swung 60¢ is three times the ridge
  // of one that swung 20¢, everywhere on the plate. What is lost is absolute
  // level — so the right rail carries the live price in cents, and the dossier
  // sparkline redraws the same series against a fixed, un-normalised 0..1 axis.
  // Per-row min-max normalising would have been the dishonest version of this:
  // it makes a 2¢ market and a 60¢ market identical. Explicitly not done.
  //
  // Subtracting the row minimum also keeps every trace at or above its baseline,
  // which the occlusion fill depends on — a trace dipping below its own baseline
  // inverts the fill polygon and punches a hole through the rows behind it.
  // Tuned against the live board, where the median row reprices ~18¢ and the
  // widest ~62¢. At this gain the median ridge stands ~1.7 row pitches and the
  // widest ~6, so ridges overlap several rows deep — which is the point. The
  // occlusion fill turns that overlap into depth; without enough of it the plate
  // reads as 34 ruled lines rather than as terrain.
  const AMP = 9.0;       // row pitches at a full 0→1 repricing
  const TOP_PAD = 108;   // clearance for the header row
  const BOT_PAD = 92;    // clearance for the axis furniture and the swatch bar

  // Per-row floor + the largest repricing on the plate, computed once per load.
  let floors = [];
  let maxRange = 1;

  // The size knobs live here and nowhere else.
  //   w  — trace width
  //   sy — row pitch
  //   sx — horizontal shear per row: the isometric drift that gives the stack depth
  //   h  — amplitude unit, multiplied by AMP in draw()
  function geo() {
    const n = Math.max(rows.length, 1);
    const railL = Math.min(Math.max(W * 0.19, 150), 300);   // left rail — market names
    const railR = Math.min(Math.max(W * 0.09, 72), 132);    // right rail — the ¢

    // HORIZONTAL FIT. Row 0's left edge is pinned to the rail and the stack shears
    // rightwards from there, so the shear total (n×sx) has to come out of the
    // trace width. Centring the stack instead pushes the back rows left of the
    // rail and the longest market names get clipped off the edge of the plate.
    const sx = W * 0.0022;
    const w = Math.max(Math.min(W - railL - railR - 32 - n * sx, 1080), 200);

    // VERTICAL FIT. The stack's true visual height is n×sy PLUS the headroom the
    // tallest ridge needs above row 0 — a 99¢ market rises AMP row pitches. Solving
    // n·sy + AMP·1.05·sy = available for sy is what keeps the top ridges clear of
    // the header instead of letting them run through it.
    // Headroom is sized off the LARGEST REPRICING actually present, not off a
    // theoretical 0→1 swing that no live market ever shows. Reserving the
    // theoretical maximum wastes most of the plate on empty sky.
    const avail = Math.max(H - TOP_PAD - BOT_PAD, 200);
    const sy = Math.max(9, Math.min(avail / (n + AMP * maxRange * 1.05), 30));
    const h = sy * 1.05;

    const ox = railL + 24 + w / 2;
    const oy = TOP_PAD + h * AMP * maxRange;
    return { w, sx, sy, h, ox, oy, railL, railR, n };
  }

  // ── draw ──────────────────────────────────────────────────────────────────
  function draw() {
    raf = 0;
    ctx.clearRect(0, 0, W, H);
    if (!rows.length) return;

    const t = tokens();
    const g = geo();

    if (introStart) {
      intro = Math.min(1, (performance.now() - introStart) / 1400);
      if (intro < 1) schedule();
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let r = 0; r < g.n; r++) {
      const row = rows[r];
      const v = row.series;
      const P = v.length - 1;

      const rowX = g.ox + r * g.sx;
      const rowY = g.oy + r * g.sy;
      const lx = rowX - g.w / 2;
      const rx = rowX + g.w / 2;

      // Rows reveal front-to-back on first paint.
      const rowIntro = Math.max(0, Math.min(1, intro * g.n - r * 0.55));
      if (rowIntro <= 0) continue;

      // Proximity lift: the cursor pulls a summit up out of the terrain, falling
      // off over ~3 rows vertically and ~22% of the trace width horizontally.
      // Squared falloff gives a peak rather than a plateau.
      const near = 1 - Math.min(1, Math.abs(my - rowY) / (g.sy * 3.2));

      const pts = new Array(P + 1);
      for (let i = 0; i <= P; i++) {
        const px = lx + (i / P) * (rx - lx);
        let lift = 0;
        if (near > 0) {
          const dx = 1 - Math.min(1, Math.abs(px - mx) / (g.w * 0.22));
          if (dx > 0) lift = near * dx * dx * g.h * 1.15;
        }
        const amp = (v[i] - floors[r]) * g.h * AMP * rowIntro;
        pts[i] = [px, rowY - amp - lift];
      }

      // ── the occlusion fill ──
      // This is the whole trick. Without it the stack reads as tangled noise
      // instead of receding terrain. It must be the page's real background.
      ctx.beginPath();
      ctx.moveTo(lx, rowY + 2);
      for (let i = 0; i <= P; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.lineTo(rx, rowY + 2);
      ctx.closePath();
      ctx.fillStyle = t.ground;
      ctx.fill();

      // ── the stroke ──
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i <= P; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      };

      if (r === hover) {
        trace();
        ctx.strokeStyle = t.glow;
        ctx.lineWidth = 5.5;
        ctx.stroke();

        trace();
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else {
        // Back rows stronger than front rows: depth without a second colour.
        const k = g.n > 1 ? r / (g.n - 1) : 0;
        const a = (t.hi - (t.hi - t.lo) * k) * rowIntro;
        trace();
        ctx.strokeStyle = `rgba(${t.line},${a.toFixed(3)})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }

    drawRails(t, g);
  }

  // ── the rails ─────────────────────────────────────────────────────────────
  // Market names left, current YES price right. This is the minimum furniture
  // the art direction allows: names on the left rail, one probability scale,
  // nothing else.
  function drawRails(t, g) {
    ctx.font = '10px "Courier Prime", ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < g.n; r++) {
      const row = rows[r];
      const rowY = g.oy + r * g.sy;
      const rowX = g.ox + r * g.sx;
      const isHot = r === hover;
      const rowIntro = Math.max(0, Math.min(1, intro * g.n - r * 0.55));
      if (rowIntro <= 0) continue;

      ctx.globalAlpha = rowIntro;

      // left — name
      ctx.textAlign = 'right';
      ctx.fillStyle = isHot ? t.accent : t.faint;
      ctx.font = isHot
        ? 'bold 10px "Courier Prime", ui-monospace, monospace'
        : '10px "Courier Prime", ui-monospace, monospace';
      ctx.fillText(row.label.toUpperCase(), rowX - g.w / 2 - 14, rowY);

      // right — the live YES price, in cents, straight off outcomePrices
      ctx.textAlign = 'left';
      ctx.fillStyle = isHot ? t.accent : t.soft;
      const cents = row.yes == null ? '—' : Math.round(row.yes * 100) + '¢';
      ctx.fillText(cents, rowX + g.w / 2 + 16, rowY);

      ctx.globalAlpha = 1;
    }
  }

  function schedule() { if (!raf) raf = requestAnimationFrame(draw); }

  // ── interaction ───────────────────────────────────────────────────────────
  // Listeners live on WINDOW, not on the canvas. The canvas is pointer-events:
  // none so it sits under the header without eating clicks, which means it never
  // receives pointer events itself. This pairing is load-bearing — move these
  // onto the canvas and the interaction dies silently.
  function rowAt(y) {
    if (!rows.length) return -1;
    const g = geo();
    let best = -1, bestD = Infinity;
    for (let r = 0; r < g.n; r++) {
      const d = Math.abs(y - (g.oy + r * g.sy));
      if (d < bestD) { bestD = d; best = r; }
    }
    return bestD < g.sy * 0.62 ? best : -1;
  }

  function onMove(e) {
    mx = e.clientX; my = e.clientY;
    const h = rowAt(my);
    if (h !== hover) {
      hover = h;
      canvas.style.cursor = h >= 0 ? 'pointer' : 'default';
      onHover(h >= 0 ? rows[h] : null, h);
    }
    schedule();
  }
  function onLeave() { mx = my = -1e5; if (hover !== -1) { hover = -1; onHover(null, -1); } schedule(); }
  function onClick(e) {
    // Ignore clicks that landed on real UI sitting above the field.
    if (e.target.closest && e.target.closest('.swatchbar,.dossier,.plate-head,.scrim')) return;
    const r = rowAt(e.clientY);
    if (r >= 0) onPick(rows[r], r);
  }

  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('mouseout', onLeave, { passive: true });
  window.addEventListener('click', onClick);
  window.addEventListener('resize', () => { layout(); schedule(); });

  // Colorway changes must force a repaint: the ground fill is baked into pixels
  // already on the canvas and CSS cannot restyle them.
  const mo = new MutationObserver(() => schedule());
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  layout();

  return {
    setRows(next) {
      rows = next || [];
      // Each row's floor is its own minimum; the shared gain is then set by the
      // largest repricing on the plate so the tallest ridge fills the headroom
      // and everything else is measured against it.
      floors = rows.map((r) => (r.series && r.series.length ? Math.min(...r.series) : 0));
      maxRange = rows.reduce((mx, r, i) => {
        if (!r.series || !r.series.length) return mx;
        return Math.max(mx, Math.max(...r.series) - floors[i]);
      }, 0.05) || 1;
      if (!introStart) introStart = performance.now();
      schedule();
    },
    redraw: schedule,
    hovered: () => (hover >= 0 ? rows[hover] : null),
    rows: () => rows,
  };
}
