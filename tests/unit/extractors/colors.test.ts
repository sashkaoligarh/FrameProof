/**
 * T018 — Color extractor tests.
 *
 * Uses the simple-file.json fixture parsed via parseDocumentTree,
 * then validates that extractColors produces correct ColorToken[].
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocumentTree } from '../../../src/pipeline/parse.js';
import type { ParseOptions } from '../../../src/pipeline/parse.js';
import { extractColors } from '../../../src/extractors/colors.js';
import type { Node } from '@figma/rest-api-spec';
import type { ParsedNode, ColorToken, StyleMeta } from '../../../src/types/tokens.js';

// ---------------------------------------------------------------------------
// Load fixture
// ---------------------------------------------------------------------------

const fixturePath = resolve(
  import.meta.dirname!,
  '../../fixtures/api-responses/simple-file.json',
);

interface SimpleFileFixture {
  document: Node;
  styles: Record<string, { key: string; name: string; styleType: string; description: string }>;
}

const fixture: SimpleFileFixture = JSON.parse(
  readFileSync(fixturePath, 'utf-8'),
) as SimpleFileFixture;

const doc = fixture.document;
const defaultOpts: ParseOptions = { includeHidden: false };
const nodes: ParsedNode[] = parseDocumentTree(doc, defaultOpts);

// Build a StyleMeta map from the fixture. The fixture uses Figma's camelCase
// keys (styleType), while our code expects StyleMeta.
const styles: Record<string, StyleMeta> = {};
for (const [id, entry] of Object.entries(fixture.styles)) {
  styles[id] = {
    key: entry.key,
    name: entry.name,
    style_type: entry.styleType,
    description: entry.description,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractColors — return type', () => {
  const colors = extractColors(nodes, styles);

  it('returns an array', () => {
    expect(Array.isArray(colors)).toBe(true);
  });

  it('returns ColorToken objects with all required fields', () => {
    for (const token of colors) {
      expect(token).toHaveProperty('name');
      expect(token).toHaveProperty('node_id');
      expect(token).toHaveProperty('source_type');
      expect(token).toHaveProperty('value_hex');
      expect(token).toHaveProperty('value_rgba');
      expect(token).toHaveProperty('opacity');
      expect(token).toHaveProperty('usage_count');
      expect(token).toHaveProperty('used_in_types');
    }
  });
});

describe('extractColors — solid fills', () => {
  const colors = extractColors(nodes, styles);

  it('extracts the blue fill (#2563eb)', () => {
    const blue = colors.find((c) => c.value_hex === '#2563eb');
    expect(blue).toBeDefined();
  });

  it('blue fill has correct RGBA values (0-255 integers for r,g,b)', () => {
    const blue = colors.find((c) => c.value_hex === '#2563eb')!;
    // 0.145 * 255 ≈ 37, 0.388 * 255 ≈ 99, 0.922 * 255 ≈ 235
    expect(blue.value_rgba.r).toBe(37);
    expect(blue.value_rgba.g).toBe(99);
    expect(blue.value_rgba.b).toBe(235);
  });

  it('extracts the white fill (#ffffff) from the Colors Frame', () => {
    const white = colors.find((c) => c.value_hex === '#ffffff');
    expect(white).toBeDefined();
  });

  it('extracts the dark heading text fill', () => {
    // 0.067 * 255 ≈ 17, 0.094 * 255 ≈ 24, 0.153 * 255 ≈ 39 -> #111827
    const dark = colors.find((c) => c.value_hex === '#111827');
    expect(dark).toBeDefined();
  });
});

describe('extractColors — solid strokes', () => {
  const colors = extractColors(nodes, styles);

  it('extracts the stroke color from Primary Button', () => {
    // Stroke: r 0.098, g 0.325, b 0.835 -> 25, 83, 213 -> #1953d5
    const stroke = colors.find((c) => c.source_type === 'stroke');
    expect(stroke).toBeDefined();
    expect(stroke!.value_hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('extractColors — deduplication by hex', () => {
  const colors = extractColors(nodes, styles);

  it('deduplicates the blue fill (appears on 1:2 and 1:8)', () => {
    const blues = colors.filter((c) => c.value_hex === '#2563eb');
    // Should be exactly one entry, not two
    expect(blues).toHaveLength(1);
  });

  it('blue fill has usage_count of 2', () => {
    const blue = colors.find((c) => c.value_hex === '#2563eb')!;
    expect(blue.usage_count).toBe(2);
  });
});

describe('extractColors — skips hidden nodes', () => {
  const colors = extractColors(nodes, styles);

  it('does not include red fill from hidden node 1:5', () => {
    // Node 1:5 has a pure red fill (r:1, g:0, b:0) but is hidden.
    // Since we parse with includeHidden: false, it is excluded from nodes.
    const red = colors.find((c) => c.value_hex === '#ff0000');
    expect(red).toBeUndefined();
  });

  it('includes hidden node colors when includeHidden is true', () => {
    const allNodes = parseDocumentTree(doc, { includeHidden: true });
    const allColors = extractColors(allNodes, styles);
    const red = allColors.find((c) => c.value_hex === '#ff0000');
    expect(red).toBeDefined();
  });
});

describe('extractColors — usage_count reflects unique nodes (FR-019)', () => {
  const colors = extractColors(nodes, styles);

  it('usage_count is a positive integer for all tokens', () => {
    for (const token of colors) {
      expect(token.usage_count).toBeGreaterThan(0);
      expect(Number.isInteger(token.usage_count)).toBe(true);
    }
  });

  it('white fill has usage_count of 1 (only on frame 1:1)', () => {
    const white = colors.find((c) => c.value_hex === '#ffffff');
    expect(white).toBeDefined();
    expect(white!.usage_count).toBe(1);
  });
});

describe('extractColors — RGBA precision (SC-001)', () => {
  const colors = extractColors(nodes, styles);

  it('r, g, b values are integers in the 0-255 range', () => {
    for (const token of colors) {
      expect(Number.isInteger(token.value_rgba.r)).toBe(true);
      expect(Number.isInteger(token.value_rgba.g)).toBe(true);
      expect(Number.isInteger(token.value_rgba.b)).toBe(true);
      expect(token.value_rgba.r).toBeGreaterThanOrEqual(0);
      expect(token.value_rgba.r).toBeLessThanOrEqual(255);
      expect(token.value_rgba.g).toBeGreaterThanOrEqual(0);
      expect(token.value_rgba.g).toBeLessThanOrEqual(255);
      expect(token.value_rgba.b).toBeGreaterThanOrEqual(0);
      expect(token.value_rgba.b).toBeLessThanOrEqual(255);
    }
  });

  it('alpha is a float in the 0-1 range', () => {
    for (const token of colors) {
      expect(token.value_rgba.a).toBeGreaterThanOrEqual(0);
      expect(token.value_rgba.a).toBeLessThanOrEqual(1);
    }
  });
});

describe('extractColors — sorting', () => {
  const colors = extractColors(nodes, styles);

  it('colors are sorted by usage_count descending', () => {
    for (let i = 1; i < colors.length; i++) {
      expect(colors[i - 1].usage_count).toBeGreaterThanOrEqual(colors[i].usage_count);
    }
  });

  it('blue (usage_count 2) appears before colors with usage_count 1', () => {
    const blue = colors.find((c) => c.value_hex === '#2563eb')!;
    const blueIndex = colors.indexOf(blue);
    const singleUseColors = colors.filter((c) => c.usage_count === 1);
    for (const single of singleUseColors) {
      const singleIndex = colors.indexOf(single);
      expect(blueIndex).toBeLessThan(singleIndex);
    }
  });
});

describe('extractColors — named styles', () => {
  it('uses style name when styles map has matching entry', () => {
    // Create a node whose raw data references a style ID in the styles map.
    // The fixture has style "S:style1" with name "Brand/Primary".
    // We create a mock node that references this style for its fill.
    const mockNode: ParsedNode = {
      node_id: 'mock:1',
      node_type: 'RECTANGLE',
      name: 'Mock',
      parent_id: null,
      depth: 0,
      raw: {
        type: 'RECTANGLE',
        fills: [
          {
            type: 'SOLID',
            color: { r: 0.145, g: 0.388, b: 0.922, a: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        strokes: [],
        styles: { fill: 'S:style1' },
      } as unknown as Node,
    };

    const result = extractColors([mockNode], styles);
    expect(result).toHaveLength(1);
    // The style name "Brand/Primary" should be used (may be kebab-cased by the implementation)
    expect(result[0].name).toContain('Brand');
  });

  it('falls back to auto-generated name when no style is found', () => {
    const mockNode: ParsedNode = {
      node_id: 'mock:2',
      node_type: 'RECTANGLE',
      name: 'Mock',
      parent_id: null,
      depth: 0,
      raw: {
        type: 'RECTANGLE',
        fills: [
          {
            type: 'SOLID',
            color: { r: 1, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        strokes: [],
      } as unknown as Node,
    };

    const result = extractColors([mockNode], {});
    expect(result).toHaveLength(1);
    // Should have an auto-generated name (not empty)
    expect(result[0].name.length).toBeGreaterThan(0);
  });
});
