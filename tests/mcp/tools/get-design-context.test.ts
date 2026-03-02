/**
 * T028 — get_design_context tool tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetDesignContext } from '../../../src/mcp/tools/get-design-context.js';
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

  return {
    file_id: fileId,
    file: {
      file_id: fileId,
      name: 'Test Design',
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

describe('handleGetDesignContext', () => {
  let cache: TokenCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn();
  });

  it('returns markdown with color table', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetDesignContext({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(result).toContain('brand-primary');
    expect(result).toContain('#2563eb');
  });

  it('returns markdown with spacing list', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetDesignContext({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(result).toContain('--spacing-8');
  });

  it('returns markdown with typography', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetDesignContext({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(result).toContain('Inter');
    expect(result).toContain('32');
  });

  it('returns markdown with usage rules', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetDesignContext({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(result).toContain('var(');
  });

  it('uses cache', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    await handleGetDesignContext({ file_id: 'file-1' }, cache, mockFetchFn);
    await handleGetDesignContext({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });
});
