/**
 * T014 — Naming utilities tests.
 */

import { describe, it, expect } from 'vitest';
import {
  toKebabCase,
  toSnakeCase,
  autoNameColor,
  sanitizeStyleName,
  sanitizeCssIdentifier,
  sanitizeNodeId,
} from '../../../src/utils/naming.js';

// ---------------------------------------------------------------------------
// toKebabCase
// ---------------------------------------------------------------------------

describe('toKebabCase', () => {
  it('converts camelCase', () => {
    expect(toKebabCase('camelCase')).toBe('camel-case');
  });

  it('converts PascalCase', () => {
    expect(toKebabCase('PascalCase')).toBe('pascal-case');
  });

  it('converts spaces', () => {
    expect(toKebabCase('hello world')).toBe('hello-world');
  });

  it('converts underscores', () => {
    expect(toKebabCase('snake_case_string')).toBe('snake-case-string');
  });

  it('converts Figma style paths with /', () => {
    expect(toKebabCase('Brand/Primary/500')).toBe('brand-primary-500');
  });

  it('handles consecutive capitals (HTMLParser)', () => {
    expect(toKebabCase('HTMLParser')).toBe('html-parser');
  });

  it('returns empty string for empty input', () => {
    expect(toKebabCase('')).toBe('');
  });

  it('handles mixed delimiters', () => {
    expect(toKebabCase('some-mixed_Case/path')).toBe('some-mixed-case-path');
  });
});

// ---------------------------------------------------------------------------
// toSnakeCase
// ---------------------------------------------------------------------------

describe('toSnakeCase', () => {
  it('converts camelCase', () => {
    expect(toSnakeCase('camelCase')).toBe('camel_case');
  });

  it('converts PascalCase', () => {
    expect(toSnakeCase('PascalCase')).toBe('pascal_case');
  });

  it('converts spaces', () => {
    expect(toSnakeCase('hello world')).toBe('hello_world');
  });

  it('converts underscores (idempotent for snake_case input)', () => {
    expect(toSnakeCase('snake_case')).toBe('snake_case');
  });

  it('converts Figma style paths with /', () => {
    expect(toSnakeCase('Brand/Primary/500')).toBe('brand_primary_500');
  });

  it('handles consecutive capitals (HTMLParser)', () => {
    expect(toSnakeCase('HTMLParser')).toBe('html_parser');
  });

  it('returns empty string for empty input', () => {
    expect(toSnakeCase('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// autoNameColor
// ---------------------------------------------------------------------------

describe('autoNameColor', () => {
  it('names a blue color with "blue"', () => {
    const blue = { r: 0.145, g: 0.388, b: 0.922, a: 1 };
    const name = autoNameColor(blue);
    expect(name).toContain('blue');
  });

  it('names white as "white"', () => {
    const white = { r: 1, g: 1, b: 1, a: 1 };
    expect(autoNameColor(white)).toBe('white');
  });

  it('names black as "black"', () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    expect(autoNameColor(black)).toBe('black');
  });

  it('names a gray with "gray"', () => {
    const gray = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const name = autoNameColor(gray);
    expect(name).toContain('gray');
  });

  it('names pure red with "red"', () => {
    const red = { r: 1, g: 0, b: 0, a: 1 };
    expect(autoNameColor(red)).toContain('red');
  });

  it('names pure green with "green"', () => {
    const green = { r: 0, g: 1, b: 0, a: 1 };
    expect(autoNameColor(green)).toContain('green');
  });
});

// ---------------------------------------------------------------------------
// sanitizeStyleName
// ---------------------------------------------------------------------------

describe('sanitizeStyleName', () => {
  it('converts "Brand/Primary/500" to kebab-case', () => {
    expect(sanitizeStyleName('Brand/Primary/500')).toBe('brand-primary-500');
  });

  it('converts simple names', () => {
    expect(sanitizeStyleName('Background')).toBe('background');
  });

  it('handles nested paths with camelCase segments', () => {
    expect(sanitizeStyleName('Colors/textPrimary')).toBe('colors-text-primary');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeStyleName('')).toBe('');
  });
});

describe('sanitizeCssIdentifier', () => {
  it('removes quotes, slashes, punctuation, and control characters', () => {
    expect(sanitizeCssIdentifier('Brand/Primary"\'\n\u0007Alert')).toBe(
      'brand-primary-alert',
    );
  });

  it('uses a safe fallback when the name has no identifier characters', () => {
    expect(sanitizeCssIdentifier('"\'\n\u0000')).toBe('token');
    expect(sanitizeCssIdentifier('"\'\n', 'unnamed')).toBe('unnamed');
  });
});

// ---------------------------------------------------------------------------
// sanitizeNodeId
// ---------------------------------------------------------------------------

describe('sanitizeNodeId', () => {
  it('replaces colon with dash: "1:23" → "1-23"', () => {
    expect(sanitizeNodeId('1:23')).toBe('1-23');
  });

  it('handles multiple colons: "0:1:2" → "0-1-2"', () => {
    expect(sanitizeNodeId('0:1:2')).toBe('0-1-2');
  });

  it('returns unchanged string without colons', () => {
    expect(sanitizeNodeId('abc')).toBe('abc');
  });

  it('handles typical Figma node IDs', () => {
    expect(sanitizeNodeId('123:456')).toBe('123-456');
  });
});
