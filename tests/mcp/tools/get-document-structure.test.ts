/**
 * T025 — get_document_structure tool tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetDocumentStructure } from '../../../src/mcp/tools/get-document-structure.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import type { CacheEntry } from '../../../src/types/mcp.js';
import type { FigmaFile, ParsedNode } from '../../../src/types/tokens.js';
import type { Node } from '@figma/rest-api-spec';

function makeCacheEntry(fileId: string): CacheEntry {
  const doc = {
    type: 'DOCUMENT',
    id: '0:0',
    name: 'Document',
    children: [
      {
        type: 'CANVAS',
        id: '1:1',
        name: 'Page 1',
        children: [
          {
            type: 'FRAME',
            id: '2:1',
            name: 'Hero Section',
            absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 800 },
            children: [],
          },
          {
            type: 'FRAME',
            id: '2:2',
            name: 'Footer',
            absoluteBoundingBox: { x: 0, y: 800, width: 1440, height: 200 },
            children: [],
          },
        ],
      },
    ],
  } as unknown as Node;

  return {
    file_id: fileId,
    file: {
      file_id: fileId,
      name: 'Design System',
      last_modified: '2026-01-01',
      version: '1',
      document: doc,
      components: { 'c:1': { key: 'k1', name: 'Button', description: '' } },
      component_sets: { 'cs:1': { key: 'ks1', name: 'ButtonSet', description: '' } },
      styles: {},
    },
    nodes: [],
    tokens: {
      colors: [], gradients: [], typography: [], spacing: [], radii: [], shadows: [], images: [], components: [],
    },
    fetched_at: Date.now(),
    ttl_ms: 30 * 60 * 1000,
  };
}

describe('handleGetDocumentStructure', () => {
  let cache: TokenCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn();
  });

  it('returns pages with top frames', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetDocumentStructure({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(result.file_id).toBe('file-1');
    expect(result.file_name).toBe('Design System');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].name).toBe('Page 1');
    expect(result.pages[0].top_frames).toHaveLength(2);
    expect(result.pages[0].top_frames[0].name).toBe('Hero Section');
    expect(result.pages[0].top_frames[0].width).toBe(1440);
  });

  it('includes component counts', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetDocumentStructure({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(result.component_count).toBe(1);
    expect(result.component_set_count).toBe(1);
  });

  it('uses cache', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    await handleGetDocumentStructure({ file_id: 'file-1' }, cache, mockFetchFn);
    await handleGetDocumentStructure({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });
});
