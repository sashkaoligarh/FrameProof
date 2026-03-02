import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetScreenshot } from '../../../src/mcp/tools/get-screenshot.js';
import { TokenCache } from '../../../src/mcp/cache.js';
import type { AllTokens, ParsedNode, FigmaFile } from '../../../src/types/tokens.js';
import type { Node } from '@figma/rest-api-spec';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emptyTokens: AllTokens = {
  colors: [],
  gradients: [],
  typography: [],
  spacing: [],
  radii: [],
  shadows: [],
  images: [],
  components: [],
};

function makeRawNode(): Node {
  return {
    id: '1:1',
    name: 'My Frame',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
    children: [
      { id: '1:2', name: 'Header', type: 'FRAME' },
      { id: '1:3', name: 'Body', type: 'FRAME' },
    ],
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }],
    layoutMode: 'VERTICAL',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    itemSpacing: 0,
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    layoutWrap: 'NO_WRAP',
    visible: true,
  } as unknown as Node;
}

function makeNodes(): ParsedNode[] {
  const raw = makeRawNode();
  return [
    { node_id: '1:1', node_type: 'FRAME', name: 'My Frame', parent_id: null, depth: 0, raw },
  ];
}

function makeFetchResult() {
  const nodes = makeNodes();
  return {
    file: {
      file_id: 'test-file',
      name: 'Test File',
      last_modified: '2026-01-01',
      version: '1',
      document: { type: 'DOCUMENT' } as FigmaFile['document'],
      components: {},
      component_sets: {},
      styles: {},
    },
    nodes,
    tokens: emptyTokens,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleGetScreenshot', () => {
  let cache: TokenCache;
  let mockFetchFn: ReturnType<typeof vi.fn>;
  const mockFetchImages = vi.fn();
  const mockDownloadImage = vi.fn();

  beforeEach(() => {
    cache = new TokenCache();
    mockFetchFn = vi.fn().mockResolvedValue(makeFetchResult());
    vi.clearAllMocks();

    mockFetchFn.mockResolvedValue(makeFetchResult());
    mockFetchImages.mockResolvedValue({ '1:1': 'https://figma.com/render/abc' });
    mockDownloadImage.mockResolvedValue(new ArrayBuffer(1024));

    process.env.FIGMA_TOKEN = 'test-token';
  });

  it('returns correct response shape', async () => {
    const result = await handleGetScreenshot(
      { file_id: 'test-file', node_id: '1:1', output_dir: '/tmp/figma-test' },
      cache,
      mockFetchFn,
      mockFetchImages,
      mockDownloadImage,
    );

    expect(result.file_path).toMatch(/screenshot\.png$/);
    expect(result.width).toBe(375);
    expect(result.height).toBe(812);
    expect(result.file_size_bytes).toBe(1024);
    expect(result.summary).toBeDefined();
    expect(result.summary.node_name).toBe('My Frame');
    expect(result.summary.node_type).toBe('FRAME');
    expect(result.summary.child_count).toBe(2);
    expect(result.summary.has_auto_layout).toBe(true);
    expect(result.summary.layout_mode).toBe('VERTICAL');
  });

  it('throws for invalid node ID', async () => {
    await expect(
      handleGetScreenshot(
        { file_id: 'test-file', node_id: 'nonexistent' },
        cache,
        mockFetchFn,
        mockFetchImages,
        mockDownloadImage,
      ),
    ).rejects.toThrow(/not found/);
  });

  it('extracts dominant fills from node', async () => {
    const result = await handleGetScreenshot(
      { file_id: 'test-file', node_id: '1:1', output_dir: '/tmp/figma-test' },
      cache,
      mockFetchFn,
      mockFetchImages,
      mockDownloadImage,
    );

    expect(result.summary.dominant_fills).toEqual(['#ffffff']);
  });

  it('passes scale to fetchImages', async () => {
    await handleGetScreenshot(
      { file_id: 'test-file', node_id: '1:1', scale: 2, output_dir: '/tmp/figma-test' },
      cache,
      mockFetchFn,
      mockFetchImages,
      mockDownloadImage,
    );

    expect(mockFetchImages).toHaveBeenCalledWith(
      'test-file',
      'test-token',
      ['1:1'],
      { format: 'png', scale: 2 },
    );
  });
});
