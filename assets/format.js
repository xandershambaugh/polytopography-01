/* ─────────────────────────────────────────────────────────────────────────────
   PRICE DISPLAY — shared by the rail (field.js) and the dossier (ui.js).

   This module exists because rounding each side of a binary market on its own
   produces pairs that do not sum to 100¢. The upstream is exact: `yes + no` is
   1.0 on every row of the live board, verified. But 0.815 and 0.185 both round
   up, so an independently-rounded pair prints as 82¢ / 19¢ — and a reader who
   sees 82 + 19 = 101 concludes the whole plate is made up, which is the precise
   impression this rebuild exists to remove.

   So: round ONE side, derive the other. Nothing is invented — this is display
   arithmetic over a value the API carried, not a substitute for a missing one.

   The second job is the extremes. `Math.round(0.9995 * 100)` is 100, which reads
   as a settled market, and `Math.round(0.0005 * 100)` is 0, which reads as
   impossible. Neither is true of a market still taking orders, so those clamp to
   Polymarket's own convention: >99¢ and <1¢.
   ───────────────────────────────────────────────────────────────────────────── */

// Integer cents for a probability, or null. Never returns 0 or 100 for a live
// market — see above.
export function centsLabel(v) {
  if (v == null || Number.isNaN(v)) return '—';
  if (v <= 0) return '0¢';
  if (v >= 1) return '100¢';
  if (v < 0.005) return '<1¢';
  if (v > 0.995) return '>99¢';
  return Math.round(v * 100) + '¢';
}

// The YES/NO pair. `no` is derived from the rounded `yes` so the two always sum
// to 100 on screen. Returns display strings plus the integer used for the bar,
// so the bar can never disagree with the number printed above it.
export function pricePair(yes, no) {
  if (yes == null || Number.isNaN(yes)) {
    return { yes: '—', no: '—', barPct: 0 };
  }
  const y = Math.max(0, Math.min(1, yes));
  const yLab = centsLabel(y);

  // Derive NO from YES rather than rounding `no` separately. When the upstream
  // pair does not sum to 1 (it always has so far, but a neg-risk basket could
  // differ) prefer the real `no` only if it is materially inconsistent.
  let nLab;
  if (no != null && Math.abs(y + no - 1) > 0.02) {
    nLab = centsLabel(no);                    // genuinely not a complement — show it
  } else if (y < 0.005) {
    nLab = '>99¢';
  } else if (y > 0.995) {
    nLab = '<1¢';
  } else {
    nLab = (100 - Math.round(y * 100)) + '¢';
  }

  return { yes: yLab, no: nLab, barPct: Math.round(y * 100) };
}
