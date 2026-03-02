/**
 * Naming normalization utilities for Figma design parser.
 *
 * Converts arbitrary strings (Figma layer names, style paths, node IDs)
 * into safe, consistent identifiers for use as file names, CSS custom
 * property names, and JSON keys.
 */

import { hslFromRgba } from './color.js';

/** Figma-style RGBA with all channels as 0-1 floats. */
interface FigmaRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split a string into an array of lowercase words.
 *
 * Handles: camelCase, PascalCase, SCREAMING_CASE, spaces, underscores,
 * slashes (Figma style paths), dots, dashes, and consecutive capitals
 * (e.g. "HTMLParser" -> ["html", "parser"]).
 */
function splitWords(str: string): string[] {
  // 1. Replace common delimiters with a single space.
  let normalized = str
    .replace(/[/_\-.]+/g, ' ');

  // 2. Insert a space before a capital that follows a lowercase or digit,
  //    or before a capital followed by a lowercase (to split "HTMLParser"
  //    into "HTML Parser" first).
  normalized = normalized
    // aB -> a B  (camelCase boundary)
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    // ABc -> A Bc (consecutive caps followed by lowercase, e.g. HTMLParser -> HTML Parser)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  // 3. Split on whitespace, lowercase everything, drop empties.
  return normalized
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0);
}

// ---------------------------------------------------------------------------
// Public API — case converters
// ---------------------------------------------------------------------------

/**
 * Convert any string to kebab-case.
 *
 * Handles camelCase, PascalCase, spaces, underscores, slashes
 * (Figma style paths like "Brand/Primary/500"), consecutive
 * capitals (e.g. "HTMLParser" -> "html-parser"), and various
 * delimiter combinations.
 */
export function toKebabCase(str: string): string {
  return splitWords(str).join('-');
}

/**
 * Convert any string to snake_case.
 *
 * Uses the same splitting logic as {@link toKebabCase}.
 */
export function toSnakeCase(str: string): string {
  return splitWords(str).join('_');
}

// ---------------------------------------------------------------------------
// Public API — color naming
// ---------------------------------------------------------------------------

/** Hue bucket boundaries (upper-exclusive) and their names. */
const HUE_BUCKETS: Array<{ max: number; name: string }> = [
  { max: 15, name: 'red' },
  { max: 45, name: 'orange' },
  { max: 70, name: 'yellow' },
  { max: 160, name: 'green' },
  { max: 200, name: 'cyan' },
  { max: 260, name: 'blue' },
  { max: 300, name: 'purple' },
  { max: 345, name: 'pink' },
  { max: 361, name: 'red' }, // wraps around
];

/**
 * Map a luminance value (0-100) to a human-readable level.
 */
function luminanceLevel(l: number): string {
  if (l > 90) return 'lightest';
  if (l > 75) return 'lighter';
  if (l > 60) return 'light';
  if (l > 40) return 'medium';
  if (l > 25) return 'dark';
  if (l > 10) return 'darker';
  return 'darkest';
}

/**
 * Auto-generate a name for a color based on its hue bucket and
 * luminance level.
 *
 * @returns A kebab-case string such as "blue-light", "gray-dark",
 *          "black", or "white".
 */
export function autoNameColor(rgba: FigmaRGBA): string {
  const { h, s, l } = hslFromRgba(rgba);

  // Achromatic: saturation < 10
  if (s < 10) {
    if (l > 90) return 'white';
    if (l <= 10) return 'black';
    return `gray-${luminanceLevel(l)}`;
  }

  // Chromatic: pick hue bucket
  let hue = 'red';
  for (const bucket of HUE_BUCKETS) {
    if (h < bucket.max) {
      hue = bucket.name;
      break;
    }
  }

  return `${hue}-${luminanceLevel(l)}`;
}

// ---------------------------------------------------------------------------
// Public API — sanitizers
// ---------------------------------------------------------------------------

/**
 * Normalize a Figma Named Style name to kebab-case.
 *
 * Replaces "/" with "-" first, then applies {@link toKebabCase}.
 */
export function sanitizeStyleName(name: string): string {
  return toKebabCase(name.replace(/\//g, '-'));
}

/**
 * Make a Figma node ID safe for use in file names.
 *
 * Replaces ":" with "-" (e.g. "123:456" -> "123-456").
 */
export function sanitizeNodeId(nodeId: string): string {
  return nodeId.replace(/:/g, '-');
}
