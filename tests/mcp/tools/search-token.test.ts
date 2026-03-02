/**
 * T031 — search_token tool tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSearchToken } from '../../../src/mcp/tools/search-token.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import type { CacheEntry } from '../../../src/types/mcp.js';
import type { FigmaFile, AllTokens } from '../../../src/types/tokens.js';

function makeCacheEntry(fileId: string): CacheEntry {
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
        name: 'brand-secondary',
        node_id: '1:2',
        source_type: 'fill',
        value_hex: '#2563ec',
        value_rgba: { r: 37, g: 99, b: 236, a: 1 },
        opacity: 1,
        usage_count: 3,
        used_in_types: ['RECTANGLE'],
      },
      {
        name: 'error-red',
        node_id: '1:3',
        source_type: 'fill',
        value_hex: '#ff0000',
        value_rgba: { r: 255, g: 0, b: 0, a: 1 },
        opacity: 1,
        usage_count: 1,
        used_in_types: ['RECTANGLE'],
      },
    ],
    gradients: [],
    typography: [
      {
        name: 'heading-xl',
        node_id: '1:4',
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
    radii: [
      { value: 4, is_per_corner: false, usage_count: 3 },
      { value: 8, is_per_corner: false, usage_count: 2 },
    ],
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
    nodes: [],
    tokens,
    fetched_at: Date.now(),
    ttl_ms: 30 * 60 * 1000,
  };
}

describe('handleSearchToken', () => {
  let cache: TokenCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn();
  });

  it('exact color match returns distance=0', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleSearchToken(
      { file_id: 'file-1', query: '#2563eb' },
      cache,
      mockFetchFn,
    );

    expect(result.query).toBe('#2563eb');
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].distance).toBe(0);
    expect(result.matches[0].css_variable).toContain('--color-brand-primary');
  });

  it('approximate color returns closest matches', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleSearchToken(
      { file_id: 'file-1', query: '#2563ea' },
      cache,
      mockFetchFn,
    );

    expect(result.matches.length).toBeGreaterThan(0);
    // Should be sorted by distance ascending
    for (let i = 1; i < result.matches.length; i++) {
      expect(result.matches[i].distance).toBeGreaterThanOrEqual(result.matches[i - 1].distance);
    }
  });

  it('number matches spacing/radius/font-size', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleSearchToken(
      { file_id: 'file-1', query: '8' },
      cache,
      mockFetchFn,
    );

    expect(result.matches.length).toBeGreaterThan(0);
    const categories = result.matches.map((m) => m.category);
    expect(categories).toContain('spacing');
  });

  it('category filter works', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleSearchToken(
      { file_id: 'file-1', query: '8', category: 'radius' },
      cache,
      mockFetchFn,
    );

    for (const m of result.matches) {
      expect(m.category).toBe('radius');
    }
  });

  it('max 5 results', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleSearchToken(
      { file_id: 'file-1', query: '#000000' },
      cache,
      mockFetchFn,
    );

    expect(result.matches.length).toBeLessThanOrEqual(5);
  });
});
