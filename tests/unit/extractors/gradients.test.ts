/**
 * T019 — Gradient extractor tests.
 *
 * Uses the simple-file.json fixture parsed via parseDocumentTree,
 * then validates that extractGradients produces correct GradientToken[].
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocumentTree } from '../../../src/pipeline/parse.js';
import type { ParseOptions } from '../../../src/pipeline/parse.js';
import { extractGradients } from '../../../src/extractors/gradients.js';
import type { Node } from '@figma/rest-api-spec';
import type { ParsedNode, GradientToken } from '../../../src/types/tokens.js';

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

describe('extractGradients — return type', () => {
  const gradients = extractGradients(nodes);

  it('returns an array', () => {
    expect(Array.isArray(gradients)).toBe(true);
  });

  it('returns GradientToken objects with all required fields', () => {
    for (const token of gradients) {
      expect(token).toHaveProperty('name');
      expect(token).toHaveProperty('node_id');
      expect(token).toHaveProperty('gradient_type');
      expect(token).toHaveProperty('stops');
      expect(token).toHaveProperty('handle_positions');
    }
  });
});

describe('extractGradients — fixture has one LINEAR gradient', () => {
  const gradients = extractGradients(nodes);

  it('extracts exactly one gradient from the fixture', () => {
    expect(gradients).toHaveLength(1);
  });

  it('gradient is from node 1:6 (Gradient Card)', () => {
    expect(gradients[0].node_id).toBe('1:6');
  });
});

describe('extractGradients — gradient_type', () => {
  const gradients = extractGradients(nodes);

  it('gradient_type is "LINEAR" (derived from GRADIENT_LINEAR)', () => {
    expect(gradients[0].gradient_type).toBe('LINEAR');
  });
});

describe('extractGradients — stops', () => {
  const gradients = extractGradients(nodes);
  const stops = gradients[0].stops;

  it('has exactly 2 stops', () => {
    expect(stops).toHaveLength(2);
  });

  it('first stop is at position 0', () => {
    expect(stops[0].position).toBe(0);
  });

  it('second stop is at position 1', () => {
    expect(stops[1].position).toBe(1);
  });

  it('each stop has a color_hex string', () => {
    for (const stop of stops) {
      expect(stop.color_hex).toMatch(/^#[0-9a-f]{6,8}$/);
    }
  });

  it('each stop has color_rgba with r,g,b as integers', () => {
    for (const stop of stops) {
      expect(Number.isInteger(stop.color_rgba.r)).toBe(true);
      expect(Number.isInteger(stop.color_rgba.g)).toBe(true);
      expect(Number.isInteger(stop.color_rgba.b)).toBe(true);
    }
  });

  it('first stop color matches the blue (0.145, 0.388, 0.922)', () => {
    expect(stops[0].color_hex).toBe('#2563eb');
  });
});

describe('extractGradients — handle_positions', () => {
  const gradients = extractGradients(nodes);
  const handles = gradients[0].handle_positions;

  it('has exactly 2 handle positions', () => {
    expect(handles).toHaveLength(2);
  });

  it('first handle is at (0, 0.5)', () => {
    expect(handles[0].x).toBe(0);
    expect(handles[0].y).toBe(0.5);
  });

  it('second handle is at (1, 0.5)', () => {
    expect(handles[1].x).toBe(1);
    expect(handles[1].y).toBe(0.5);
  });
});

describe('extractGradients — naming', () => {
  const gradients = extractGradients(nodes);

  it('name follows "gradient-{type}-{counter}" pattern', () => {
    expect(gradients[0].name).toBe('gradient-linear-1');
  });
});
