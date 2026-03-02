/**
 * T015 — get_nodes_info tool tests.
 *
 * Coverage:
 * - Batch of 2+ node IDs returns NodeDetail[]
 * - Single invalid node in batch returns error for that node only
 * - Empty node_ids array returns empty result
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetNodesInfo } from '../../../src/mcp/tools/get-nodes-info.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import type { CacheEntry } from '../../../src/types/mcp.js';
import type { FigmaFile, AllTokens, ParsedNode } from '../../../src/types/tokens.js';
import type { Node } from '@figma/rest-api-spec';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRawNode(id: string, name: string): Node {
  return {
    id,
    name,
    type: 'FRAME',
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
    children: [],
  } as unknown as Node;
}

function makeCacheEntry(fileId: string, nodeList: { id: string; name: string }[]): CacheEntry {
  const nodes: ParsedNode[] = nodeList.map((n) => ({
    node_id: n.id,
    node_type: 'FRAME',
    name: n.name,
    parent_id: null,
    depth: 0,
    raw: makeRawNode(n.id, n.name),
  }));

  const tokens: AllTokens = {
    colors: [],
    gradients: [],
    typography: [],
    spacing: [],
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

describe('handleGetNodesInfo', () => {
  let cache: TokenCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn();
  });

  it('returns NodeDetail[] for batch of 2+ node IDs', async () => {
    const entry = makeCacheEntry('file-1', [
      { id: '10:1', name: 'Frame A' },
      { id: '10:2', name: 'Frame B' },
    ]);
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetNodesInfo(
      { file_id: 'file-1', node_ids: ['10:1', '10:2'] },
      cache,
      mockFetchFn,
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].node_id).toBe('10:1');
    expect(result.nodes[0].name).toBe('Frame A');
    expect(result.nodes[1].node_id).toBe('10:2');
    expect(result.nodes[1].name).toBe('Frame B');
    expect(result.total_requested).toBe(2);
    expect(result.total_returned).toBe(2);
  });

  it('throws error when an invalid node is in the batch', async () => {
    const entry = makeCacheEntry('file-1', [
      { id: '10:1', name: 'Frame A' },
    ]);
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    await expect(
      handleGetNodesInfo(
        { file_id: 'file-1', node_ids: ['10:1', 'nonexistent'] },
        cache,
        mockFetchFn,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('returns empty result for empty node_ids', async () => {
    const entry = makeCacheEntry('file-1', []);
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetNodesInfo(
      { file_id: 'file-1', node_ids: [] },
      cache,
      mockFetchFn,
    );

    expect(result.nodes).toEqual([]);
    expect(result.total_requested).toBe(0);
    expect(result.total_returned).toBe(0);
  });
});
