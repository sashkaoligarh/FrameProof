/**
 * Color conversion utilities for Figma design parser.
 *
 * Figma's REST API returns colors with r, g, b as floats in the 0–1 range
 * and alpha (a) also as a 0–1 float. These helpers convert that
 * representation into hex strings, CSS color values, HSL, and the
 * integer RGBA format used by our token types (r,g,b: 0-255, a: 0-1).
 */

/** Figma-style RGBA with all channels as 0-1 floats. */
export interface FigmaRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a number to an inclusive range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Convert a single 0-1 float channel to a 0-255 integer. */
function channelToInt(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

/** Convert a 0-255 integer to a two-character hex string. */
function intToHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Figma RGBA (0-1 floats) to a hex color string.
 *
 * Returns `#RRGGBB` when the color is fully opaque (a === 1),
 * or `#RRGGBBAA` when alpha is less than 1.
 */
export function rgbaToHex(rgba: FigmaRGBA): string {
  const r = channelToInt(rgba.r);
  const g = channelToInt(rgba.g);
  const b = channelToInt(rgba.b);

  const hex = `#${intToHex(r)}${intToHex(g)}${intToHex(b)}`;

  if (rgba.a < 1) {
    const a = channelToInt(rgba.a);
    return `${hex}${intToHex(a)}`;
  }

  return hex;
}

/**
 * Convert a Figma RGBA to a CSS color string.
 *
 * Returns `rgba(R, G, B, A)` when alpha < 1, otherwise returns
 * the hex representation via {@link rgbaToHex}.
 */
export function rgbaToCSS(rgba: FigmaRGBA): string {
  if (rgba.a < 1) {
    const r = channelToInt(rgba.r);
    const g = channelToInt(rgba.g);
    const b = channelToInt(rgba.b);
    // Round alpha to at most 4 decimal places to avoid floating-point noise.
    const a = Math.round(rgba.a * 10000) / 10000;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return rgbaToHex(rgba);
}

/**
 * Convert a Figma RGBA (0-1 floats) to HSL.
 *
 * @returns An object with `h` (0-360), `s` (0-100), `l` (0-100),
 *          each rounded to the nearest integer.
 */
export function hslFromRgba(rgba: FigmaRGBA): { h: number; s: number; l: number } {
  const r = clamp(rgba.r, 0, 1);
  const g = clamp(rgba.g, 0, 1);
  const b = clamp(rgba.b, 0, 1);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Lightness
  const l = (max + min) / 2;

  if (delta === 0) {
    // Achromatic
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  // Saturation
  const s = l > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);

  // Hue
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / delta + 2) / 6;
      break;
    default: // b
      h = ((r - g) / delta + 4) / 6;
      break;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert Figma's 0-1 float RGBA to integer RGBA as used in our token types.
 *
 * - `r`, `g`, `b` are converted to 0-255 integers (rounded).
 * - `a` remains a 0-1 float (rounded to 4 decimal places).
 */
export function figmaRgbaToInt(rgba: FigmaRGBA): { r: number; g: number; b: number; a: number } {
  return {
    r: channelToInt(rgba.r),
    g: channelToInt(rgba.g),
    b: channelToInt(rgba.b),
    a: Math.round(clamp(rgba.a, 0, 1) * 10000) / 10000,
  };
}
