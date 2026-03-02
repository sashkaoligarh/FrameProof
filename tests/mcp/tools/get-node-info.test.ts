/**
 * T014 — get_node_info tool tests.
 *
 * Coverage:
 * - Frame node returns dimensions + layout + fills with css_variable
 * - TEXT node returns typography with css mappings
 * - Depth limiting works
 * - Nonexistent node returns error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetNodeInfo } from '../../../src/mcp/tools/get-node-info.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import type { CacheEntry } from '../../../src/types/mcp.js';
import type { FigmaFile, AllTokens, ParsedNode } from '../../../src/types/tokens.js';
import type { Node } from '@figma/rest-api-spec';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRawNode(overrides: Record<string, unknown> = {}): Node {
  return {
    id: '10:1',
    name: 'TestFrame',
    type: 'FRAME',
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
    children: [],
    fills: [
      { type: 'SOLID', color: { r: 37 / 255, g: 99 / 255, b: 235 / 255, a: 1 }, visible: true },
    ],
    layoutMode: 'HORIZONTAL',
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    itemSpacing: 8,
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    layoutWrap: 'NO_WRAP',
    ...overrides,
  } as unknown as Node;
}

function makeTextNode(): Node {
  return {
    id: '10:2',
    name: 'TextNode',
    type: 'TEXT',
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
    characters: 'Hello World',
    style: {
      fontFamily: 'Inter',
      fontSize: 32,
      fontWeight: 700,
      lineHeightPx: 40,
      letterSpacing: -0.5,
      textAlignHorizontal: 'LEFT',
      textCase: 'ORIGINAL',
      textDecoration: 'NONE',
    },
    fills: [
      { type: 'SOLID', color: { r: 17 / 255, g: 24 / 255, b: 39 / 255, a: 1 }, visible: true },
    ],
    children: [],
  } as unknown as Node;
}

function makeCacheEntry(fileId: string, nodes: ParsedNode[]): CacheEntry {
  const tokens: AllTokens = {
    colors: [
      {
        name: 'brand-primary',
        node_id: '1:1',
        source_type: 'fill',
        value_hex: '#2563eb',
        value_rgba: { r: 37, g: 99, b: 235, a: 1 },
        opacity: 1,
        usage_count: 5,
        used_in_types: ['RECTANGLE'],
      },
      {
        name: 'text-dark',
        node_id: '1:2',
        source_type: 'fill',
        value_hex: '#111827',
        value_rgba: { r: 17, g: 24, b: 39, a: 1 },
        opacity: 1,
        usage_count: 3,
        used_in_types: ['TEXT'],
      },
    ],
    gradients: [],
    typography: [
      {
        name: 'heading-xl',
        node_id: '1:3',
        font_family: 'Inter',
        font_size: 32,
        font_weight: 700,
        font_style: 'normal',
        line_height: '40px',
        line_height_px: 40,
        letter_spacing: -0.5,
        text_align_horizontal: 'LEFT',
        text_case: 'ORIGINAL',
        text_decoration: 'NONE',
        sample_text: 'Heading',
        usage_count: 2,
      },
    ],
    spacing: [
      { value: 8, source: 'padding', usage_count: 4 },
      { value: 16, source: 'padding', usage_count: 3 },
    ],
    radii: [],
    shadows: [],
    images: [],
    components: [],
  };

  return {
    file_id: fileId,
    file: {
      file_id: fileId,
      name: 'Test File',
      last_modified: '2026-01-01',
      version: '1',
      document: { type: 'DOCUMENT' } as FigmaFile['document'],
      components: {},
      component_sets: {},
      styles: {},
    },
    nodes,
    tokens,
    fetched_at: Date.now(),
    ttl_ms: 30 * 60 * 1000,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleGetNodeInfo', () => {
  let cache: TokenCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn();
  });

  it('returns frame node with dimensions, layout, and fills with css_variable', async () => {
    const rawNode = makeRawNode();
    const nodes: ParsedNode[] = [
      { node_id: '10:1', node_type: 'FRAME', name: 'TestFrame', parent_id: null, depth: 0, raw: rawNode },
    ];
    const entry = makeCacheEntry('file-1', nodes);
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetNodeInfo(
      { file_id: 'file-1', node_id: '10:1' },
      cache,
      mockFetchFn,
    );

    expect(result.node.node_id).toBe('10:1');
    expect(result.node.width).toBe(200);
    expect(result.node.height).toBe(100);
    expect(result.node.fills).toHaveLength(1);
    expect(result.node.fills[0].css_variable).toBe('var(--color-brand-primary)');
    expect(result.node.layout).not.toBeNull();
    expect(result.node.layout!.mode).toBe('HORIZONTAL');
    expect(result.node.layout!.item_spacing_css).toBe('var(--spacing-8)');
  });

  it('returns TEXT node with typography and css mappings', async () => {
    const rawNode = makeTextNode();
    const nodes: ParsedNode[] = [
      { node_id: '10:2', node_type: 'TEXT', name: 'TextNode', parent_id: null, depth: 0, raw: rawNode },
    ];
    const entry = makeCacheEntry('file-1', nodes);
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetNodeInfo(
      { file_id: 'file-1', node_id: '10:2' },
      cache,
      mockFetchFn,
    );

    expect(result.node.typography).not.toBeNull();
    expect(result.node.typography!.font_family_css).toBe('var(--font-family-inter)');
    expect(result.node.typography!.font_size_css).toBe('var(--font-size-32)');
    expect(result.node.typography!.color_css).toBe('var(--color-text-dark)');
    expect(result.node.text_content).toBe('Hello World');
  });

  it('respects depth parameter', async () => {
    const childNode = makeRawNode({ id: '10:3', name: 'Child', children: [] });
    const parentNode = makeRawNode({
      id: '10:1',
      children: [childNode],
    });
    const nodes: ParsedNode[] = [
      { node_id: '10:1', node_type: 'FRAME', name: 'Parent', parent_id: null, depth: 0, raw: parentNode },
      { node_id: '10:3', node_type: 'FRAME', name: 'Child', parent_id: '10:1', depth: 1, raw: childNode },
    ];
    const entry = makeCacheEntry('file-1', nodes);
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    // Depth 0 should return no children
    const result = await handleGetNodeInfo(
      { file_id: 'file-1', node_id: '10:1', depth: 0 },
      cache,
      mockFetchFn,
    );

    expect(result.node.children).toHaveLength(0);
  });

  it('throws error for nonexistent node', async () => {
    const nodes: ParsedNode[] = [
      { node_id: '10:1', node_type: 'FRAME', name: 'TestFrame', parent_id: null, depth: 0, raw: makeRawNode() },
    ];
    const entry = makeCacheEntry('file-1', nodes);
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    await expect(
      handleGetNodeInfo(
        { file_id: 'file-1', node_id: 'nonexistent' },
        cache,
        mockFetchFn,
      ),
    ).rejects.toThrow(/not found/i);
  });
});
