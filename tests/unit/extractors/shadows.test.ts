/**
 * T023 — Shadow extractor tests.
 *
 * Uses the simple-file.json fixture parsed via parseDocumentTree,
 * then validates that extractShadows produces correct ShadowToken[].
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocumentTree } from '../../../src/pipeline/parse.js';
import type { ParseOptions } from '../../../src/pipeline/parse.js';
import { extractShadows } from '../../../src/extractors/shadows.js';
import type { Node } from '@figma/rest-api-spec';
import type { ParsedNode, ShadowToken } from '../../../src/types/tokens.js';

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

describe('extractShadows — return type', () => {
  const shadows = extractShadows(nodes);

  it('returns an array', () => {
    expect(Array.isArray(shadows)).toBe(true);
  });

  it('returns ShadowToken objects with all required fields', () => {
    for (const token of shadows) {
      expect(token).toHaveProperty('name');
      expect(token).toHaveProperty('node_id');
      expect(token).toHaveProperty('shadow_type');
      expect(token).toHaveProperty('offset_x');
      expect(token).toHaveProperty('offset_y');
      expect(token).toHaveProperty('blur');
      expect(token).toHaveProperty('spread');
      expect(token).toHaveProperty('color_hex');
      expect(token).toHaveProperty('color_rgba');
      expect(token).toHaveProperty('css');
    }
  });
});

describe('extractShadows — fixture shadows', () => {
  const shadows = extractShadows(nodes);

  it('extracts exactly 2 shadows from the fixture', () => {
    // DROP_SHADOW on 1:2 and INNER_SHADOW on 1:6
    expect(shadows).toHaveLength(2);
  });

  it('has a DROP_SHADOW from node 1:2', () => {
    const drop = shadows.find((s) => s.shadow_type === 'DROP_SHADOW');
    expect(drop).toBeDefined();
    expect(drop!.node_id).toBe('1:2');
  });

  it('has an INNER_SHADOW from node 1:6', () => {
    const inner = shadows.find((s) => s.shadow_type === 'INNER_SHADOW');
    expect(inner).toBeDefined();
    expect(inner!.node_id).toBe('1:6');
  });
});

describe('extractShadows — shadow_type', () => {
  const shadows = extractShadows(nodes);

  it('correctly identifies DROP_SHADOW type', () => {
    const drop = shadows.find((s) => s.node_id === '1:2');
    expect(drop!.shadow_type).toBe('DROP_SHADOW');
  });

  it('correctly identifies INNER_SHADOW type', () => {
    const inner = shadows.find((s) => s.node_id === '1:6');
    expect(inner!.shadow_type).toBe('INNER_SHADOW');
  });
});

describe('extractShadows — DROP_SHADOW values (node 1:2)', () => {
  const shadows = extractShadows(nodes);
  const drop = shadows.find((s) => s.shadow_type === 'DROP_SHADOW')!;

  it('offset_x is 0', () => {
    expect(drop.offset_x).toBe(0);
  });

  it('offset_y is 2', () => {
    expect(drop.offset_y).toBe(2);
  });

  it('blur is 4', () => {
    expect(drop.blur).toBe(4);
  });

  it('spread is 0', () => {
    expect(drop.spread).toBe(0);
  });

  it('color is black with 10% opacity', () => {
    expect(drop.color_rgba.r).toBe(0);
    expect(drop.color_rgba.g).toBe(0);
    expect(drop.color_rgba.b).toBe(0);
    expect(drop.color_rgba.a).toBeCloseTo(0.1, 2);
  });
});

describe('extractShadows — INNER_SHADOW values (node 1:6)', () => {
  const shadows = extractShadows(nodes);
  const inner = shadows.find((s) => s.shadow_type === 'INNER_SHADOW')!;

  it('offset_x is 0', () => {
    expect(inner.offset_x).toBe(0);
  });

  it('offset_y is 1', () => {
    expect(inner.offset_y).toBe(1);
  });

  it('blur is 2', () => {
    expect(inner.blur).toBe(2);
  });

  it('spread is 0', () => {
    expect(inner.spread).toBe(0);
  });

  it('color is black with 5% opacity', () => {
    expect(inner.color_rgba.r).toBe(0);
    expect(inner.color_rgba.g).toBe(0);
    expect(inner.color_rgba.b).toBe(0);
    expect(inner.color_rgba.a).toBeCloseTo(0.05, 2);
  });
});

describe('extractShadows — CSS string', () => {
  const shadows = extractShadows(nodes);

  it('DROP_SHADOW CSS is "0px 2px 4px 0px rgba(0, 0, 0, 0.1)"', () => {
    const drop = shadows.find((s) => s.shadow_type === 'DROP_SHADOW')!;
    expect(drop.css).toBe('0px 2px 4px 0px rgba(0, 0, 0, 0.1)');
  });

  it('INNER_SHADOW CSS starts with "inset" and matches expected value', () => {
    const inner = shadows.find((s) => s.shadow_type === 'INNER_SHADOW')!;
    expect(inner.css).toBe('inset 0px 1px 2px 0px rgba(0, 0, 0, 0.05)');
  });
});

describe('extractShadows — naming', () => {
  const shadows = extractShadows(nodes);

  it('DROP_SHADOW is named "shadow-drop-1"', () => {
    const drop = shadows.find((s) => s.shadow_type === 'DROP_SHADOW')!;
    expect(drop.name).toBe('shadow-drop-1');
  });

  it('INNER_SHADOW is named "shadow-inner-1"', () => {
    const inner = shadows.find((s) => s.shadow_type === 'INNER_SHADOW')!;
    expect(inner.name).toBe('shadow-inner-1');
  });
});
