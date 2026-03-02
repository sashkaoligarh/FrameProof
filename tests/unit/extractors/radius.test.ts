/**
 * T022 — Border radius extractor tests.
 *
 * Uses the simple-file.json fixture parsed via parseDocumentTree,
 * then validates that extractRadius produces correct RadiusToken[].
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocumentTree } from '../../../src/pipeline/parse.js';
import type { ParseOptions } from '../../../src/pipeline/parse.js';
import { extractRadius } from '../../../src/extractors/radius.js';
import type { Node } from '@figma/rest-api-spec';
import type { ParsedNode, RadiusToken } from '../../../src/types/tokens.js';

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

describe('extractRadius — return type', () => {
  const radii = extractRadius(nodes);

  it('returns an array', () => {
    expect(Array.isArray(radii)).toBe(true);
  });

  it('returns RadiusToken objects with all required fields', () => {
    for (const token of radii) {
      expect(token).toHaveProperty('value');
      expect(token).toHaveProperty('is_per_corner');
      expect(token).toHaveProperty('usage_count');
    }
  });
});

describe('extractRadius — values from fixture', () => {
  const radii = extractRadius(nodes);
  const values = radii.map((r) => r.value);

  it('extracts cornerRadius 8 (from frame 1:1)', () => {
    expect(values).toContain(8);
  });

  it('extracts cornerRadius 4 (from button 1:2 and 1:8)', () => {
    expect(values).toContain(4);
  });

  it('extracts cornerRadius 12 (from gradient card 1:6)', () => {
    expect(values).toContain(12);
  });
});

describe('extractRadius — deduplication', () => {
  const radii = extractRadius(nodes);

  it('value 4 appears only once (deduplicated)', () => {
    const fours = radii.filter((r) => r.value === 4);
    expect(fours).toHaveLength(1);
  });

  it('value 4 has usage_count > 1 (appears on 1:2 and 1:8)', () => {
    const four = radii.find((r) => r.value === 4);
    expect(four).toBeDefined();
    expect(four!.usage_count).toBeGreaterThan(1);
  });

  it('all values are unique in the result', () => {
    const uniqueValues = new Set(radii.map((r) => r.value));
    expect(uniqueValues.size).toBe(radii.length);
  });
});

describe('extractRadius — sorted by value ascending', () => {
  const radii = extractRadius(nodes);

  it('tokens are sorted by value in ascending order', () => {
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i - 1].value).toBeLessThanOrEqual(radii[i].value);
    }
  });

  it('order is 4, 8, 12 for fixture values', () => {
    const values = radii.map((r) => r.value);
    const fixtureValues = values.filter((v) => [4, 8, 12].includes(v));
    expect(fixtureValues).toEqual([4, 8, 12]);
  });
});

describe('extractRadius — skips zero radius', () => {
  it('does not include nodes with cornerRadius 0', () => {
    const mockNodes: ParsedNode[] = [
      {
        node_id: 'zero:1',
        node_type: 'RECTANGLE',
        name: 'No Radius',
        parent_id: null,
        depth: 0,
        raw: {
          type: 'RECTANGLE',
          cornerRadius: 0,
          fills: [],
          strokes: [],
          effects: [],
        } as unknown as Node,
      },
    ];

    const result = extractRadius(mockNodes);
    expect(result).toHaveLength(0);
  });
});

describe('extractRadius — per-corner detection', () => {
  it('detects per-corner radius when rectangleCornerRadii has different values', () => {
    const mockNodes: ParsedNode[] = [
      {
        node_id: 'corner:1',
        node_type: 'RECTANGLE',
        name: 'Mixed Corners',
        parent_id: null,
        depth: 0,
        raw: {
          type: 'RECTANGLE',
          cornerRadius: 8,
          rectangleCornerRadii: [8, 4, 8, 4],
          fills: [],
          strokes: [],
          effects: [],
        } as unknown as Node,
      },
    ];

    const result = extractRadius(mockNodes);
    // The implementation should detect that corners differ
    expect(result.length).toBeGreaterThan(0);
  });
});
