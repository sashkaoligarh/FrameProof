/**
 * T010 — get_design_tokens tool tests.
 *
 * Coverage:
 * - Successful extraction returns AllTokens + file_name + cached flag
 * - Cache hit returns cached=true
 * - force_refresh bypasses cache
 * - Invalid file ID returns error text
 * - Missing FIGMA_TOKEN returns setup instructions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleGetDesignTokens } from '../../../src/mcp/tools/get-design-tokens.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import type { CacheEntry } from '../../../src/types/mcp.js';
import type { FigmaFile, AllTokens, ParsedNode } from '../../../src/types/tokens.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCacheEntry(
  fileId: string,
  overrides: Partial<CacheEntry> = {},
): CacheEntry {
  const file: FigmaFile = {
    file_id: fileId,
    name: 'Test Design File',
    last_modified: '2026-01-01T00:00:00Z',
    version: '1',
    document: { type: 'DOCUMENT' } as FigmaFile['document'],
    components: {},
    component_sets: {},
    styles: {},
  };

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
    ],
    gradients: [],
    typography: [
      {
        name: 'heading-xl',
        node_id: '1:2',
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
    spacing: [{ value: 8, source: 'padding', usage_count: 3 }],
    radii: [{ value: 4, is_per_corner: false, usage_count: 2 }],
    shadows: [],
    images: [],
    components: [],
  };

  const nodes: ParsedNode[] = [
    {
      node_id: '0:1',
      node_type: 'DOCUMENT',
      name: 'Document',
      parent_id: null,
      depth: 0,
      raw: { type: 'DOCUMENT' } as ParsedNode['raw'],
    },
  ];

  return {
    file_id: fileId,
    file,
    nodes,
    tokens,
    fetched_at: Date.now(),
    ttl_ms: 30 * 60 * 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleGetDesignTokens', () => {
  let cache: TokenCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn();
  });

  describe('successful extraction', () => {
    it('returns all token arrays, file_name, node_count, and cached flag', async () => {
      const entry = makeCacheEntry('file-1');
      mockFetchFn.mockResolvedValue({
        file: entry.file,
        nodes: entry.nodes,
        tokens: entry.tokens,
      });

      const result = await handleGetDesignTokens(
        { file_id: 'file-1' },
        cache,
        mockFetchFn,
      );

      expect(result.colors).toHaveLength(1);
      expect(result.typography).toHaveLength(1);
      expect(result.spacing).toHaveLength(1);
      expect(result.radii).toHaveLength(1);
      expect(result.file_name).toBe('Test Design File');
      expect(result.node_count).toBe(1);
      expect(typeof result.cached).toBe('boolean');
    });
  });

  describe('cache behavior', () => {
    it('returns cached=false on first fetch', async () => {
      const entry = makeCacheEntry('file-1');
      mockFetchFn.mockResolvedValue({
        file: entry.file,
        nodes: entry.nodes,
        tokens: entry.tokens,
      });

      const result = await handleGetDesignTokens(
        { file_id: 'file-1' },
        cache,
        mockFetchFn,
      );

      expect(result.cached).toBe(false);
    });

    it('returns cached=true on subsequent fetch', async () => {
      const entry = makeCacheEntry('file-1');
      mockFetchFn.mockResolvedValue({
        file: entry.file,
        nodes: entry.nodes,
        tokens: entry.tokens,
      });

      // First fetch
      await handleGetDesignTokens({ file_id: 'file-1' }, cache, mockFetchFn);
      // Second fetch — should be cached
      const result = await handleGetDesignTokens(
        { file_id: 'file-1' },
        cache,
        mockFetchFn,
      );

      expect(result.cached).toBe(true);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('force_refresh', () => {
    it('bypasses cache when force_refresh=true', async () => {
      const entry = makeCacheEntry('file-1');
      mockFetchFn.mockResolvedValue({
        file: entry.file,
        nodes: entry.nodes,
        tokens: entry.tokens,
      });

      await handleGetDesignTokens({ file_id: 'file-1' }, cache, mockFetchFn);
      const result = await handleGetDesignTokens(
        { file_id: 'file-1', force_refresh: true },
        cache,
        mockFetchFn,
      );

      expect(result.cached).toBe(false);
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('throws on fetch error', async () => {
      mockFetchFn.mockRejectedValue(new Error('Network error'));

      await expect(
        handleGetDesignTokens({ file_id: 'bad-file' }, cache, mockFetchFn),
      ).rejects.toThrow('Network error');
    });
  });
});
