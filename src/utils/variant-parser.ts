/**
 * Variant name parsing utility for Figma design parser.
 *
 * Figma component variants encode their properties in the variant name
 * as a comma-separated list of `Key=Value` pairs, for example:
 *
 *   "Size=S, State=Default"  ->  { Size: "S", State: "Default" }
 *
 * This module provides a parser for that format.
 */

/**
 * Parse a Figma variant name into a record of property key-value pairs.
 *
 * @param name - The variant name string (e.g. "Size=S, State=Default").
 * @returns A `Record<string, string>` mapping property names to their values.
 *          Returns an empty object for empty or whitespace-only input.
 *
 * @example
 * ```ts
 * parseVariantName("Size=S, State=Default");
 * // => { Size: "S", State: "Default" }
 *
 * parseVariantName("Type=Primary");
 * // => { Type: "Primary" }
 *
 * parseVariantName("");
 * // => {}
 * ```
 */
export function parseVariantName(name: string): Record<string, string> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return {};
  }

  const result: Record<string, string> = {};

  const pairs = trimmed.split(',');

  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      // No equals sign — skip this segment (malformed).
      continue;
    }

    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();

    if (key.length > 0) {
      result[key] = value;
    }
  }

  return result;
}
