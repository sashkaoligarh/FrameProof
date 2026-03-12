import { describe, it, expect } from 'vitest';
import { hexToRgba, validateRgba, resolveColor, isHexColor } from '../../../src/mcp/utils/color-convert.js';

describe('hexToRgba', () => {
  it('converts 6-digit hex to RGBA', () => {
    const result = hexToRgba('#FF4136');
    expect(result.r).toBeCloseTo(1.0, 2);
    expect(result.g).toBeCloseTo(0.255, 2);
    expect(result.b).toBeCloseTo(0.212, 2);
    expect(result.a).toBe(1);
  });

  it('converts 8-digit hex with alpha to RGBA', () => {
    const result = hexToRgba('#FF413680');
    expect(result.r).toBeCloseTo(1.0, 2);
    expect(result.g).toBeCloseTo(0.255, 2);
    expect(result.b).toBeCloseTo(0.212, 2);
    expect(result.a).toBeCloseTo(0.502, 2);
  });

  it('converts black', () => {
    const result = hexToRgba('#000000');
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('converts white', () => {
    const result = hexToRgba('#FFFFFF');
    expect(result).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it('handles lowercase hex', () => {
    const result = hexToRgba('#ff4136');
    expect(result.r).toBeCloseTo(1.0, 2);
  });

  it('throws for missing # prefix', () => {
    expect(() => hexToRgba('FF4136')).toThrow('Must start with #');
  });

  it('throws for invalid length', () => {
    expect(() => hexToRgba('#FFF')).toThrow('#RRGGBB or #RRGGBBAA');
  });

  it('throws for non-hex characters', () => {
    expect(() => hexToRgba('#GGHHII')).toThrow('non-hex characters');
  });
});

describe('validateRgba', () => {
  it('passes through valid RGBA', () => {
    const rgba = { r: 0.5, g: 0.3, b: 0.1, a: 1 };
    expect(validateRgba(rgba)).toEqual(rgba);
  });

  it('accepts boundary values 0 and 1', () => {
    expect(validateRgba({ r: 0, g: 0, b: 0, a: 0 })).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(validateRgba({ r: 1, g: 1, b: 1, a: 1 })).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it('throws for value > 1', () => {
    expect(() => validateRgba({ r: 1.5, g: 0, b: 0, a: 1 })).toThrow('between 0 and 1');
  });

  it('throws for value < 0', () => {
    expect(() => validateRgba({ r: -0.1, g: 0, b: 0, a: 1 })).toThrow('between 0 and 1');
  });

  it('throws for NaN', () => {
    expect(() => validateRgba({ r: NaN, g: 0, b: 0, a: 1 })).toThrow('must be a number');
  });
});

describe('resolveColor', () => {
  it('resolves hex string to RGBA', () => {
    const result = resolveColor('#FF0000');
    expect(result).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it('passes through valid RGBA object', () => {
    const rgba = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    expect(resolveColor(rgba)).toEqual(rgba);
  });

  it('validates RGBA object channels', () => {
    expect(() => resolveColor({ r: 2, g: 0, b: 0, a: 1 })).toThrow('between 0 and 1');
  });
});

describe('isHexColor', () => {
  it('returns true for hex strings', () => {
    expect(isHexColor('#FF0000')).toBe(true);
  });

  it('returns false for non-strings', () => {
    expect(isHexColor(42)).toBe(false);
    expect(isHexColor({ r: 1, g: 0, b: 0, a: 1 })).toBe(false);
  });

  it('returns false for strings not starting with #', () => {
    expect(isHexColor('red')).toBe(false);
  });
});
