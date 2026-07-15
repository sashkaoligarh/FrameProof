/**
 * T015 — get_nodes_info tool tests.
 *
 * Coverage:
 * - Batch of 2+ node IDs returns NodeDetail[]
 * - Single invalid node in batch returns error for that node only
 * - Empty node_ids array returns empty result
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getNodesInfoSchema, handleGetNodesInfo } from '../../../src/mcp/tools/get-nodes-info.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import type { CacheEntry } from '../../../src/types/mcp.js';
import type { FigmaFile, AllTokens, ParsedNode } from '../../../src/types/tokens.js';
import type { Node } from '@figma/rest-api-spec';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRawNode(id: string, name: string, children: Node[] = []): Node {
  return {
    id,
    name,
    type: 'FRAME',
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
    children,
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
  let outputRoot: string | undefined;

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn();
  });

  afterEach(() => {
    delete process.env.FRAMEPROOF_OUTPUT_ROOT;
    if (outputRoot) fs.rmSync(outputRoot, { recursive: true, force: true });
    outputRoot = undefined;
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

  it('returns valid nodes and per-node errors when an invalid node is in the batch', async () => {
    const entry = makeCacheEntry('file-1', [
      { id: '10:1', name: 'Frame A' },
    ]);
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetNodesInfo(
      { file_id: 'file-1', node_ids: ['10:1', 'nonexistent'] },
      cache,
      mockFetchFn,
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].node_id).toBe('10:1');
    expect(result.total_requested).toBe(2);
    expect(result.total_returned).toBe(1);
    expect(result.errors).toEqual([
      { node_id: 'nonexistent', error: expect.stringMatching(/not found.*get_document_structure/i) },
    ]);
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

  it('saves every successful full tree before trimming and reports lookup errors', async () => {
    const grandchild = makeRawNode('10:3', 'Grandchild');
    const child = makeRawNode('10:2', 'Child', [grandchild]);
    const parent = makeRawNode('10:1', 'Parent', [child]);
    const entry = makeCacheEntry('file-1', []);
    entry.nodes = [
      { node_id: '10:1', node_type: 'FRAME', name: 'Parent', parent_id: null, depth: 0, raw: parent },
      { node_id: '10:2', node_type: 'FRAME', name: 'Child', parent_id: '10:1', depth: 1, raw: child },
      { node_id: '10:3', node_type: 'FRAME', name: 'Grandchild', parent_id: '10:2', depth: 2, raw: grandchild },
    ];
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });
    outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-nodes-info-'));
    process.env.FRAMEPROOF_OUTPUT_ROOT = outputRoot;

    const savedResult = await handleGetNodesInfo(
      {
        file_id: 'file-1',
        node_ids: ['10:1', '99:99'],
        depth: 2,
        max_response_chars: 1,
        save_to: 'nodes.json',
      },
      cache,
      mockFetchFn,
    );
    const saved = JSON.parse(fs.readFileSync(savedResult.saved_to, 'utf8'));

    expect(saved).toHaveLength(1);
    expect(saved[0].children[0].children[0].node_id).toBe('10:3');
    expect(savedResult.total_returned).toBe(1);
    expect(savedResult.summaries[0].children_count).toBe(2);
    expect(savedResult.errors).toHaveLength(1);
    expect(savedResult).not.toHaveProperty('_truncated');

    const responseResult = await handleGetNodesInfo(
      { file_id: 'file-1', node_ids: ['10:1'], depth: 2, max_response_chars: 1 },
      cache,
      mockFetchFn,
    );
    expect(responseResult).toMatchObject({ _truncated: true });
    expect(responseResult.nodes).toEqual([]);
    expect(responseResult.total_returned).toBe(0);
  });

  it('bounds depth, max_response_chars, and batch length', () => {
    expect(getNodesInfoSchema.depth.safeParse(-1).success).toBe(false);
    expect(getNodesInfoSchema.depth.safeParse(1.5).success).toBe(false);
    expect(getNodesInfoSchema.depth.safeParse(Infinity).success).toBe(false);
    expect(getNodesInfoSchema.depth.safeParse(21).success).toBe(false);
    expect(getNodesInfoSchema.max_response_chars.safeParse(0).success).toBe(false);
    expect(getNodesInfoSchema.max_response_chars.safeParse(10.5).success).toBe(false);
    expect(getNodesInfoSchema.max_response_chars.safeParse(Infinity).success).toBe(false);
    expect(getNodesInfoSchema.max_response_chars.safeParse(1_000_001).success).toBe(false);
    expect(getNodesInfoSchema.node_ids.safeParse(Array.from({ length: 101 }, (_, i) => String(i))).success).toBe(false);
  });
});
