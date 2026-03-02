/**
 * T020 — Typography extractor tests.
 *
 * Uses the simple-file.json fixture parsed via parseDocumentTree,
 * then validates that extractTypography produces correct TypographyToken[].
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocumentTree } from '../../../src/pipeline/parse.js';
import type { ParseOptions } from '../../../src/pipeline/parse.js';
import { extractTypography } from '../../../src/extractors/typography.js';
import type { Node } from '@figma/rest-api-spec';
import type { ParsedNode, TypographyToken } from '../../../src/types/tokens.js';

// ---------------------------------------------------------------------------
// Load fixture
// ---------------------------------------------------------------------------

const fixturePath = resolve(
  import.meta.dirname!,
  '../../fixtures/api-responses/simple-file.json',
);

interface SimpleFileFixture {
  document: Node;
}

const fixture: SimpleFileFixture = JSON.parse(
  readFileSync(fixturePath, 'utf-8'),
) as SimpleFileFixture;

const doc = fixture.document;
const defaultOpts: ParseOptions = { includeHidden: false };
const nodes: ParsedNode[] = parseDocumentTree(doc, defaultOpts);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractTypography — return type', () => {
  const typo = extractTypography(nodes);

  it('returns an array', () => {
    expect(Array.isArray(typo)).toBe(true);
  });

  it('returns TypographyToken objects with all required fields', () => {
    for (const token of typo) {
      expect(token).toHaveProperty('name');
      expect(token).toHaveProperty('node_id');
      expect(token).toHaveProperty('font_family');
      expect(token).toHaveProperty('font_size');
      expect(token).toHaveProperty('font_weight');
      expect(token).toHaveProperty('font_style');
      expect(token).toHaveProperty('line_height');
      expect(token).toHaveProperty('letter_spacing');
      expect(token).toHaveProperty('text_align_horizontal');
      expect(token).toHaveProperty('text_case');
      expect(token).toHaveProperty('text_decoration');
      expect(token).toHaveProperty('sample_text');
      expect(token).toHaveProperty('usage_count');
    }
  });
});

describe('extractTypography — TEXT nodes from fixture', () => {
  const typo = extractTypography(nodes);

  it('extracts typography from TEXT nodes (1:3 and 1:4)', () => {
    // There are 2 TEXT nodes in the fixture: Heading Text (1:3) and Body Text (1:4)
    // They have different styles so should produce 2 unique tokens
    expect(typo.length).toBeGreaterThanOrEqual(2);
  });

  it('finds Inter Bold 32px (heading)', () => {
    const heading = typo.find(
      (t) => t.font_family === 'Inter' && t.font_weight === 700 && t.font_size === 32,
    );
    expect(heading).toBeDefined();
  });

  it('finds Inter Regular 16px (body)', () => {
    const body = typo.find(
      (t) => t.font_family === 'Inter' && t.font_weight === 400 && t.font_size === 16,
    );
    expect(body).toBeDefined();
  });
});

describe('extractTypography — font properties', () => {
  const typo = extractTypography(nodes);

  it('font_family matches "Inter" for both text nodes', () => {
    for (const token of typo) {
      expect(token.font_family).toBe('Inter');
    }
  });

  it('font_size matches fixture values', () => {
    const sizes = typo.map((t) => t.font_size).sort((a, b) => a - b);
    expect(sizes).toContain(16);
    expect(sizes).toContain(32);
  });

  it('font_weight matches fixture values', () => {
    const weights = typo.map((t) => t.font_weight).sort((a, b) => a - b);
    expect(weights).toContain(400);
    expect(weights).toContain(700);
  });
});

describe('extractTypography — line_height', () => {
  const typo = extractTypography(nodes);

  it('line_height is "40px" for heading (PIXELS type, lineHeightPx: 40)', () => {
    const heading = typo.find((t) => t.font_size === 32);
    expect(heading).toBeDefined();
    expect(heading!.line_height).toBe('40px');
  });

  it('line_height is "24px" for body (PIXELS type, lineHeightPx: 24)', () => {
    const body = typo.find((t) => t.font_size === 16);
    expect(body).toBeDefined();
    expect(body!.line_height).toBe('24px');
  });
});

describe('extractTypography — letter_spacing', () => {
  const typo = extractTypography(nodes);

  it('letter_spacing is -0.5 for heading', () => {
    const heading = typo.find((t) => t.font_size === 32);
    expect(heading).toBeDefined();
    expect(heading!.letter_spacing).toBe(-0.5);
  });

  it('letter_spacing is 0 for body', () => {
    const body = typo.find((t) => t.font_size === 16);
    expect(body).toBeDefined();
    expect(body!.letter_spacing).toBe(0);
  });
});

describe('extractTypography — text_case', () => {
  const typo = extractTypography(nodes);

  it('text_case is "ORIGINAL" for both text nodes', () => {
    for (const token of typo) {
      expect(token.text_case).toBe('ORIGINAL');
    }
  });
});

describe('extractTypography — sample_text', () => {
  const typo = extractTypography(nodes);

  it('sample_text contains the first characters of the text content', () => {
    const heading = typo.find((t) => t.font_size === 32);
    expect(heading).toBeDefined();
    expect(heading!.sample_text).toContain('Welcome to Design System');
  });

  it('sample_text is at most 50 characters', () => {
    for (const token of typo) {
      expect(token.sample_text.length).toBeLessThanOrEqual(50);
    }
  });
});

describe('extractTypography — deduplication', () => {
  it('same style on multiple nodes aggregates usage_count', () => {
    // Create two mock TEXT nodes with identical style properties
    const sharedStyle = {
      fontFamily: 'Inter',
      fontSize: 14,
      fontWeight: 400,
      fontPostScriptName: 'Inter-Regular',
      lineHeightPx: 20,
      lineHeightUnit: 'PIXELS',
      letterSpacing: 0,
      textCase: 'ORIGINAL',
      textDecoration: 'NONE',
      textAlignHorizontal: 'LEFT',
    };

    const mockNodes: ParsedNode[] = [
      {
        node_id: 'dup:1',
        node_type: 'TEXT',
        name: 'Text A',
        parent_id: null,
        depth: 0,
        raw: {
          type: 'TEXT',
          characters: 'Hello',
          style: { ...sharedStyle },
          fills: [],
          strokes: [],
          effects: [],
          visible: true,
        } as unknown as Node,
      },
      {
        node_id: 'dup:2',
        node_type: 'TEXT',
        name: 'Text B',
        parent_id: null,
        depth: 0,
        raw: {
          type: 'TEXT',
          characters: 'World',
          style: { ...sharedStyle },
          fills: [],
          strokes: [],
          effects: [],
          visible: true,
        } as unknown as Node,
      },
    ];

    const result = extractTypography(mockNodes);
    // Same style should be deduplicated to a single token
    expect(result).toHaveLength(1);
    expect(result[0].usage_count).toBe(2);
  });
});

describe('extractTypography — precision (SC-002)', () => {
  const typo = extractTypography(nodes);

  it('fontSize values match fixture within +/-0.5px', () => {
    const heading = typo.find((t) => t.font_weight === 700);
    expect(heading).toBeDefined();
    expect(heading!.font_size).toBeCloseTo(32, 0);
    expect(Math.abs(heading!.font_size - 32)).toBeLessThanOrEqual(0.5);

    const body = typo.find((t) => t.font_weight === 400);
    expect(body).toBeDefined();
    expect(body!.font_size).toBeCloseTo(16, 0);
    expect(Math.abs(body!.font_size - 16)).toBeLessThanOrEqual(0.5);
  });
});
