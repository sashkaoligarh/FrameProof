/**
 * T015 — Variant parser tests.
 */

import { describe, it, expect } from 'vitest';
import { parseVariantName } from '../../../src/utils/variant-parser.js';

describe('parseVariantName', () => {
  it('parses standard "Size=S, State=Default" format', () => {
    const result = parseVariantName('Size=S, State=Default');
    expect(result).toEqual({ Size: 'S', State: 'Default' });
  });

  it('parses a single property "Size=Large"', () => {
    const result = parseVariantName('Size=Large');
    expect(result).toEqual({ Size: 'Large' });
  });

  it('returns empty object for empty string', () => {
    const result = parseVariantName('');
    expect(result).toEqual({});
  });

  it('returns empty object for whitespace-only string', () => {
    const result = parseVariantName('   ');
    expect(result).toEqual({});
  });

  it('trims whitespace around keys and values', () => {
    const result = parseVariantName(' Size = S , State = Default ');
    expect(result).toEqual({ Size: 'S', State: 'Default' });
  });

  it('handles values with spaces (e.g. "Label=Hello World")', () => {
    const result = parseVariantName('Label=Hello World');
    expect(result).toEqual({ Label: 'Hello World' });
  });

  it('handles multiple properties', () => {
    const result = parseVariantName('Size=S, State=Hover, Theme=Dark');
    expect(result).toEqual({ Size: 'S', State: 'Hover', Theme: 'Dark' });
  });

  it('skips malformed segments without "="', () => {
    const result = parseVariantName('Size=S, malformed, State=Default');
    expect(result).toEqual({ Size: 'S', State: 'Default' });
  });

  it('handles values containing "=" (only splits on first "=")', () => {
    const result = parseVariantName('Formula=a=b');
    expect(result).toEqual({ Formula: 'a=b' });
  });

  it('skips entries with empty key', () => {
    const result = parseVariantName('=nokey, Size=S');
    expect(result).toEqual({ Size: 'S' });
  });
});
