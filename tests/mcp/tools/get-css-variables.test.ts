/**
 * T019 — get_css_variables tool tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetCSSVariables } from '../../../src/mcp/tools/get-css-variables.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import type { CacheEntry } from '../../../src/types/mcp.js';
import type { FigmaFile, AllTokens, ParsedNode } from '../../../src/types/tokens.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

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
    typography: [],
    spacing: [{ value: 8, source: 'padding', usage_count: 3 }],
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
    nodes: [],
    tokens,
    fetched_at: Date.now(),
    ttl_ms: 30 * 60 * 1000,
  };
}

describe('handleGetCSSVariables', () => {
  let cache: TokenCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn();
  });

  it('returns valid CSS string', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const result = await handleGetCSSVariables({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(result.css).toContain(':root {');
    expect(result.css).toContain('--color-brand-primary');
    expect(result.css).toContain('--spacing-8');
    expect(result.saved).toBe(false);
  });

  it('saves CSS to file when save_to is provided', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    const outputRoot = fs.mkdtempSync(path.join(tmpdir(), 'frameproof-css-'));
    const tmpFile = path.join(outputRoot, 'design-system.css');
    process.env.FRAMEPROOF_OUTPUT_ROOT = outputRoot;
    try {
      const result = await handleGetCSSVariables(
        { file_id: 'file-1', save_to: tmpFile },
        cache,
        mockFetchFn,
      );

      expect(result.saved).toBe(true);
      expect(result.file_path).toBe(tmpFile);
      expect(fs.existsSync(tmpFile)).toBe(true);
      const content = fs.readFileSync(tmpFile, 'utf-8');
      expect(content).toContain(':root {');
    } finally {
      delete process.env.FRAMEPROOF_OUTPUT_ROOT;
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it('uses cache', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    await handleGetCSSVariables({ file_id: 'file-1' }, cache, mockFetchFn);
    await handleGetCSSVariables({ file_id: 'file-1' }, cache, mockFetchFn);

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });
});
