/**
 * T013 — Color conversion utilities tests.
 */

import { describe, it, expect } from 'vitest';
import {
  rgbaToHex,
  rgbaToCSS,
  hslFromRgba,
  figmaRgbaToInt,
} from '../../../src/utils/color.js';
import type { FigmaRGBA } from '../../../src/utils/color.js';

// ---------------------------------------------------------------------------
// rgbaToHex
// ---------------------------------------------------------------------------

describe('rgbaToHex', () => {
  it('converts pure white to #ffffff', () => {
    const white: FigmaRGBA = { r: 1, g: 1, b: 1, a: 1 };
    expect(rgbaToHex(white)).toBe('#ffffff');
  });

  it('converts pure black to #000000', () => {
    const black: FigmaRGBA = { r: 0, g: 0, b: 0, a: 1 };
    expect(rgbaToHex(black)).toBe('#000000');
  });

  it('converts a Figma blue to the correct hex', () => {
    const blue: FigmaRGBA = { r: 0.145, g: 0.388, b: 0.922, a: 1 };
    // 0.145 * 255 ≈ 37 -> 0x25, 0.388 * 255 ≈ 99 -> 0x63, 0.922 * 255 ≈ 235 -> 0xeb
    expect(rgbaToHex(blue)).toBe('#2563eb');
  });

  it('returns 8-char hex (#RRGGBBAA) for semi-transparent colors', () => {
    const semiTransparent: FigmaRGBA = { r: 1, g: 0, b: 0, a: 0.5 };
    const hex = rgbaToHex(semiTransparent);
    expect(hex).toHaveLength(9); // '#' + 8 hex chars
    expect(hex).toMatch(/^#[0-9a-f]{8}$/);
    // alpha 0.5 * 255 = 127.5 -> round to 128 -> 0x80
    expect(hex).toBe('#ff000080');
  });

  it('returns 6-char hex when alpha is exactly 1', () => {
    const opaque: FigmaRGBA = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const hex = rgbaToHex(opaque);
    expect(hex).toHaveLength(7); // '#' + 6 hex chars
  });
});

// ---------------------------------------------------------------------------
// rgbaToCSS
// ---------------------------------------------------------------------------

describe('rgbaToCSS', () => {
  it('returns hex string for opaque colors', () => {
    const opaque: FigmaRGBA = { r: 1, g: 1, b: 1, a: 1 };
    const css = rgbaToCSS(opaque);
    expect(css).toBe('#ffffff');
    expect(css).not.toContain('rgba');
  });

  it('returns rgba() format for semi-transparent colors', () => {
    const semi: FigmaRGBA = { r: 0, g: 0, b: 0, a: 0.1 };
    const css = rgbaToCSS(semi);
    expect(css).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
    expect(css).toBe('rgba(0, 0, 0, 0.1)');
  });

  it('rounds alpha to at most 4 decimal places', () => {
    const precise: FigmaRGBA = { r: 1, g: 0, b: 0, a: 0.33333333 };
    const css = rgbaToCSS(precise);
    // Alpha value should be rounded to 4 decimal places
    const match = css.match(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/);
    expect(match).not.toBeNull();
    const alpha = match![1];
    // At most 4 decimal places
    const decimalPart = alpha.split('.')[1] ?? '';
    expect(decimalPart.length).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// hslFromRgba
// ---------------------------------------------------------------------------

describe('hslFromRgba', () => {
  it('returns h ≈ 0 for pure red', () => {
    const red: FigmaRGBA = { r: 1, g: 0, b: 0, a: 1 };
    const { h } = hslFromRgba(red);
    expect(h).toBe(0);
  });

  it('returns h ≈ 120 for pure green', () => {
    const green: FigmaRGBA = { r: 0, g: 1, b: 0, a: 1 };
    const { h } = hslFromRgba(green);
    expect(h).toBe(120);
  });

  it('returns h ≈ 240 for pure blue', () => {
    const blue: FigmaRGBA = { r: 0, g: 0, b: 1, a: 1 };
    const { h } = hslFromRgba(blue);
    expect(h).toBe(240);
  });

  it('returns s = 0 for achromatic (gray) colors', () => {
    const gray: FigmaRGBA = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const { s } = hslFromRgba(gray);
    expect(s).toBe(0);
  });

  it('returns s = 0 for pure white', () => {
    const white: FigmaRGBA = { r: 1, g: 1, b: 1, a: 1 };
    const { s } = hslFromRgba(white);
    expect(s).toBe(0);
  });

  it('returns s = 0 for pure black', () => {
    const black: FigmaRGBA = { r: 0, g: 0, b: 0, a: 1 };
    const { s } = hslFromRgba(black);
    expect(s).toBe(0);
  });

  it('returns l = 50 for pure primary colors', () => {
    const red: FigmaRGBA = { r: 1, g: 0, b: 0, a: 1 };
    const { l } = hslFromRgba(red);
    expect(l).toBe(50);
  });

  it('returns all values as integers', () => {
    const arbitrary: FigmaRGBA = { r: 0.145, g: 0.388, b: 0.922, a: 1 };
    const { h, s, l } = hslFromRgba(arbitrary);
    expect(Number.isInteger(h)).toBe(true);
    expect(Number.isInteger(s)).toBe(true);
    expect(Number.isInteger(l)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// figmaRgbaToInt
// ---------------------------------------------------------------------------

describe('figmaRgbaToInt', () => {
  it('converts 0-1 float channels to 0-255 integers', () => {
    const white: FigmaRGBA = { r: 1, g: 1, b: 1, a: 1 };
    const result = figmaRgbaToInt(white);
    expect(result).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('converts black correctly', () => {
    const black: FigmaRGBA = { r: 0, g: 0, b: 0, a: 1 };
    const result = figmaRgbaToInt(black);
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('rounds mid-range floats to nearest integer', () => {
    const mid: FigmaRGBA = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const result = figmaRgbaToInt(mid);
    expect(result.r).toBe(128); // Math.round(0.5 * 255) = 128
    expect(result.g).toBe(128);
    expect(result.b).toBe(128);
  });

  it('keeps alpha as a 0-1 float rounded to 4 decimal places', () => {
    const semiTransparent: FigmaRGBA = { r: 0, g: 0, b: 0, a: 0.33333 };
    const result = figmaRgbaToInt(semiTransparent);
    expect(result.a).toBe(0.3333);
    // a should remain a float, not 0-255
    expect(result.a).toBeLessThanOrEqual(1);
  });

  it('converts the Figma blue correctly', () => {
    const blue: FigmaRGBA = { r: 0.145, g: 0.388, b: 0.922, a: 1 };
    const result = figmaRgbaToInt(blue);
    expect(result.r).toBe(37);  // Math.round(0.145 * 255)
    expect(result.g).toBe(99);  // Math.round(0.388 * 255)
    expect(result.b).toBe(235); // Math.round(0.922 * 255)
    expect(result.a).toBe(1);
  });
});
