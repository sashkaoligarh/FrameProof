/**
 * Response limiter tests.
 *
 * Coverage:
 * - estimateJsonSize provides reasonable approximation
 * - trimNodeDetail returns untouched data when under limit
 * - trimNodeDetail strips children progressively when over limit
 * - trimNodeDetailArray handles batch truncation
 */

import { describe, it, expect } from 'vitest';
import {
  estimateJsonSize,
  trimNodeDetail,
  trimNodeDetailArray,
} from '../../../src/mcp/utils/response-limiter.js';
import type { NodeDetail } from '../../../src/types/mcp.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDetail(overrides: Partial<NodeDetail> = {}): NodeDetail {
  return {
    node_id: '1:1',
    name: 'Test',
    node_type: 'FRAME',
    width: 100,
    height: 50,
    x: 0,
    y: 0,
    visible: true,
    fills: [],
    strokes: [],
    effects: [],
    corner_radius: null,
    layout: null,
    typography: null,
    text_content: null,
    text_segments: null,
    children: [],
    component_info: null,
    ...overrides,
  };
}

function makeDeepTree(depth: number, breadth: number = 2): NodeDetail {
  if (depth <= 0) {
    return makeDetail({ name: `Leaf-${Math.random().toString(36).slice(2, 6)}` });
  }
  const children: NodeDetail[] = [];
  for (let i = 0; i < breadth; i++) {
    children.push(makeDeepTree(depth - 1, breadth));
  }
  return makeDetail({ name: `Node-D${depth}`, children });
}

// ---------------------------------------------------------------------------
// Tests — estimateJsonSize
// ---------------------------------------------------------------------------

describe('estimateJsonSize', () => {
  it('gives reasonable estimate for simple objects', () => {
    const obj = { name: 'hello', value: 42 };
    const estimate = estimateJsonSize(obj);
    const actual = JSON.stringify(obj).length;
    // Should be within 2x of actual
    expect(estimate).toBeGreaterThan(actual * 0.5);
    expect(estimate).toBeLessThan(actual * 2);
  });

  it('handles arrays', () => {
    const arr = [1, 2, 3, 'test'];
    const estimate = estimateJsonSize(arr);
    expect(estimate).toBeGreaterThan(0);
  });

  it('handles null and booleans', () => {
    expect(estimateJsonSize(null)).toBe(4);
    expect(estimateJsonSize(true)).toBe(4);
    expect(estimateJsonSize(false)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Tests — trimNodeDetail
// ---------------------------------------------------------------------------

describe('trimNodeDetail', () => {
  it('returns data unchanged when under limit', () => {
    const node = makeDetail();
    const result = trimNodeDetail(node, 100_000);

    expect(result.truncated).toBe(false);
    expect(result.data).toEqual(node);
    expect(result.message).toBeNull();
  });

  it('truncates deep tree to fit within limit', () => {
    // Create a tree with ~4 levels of 3 children each = 1 + 3 + 9 + 27 + 81 = 121 nodes
    const deepNode = makeDeepTree(4, 3);
    const originalSize = JSON.stringify(deepNode).length;

    // Set limit much smaller than original
    const result = trimNodeDetail(deepNode, Math.round(originalSize * 0.3));

    expect(result.truncated).toBe(true);
    expect(result.message).toContain('truncated');
    expect(result.final_chars).toBeLessThanOrEqual(result.original_chars);
  });

  it('adds [children hidden] marker to truncated nodes', () => {
    const deepNode = makeDeepTree(3, 2);
    const result = trimNodeDetail(deepNode, 500);

    expect(result.truncated).toBe(true);
    // At least some nodes should have the hidden marker
    const json = JSON.stringify(result.data);
    expect(json).toContain('children hidden');
  });
});

// ---------------------------------------------------------------------------
// Tests — trimNodeDetailArray
// ---------------------------------------------------------------------------

describe('trimNodeDetailArray', () => {
  it('returns array unchanged when under limit', () => {
    const nodes = [makeDetail({ node_id: '1:1' }), makeDetail({ node_id: '1:2' })];
    const result = trimNodeDetailArray(nodes, 100_000);

    expect(result.truncated).toBe(false);
    expect(result.data).toHaveLength(2);
  });

  it('reduces depth for oversized batch', () => {
    const nodes = [makeDeepTree(4, 3), makeDeepTree(4, 3)];
    const originalSize = JSON.stringify(nodes).length;

    const result = trimNodeDetailArray(nodes, Math.round(originalSize * 0.3));

    expect(result.truncated).toBe(true);
    expect(result.message).toContain('truncated');
  });

  it('truncates array length as last resort', () => {
    // Create many nodes, each moderately sized
    const nodes: NodeDetail[] = [];
    for (let i = 0; i < 50; i++) {
      nodes.push(makeDeepTree(2, 3));
    }

    // Very small limit — should truncate array itself
    const result = trimNodeDetailArray(nodes, 2000);

    expect(result.truncated).toBe(true);
    expect(result.data.length).toBeLessThan(50);
    expect(result.message).toContain('showing');
  });
});
