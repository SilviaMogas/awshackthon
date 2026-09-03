/**
 * Small inline SVG icons (stroke="currentColor" so they inherit button color).
 * Used via `el(tag, { html: ICON_X })` instead of emoji glyphs, which render
 * inconsistently across platforms and look out of place in a branded product.
 */

export const ICON_MIC =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/></svg>';

export const ICON_SEND =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12 20 4l-6.5 16-3-6.5L4 12Z"/></svg>';

export const ICON_RESET =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 1 2.64 6.36"/><path d="M3 21v-6h6"/></svg>';

export const ICON_CODE =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 8-4 4 4 4"/><path d="m15 8 4 4-4 4"/></svg>';
