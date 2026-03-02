/**
 * T021 — Spacing extractor tests.
 *
 * Uses the simple-file.json fixture parsed via parseDocumentTree,
 * then validates that extractSpacing produces correct SpacingToken[].
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocumentTree } from '../../../src/pipeline/parse.js';
import type { ParseOptions } from '../../../src/pipeline/parse.js';
import { extractSpacing } from '../../../src/extractors/spacing.js';
import type { Node } from '@figma/rest-api-spec';
import type { ParsedNode, SpacingToken } from '../../../src/types/tokens.js';

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

describe('extractSpacing — return type', () => {
  const spacing = extractSpacing(nodes);

  it('returns an array', () => {
    expect(Array.isArray(spacing)).toBe(true);
  });

  it('returns SpacingToken objects with all required fields', () => {
    for (const token of spacing) {
      expect(token).toHaveProperty('value');
      expect(token).toHaveProperty('source');
      expect(token).toHaveProperty('usage_count');
    }
  });
});

describe('extractSpacing — auto-layout frames from fixture', () => {
  const spacing = extractSpacing(nodes);
  const values = spacing.map((s) => s.value);

  it('extracts spacing value 16 (padding from frame 1:1 and 1:7)', () => {
    expect(values).toContain(16);
  });

  it('extracts spacing value 12 (itemSpacing from frame 1:1)', () => {
    expect(values).toContain(12);
  });

  it('extracts spacing value 8 (padding and itemSpacing from frame 1:7)', () => {
    expect(values).toContain(8);
  });
});

describe('extractSpacing — values from specific frames', () => {
  const spacing = extractSpacing(nodes);

  it('includes padding source tokens', () => {
    const paddings = spacing.filter((s) => s.source === 'padding');
    expect(paddings.length).toBeGreaterThan(0);
  });

  it('includes item_spacing source tokens', () => {
    const itemSpacings = spacing.filter((s) => s.source === 'item_spacing');
    expect(itemSpacings.length).toBeGreaterThan(0);
  });
});

describe('extractSpacing — deduplication by value', () => {
  const spacing = extractSpacing(nodes);

  it('each value appears at most once per source type', () => {
    const seen = new Set<string>();
    for (const token of spacing) {
      const key = `${token.value}-${token.source}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('value 16 appears as padding with usage_count >= 2 (used in both frames)', () => {
    const padding16 = spacing.find(
      (s) => s.value === 16 && s.source === 'padding',
    );
    expect(padding16).toBeDefined();
    // Frame 1:1 has all padding = 16; frame 1:7 has paddingRight=16, paddingLeft=16
    expect(padding16!.usage_count).toBeGreaterThanOrEqual(2);
  });
});

describe('extractSpacing — sorted by value ascending', () => {
  const spacing = extractSpacing(nodes);

  it('tokens are sorted by value in ascending order', () => {
    for (let i = 1; i < spacing.length; i++) {
      expect(spacing[i - 1].value).toBeLessThanOrEqual(spacing[i].value);
    }
  });
});

describe('extractSpacing — ignores non-auto-layout frames', () => {
  it('does not extract spacing from frames without layoutMode', () => {
    const mockNodes: ParsedNode[] = [
      {
        node_id: 'no-layout:1',
        node_type: 'FRAME',
        name: 'Plain Frame',
        parent_id: null,
        depth: 0,
        raw: {
          type: 'FRAME',
          fills: [],
          strokes: [],
          effects: [],
          children: [],
          // No layoutMode, no padding, no itemSpacing
        } as unknown as Node,
      },
    ];

    const result = extractSpacing(mockNodes);
    expect(result).toHaveLength(0);
  });
});
