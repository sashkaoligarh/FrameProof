/**
 * Hex ↔ RGBA color conversion for Figma Variables API.
 *
 * Figma Variables API requires RGBA objects with float 0–1 values.
 * MCP tools accept both hex strings and RGBA objects for ergonomics.
 */

import type { ColorValue } from '../../types/write-api.js';

/**
 * Parse a hex color string to Figma RGBA (0–1 floats).
 *
 * Accepted formats:
 *   - #RRGGBB   → alpha defaults to 1
 *   - #RRGGBBAA → alpha from AA component
 *
 * @throws Error if hex string is invalid
 */
export function hexToRgba(hex: string): ColorValue {
  if (!hex.startsWith('#')) {
    throw new Error(`Invalid hex color: "${hex}". Must start with #.`);
  }

  const h = hex.slice(1);

  if (h.length !== 6 && h.length !== 8) {
    throw new Error(
      `Invalid hex color: "${hex}". Expected #RRGGBB or #RRGGBBAA format.`,
    );
  }

  if (!/^[0-9a-fA-F]+$/.test(h)) {
    throw new Error(
      `Invalid hex color: "${hex}". Contains non-hex characters.`,
    );
  }

  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;

  return { r, g, b, a };
}

/**
 * Validate an RGBA object has all channels in the 0–1 range.
 *
 * @throws Error if any channel is out of range
 */
export function validateRgba(rgba: ColorValue): ColorValue {
  const channels: Array<[string, number]> = [
    ['r', rgba.r],
    ['g', rgba.g],
    ['b', rgba.b],
    ['a', rgba.a],
  ];

  for (const [name, value] of channels) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`RGBA channel "${name}" must be a number, got ${typeof value}.`);
    }
    if (value < 0 || value > 1) {
      throw new Error(
        `RGBA channel "${name}" must be between 0 and 1, got ${value}.`,
      );
    }
  }

  return rgba;
}

/**
 * Resolve a color input to a Figma RGBA object.
 *
 * Accepts:
 *   - Hex string (#RRGGBB or #RRGGBBAA)
 *   - RGBA object { r, g, b, a } with 0–1 floats
 *
 * @throws Error if input is invalid
 */
export function resolveColor(
  input: string | ColorValue,
): ColorValue {
  if (typeof input === 'string') {
    return hexToRgba(input);
  }
  return validateRgba(input);
}

/**
 * Check if a value looks like a hex color string.
 */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('#');
}
