/**
 * T022 — export_node_image tool tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleExportNodeImage } from '../../../src/mcp/tools/export-node-image.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import type { CacheEntry } from '../../../src/types/mcp.js';
import type { FigmaFile, AllTokens, ParsedNode } from '../../../src/types/tokens.js';
import type { Node } from '@figma/rest-api-spec';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

function makeCacheEntry(fileId: string): CacheEntry {
  const rawNode = {
    id: '10:1',
    name: 'TestIcon',
    type: 'FRAME',
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
    children: [],
  } as unknown as Node;

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
    nodes: [
      { node_id: '10:1', node_type: 'FRAME', name: 'TestIcon', parent_id: null, depth: 0, raw: rawNode },
    ],
    tokens: {
      colors: [], gradients: [], typography: [], spacing: [], radii: [], shadows: [], images: [], components: [],
    },
    fetched_at: Date.now(),
    ttl_ms: 30 * 60 * 1000,
  };
}

describe('handleExportNodeImage', () => {
  let cache: TokenCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;
  let mockFetchImages: ReturnType<typeof vi.fn>;
  let mockDownloadImage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn();
    mockFetchImages = vi.fn();
    mockDownloadImage = vi.fn();
    process.env.FIGMA_TOKEN = 'test-token-for-tests';
  });

  afterEach(() => {
    delete process.env.FIGMA_TOKEN;
  });

  it('exports SVG and returns file_path', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });
    mockFetchImages.mockResolvedValue({ '10:1': 'https://example.com/image.svg' });
    mockDownloadImage.mockResolvedValue(new TextEncoder().encode('<svg></svg>').buffer);

    const outputDir = path.join(tmpdir(), `frameproof-test-${Date.now()}`);
    process.env.FRAMEPROOF_OUTPUT_ROOT = outputDir;
    try {
      const result = await handleExportNodeImage(
        { file_id: 'file-1', node_id: '10:1', format: 'svg', output_dir: outputDir },
        cache,
        mockFetchFn,
        mockFetchImages,
        mockDownloadImage,
      );

      expect(result.format).toBe('svg');
      expect(result.file_path).toContain('.svg');
      expect(path.basename(result.file_path)).toBe('testicon_10_1.svg');
      expect(result.size_bytes).toBeGreaterThan(0);
      expect(fs.existsSync(result.file_path)).toBe(true);
    } finally {
      delete process.env.FRAMEPROOF_OUTPUT_ROOT;
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true });
    }
  });

  it('creates output_dir if missing', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });
    mockFetchImages.mockResolvedValue({ '10:1': 'https://example.com/image.png' });
    mockDownloadImage.mockResolvedValue(new Uint8Array([0x89, 0x50]).buffer);

    const outputDir = path.join(tmpdir(), `frameproof-test-new-${Date.now()}`);
    process.env.FRAMEPROOF_OUTPUT_ROOT = outputDir;
    try {
      expect(fs.existsSync(outputDir)).toBe(false);

      await handleExportNodeImage(
        { file_id: 'file-1', node_id: '10:1', output_dir: outputDir },
        cache,
        mockFetchFn,
        mockFetchImages,
        mockDownloadImage,
      );

      expect(fs.existsSync(outputDir)).toBe(true);
    } finally {
      delete process.env.FRAMEPROOF_OUTPUT_ROOT;
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true });
    }
  });

  it('throws error for invalid node', async () => {
    const entry = makeCacheEntry('file-1');
    mockFetchFn.mockResolvedValue({ file: entry.file, nodes: entry.nodes, tokens: entry.tokens });

    await expect(
      handleExportNodeImage(
        { file_id: 'file-1', node_id: 'nonexistent' },
        cache,
        mockFetchFn,
        mockFetchImages,
        mockDownloadImage,
      ),
    ).rejects.toThrow(/not found/i);
  });
});
