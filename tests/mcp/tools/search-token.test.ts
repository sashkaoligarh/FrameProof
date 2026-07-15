/**
 * T031 — search_token tool tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSearchToken } from '../../../src/mcp/tools/search-token.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import { generateCSS } from '../../../src/writers/css.js';
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

  it('returns writer-declared names for sanitized collisions and duplicate radii', async () => {
    const entry = makeCacheEntry('file-collisions');
    entry.tokens.colors[0].name = 'Brand/Primary';
    entry.tokens.colors[1].name = 'Brand Primary';
    entry.tokens.radii.push({ value: 8, is_per_corner: true, usage_count: 1 });
    entry.tokens.shadows.push({
      name: 'Card/Primary"; }\nbody { color: red',
      node_id: '1:shadow',
      shadow_type: 'DROP_SHADOW',
      offset_x: 0,
      offset_y: 4,
      blur: 12,
      spread: 2,
      color_hex: '#00000033',
      color_rgba: { r: 0, g: 0, b: 0, a: 0.2 },
      css: '0px 4px 12px 2px rgba(0, 0, 0, 0.2)',
    });
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });
    const css = generateCSS(entry.tokens);

    const color = await handleSearchToken(
      { file_id: entry.file_id, query: '#2563ec', category: 'color' },
      cache,
      mockFetchFn,
    );
    const radii = await handleSearchToken(
      { file_id: entry.file_id, query: '8', category: 'radius' },
      cache,
      mockFetchFn,
    );
    const shadow = await handleSearchToken(
      { file_id: entry.file_id, query: 'Card/Primary', category: 'shadow' },
      cache,
      mockFetchFn,
    );

    expect(color.matches[0].css_variable).toBe('--color-brand-primary-2');
    expect(radii.matches.filter((match) => match.distance === 0).map(
      (match) => match.css_variable,
    )).toEqual(['--radius-8-uniform', '--radius-8-per-corner']);
    expect(shadow.matches[0].css_variable).toBe('--card-primary-body-color-red');

    for (const result of [color, radii, shadow]) {
      for (const match of result.matches) {
        expect(css).toContain(`${match.css_variable}:`);
        expect(match.css_variable).toMatch(/^--[a-z0-9]+(?:-[a-z0-9]+)*$/);
      }
    }
  });

  it('searches shadows by CSS and geometry numbers', async () => {
    const entry = makeCacheEntry('file-shadows');
    entry.tokens.shadows.push(
      {
        name: 'shadow-small',
        node_id: '1:shadow-small',
        shadow_type: 'DROP_SHADOW',
        offset_x: 0,
        offset_y: 1,
        blur: 2,
        spread: 0,
        color_hex: '#0000001a',
        color_rgba: { r: 0, g: 0, b: 0, a: 0.1 },
        css: '0px 1px 2px 0px rgba(0, 0, 0, 0.1)',
      },
      {
        name: 'shadow-large',
        node_id: '1:shadow-large',
        shadow_type: 'DROP_SHADOW',
        offset_x: 0,
        offset_y: 6,
        blur: 12,
        spread: 0,
        color_hex: '#00000033',
        color_rgba: { r: 0, g: 0, b: 0, a: 0.2 },
        css: '0px 6px 12px 0px rgba(0, 0, 0, 0.2)',
      },
    );
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const byCss = await handleSearchToken(
      { file_id: entry.file_id, query: '0px 1px 2px 0px rgba(0, 0, 0, 0.1)', category: 'shadow' },
      cache,
      mockFetchFn,
    );
    const byBlur = await handleSearchToken(
      { file_id: entry.file_id, query: '12', category: 'shadow' },
      cache,
      mockFetchFn,
    );

    expect(byCss.matches[0]).toMatchObject({
      css_variable: '--shadow-small',
      distance: 0,
    });
    expect(byBlur.matches[0]).toMatchObject({
      css_variable: '--shadow-large',
      distance: 0,
    });
  });
});
