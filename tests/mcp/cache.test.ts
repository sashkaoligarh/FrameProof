/**
 * T005 — TokenCache tests.
 *
 * Coverage:
 * - TTL expiry: cached entry expires after ttl_ms
 * - force_refresh: bypasses TTL check and re-fetches
 * - Dedup of parallel requests: single in-flight fetch for same file_id
 * - Cache miss: triggers fetch callback
 * - Cache hit: returns cached data without calling fetch
 * - listCached: returns all cached file IDs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenCache } from '../../src/mcp/cache.js';
import type { FigmaFile, ParsedNode, AllTokens } from '../../src/types/tokens.js';
import type { CacheEntry } from '../../src/types/mcp.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFigmaFile(name: string): FigmaFile {
  return {
    file_id: 'test-file',
    name,
    last_modified: '2026-01-01T00:00:00Z',
    version: '1',
    document: { type: 'DOCUMENT' } as FigmaFile['document'],
    components: {},
    component_sets: {},
    styles: {},
  };
}

const emptyNodes: ParsedNode[] = [];

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

interface FetchResult {
  file: FigmaFile;
  nodes: ParsedNode[];
  tokens: AllTokens;
}

function makeFetchResult(name = 'Test File'): FetchResult {
  return {
    file: makeFigmaFile(name),
    nodes: emptyNodes,
    tokens: emptyTokens,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenCache', () => {
  let cache: TokenCache;

  beforeEach(() => {
    cache = new TokenCache();
    vi.restoreAllMocks();
  });

  describe('cache miss triggers fetch', () => {
    it('calls fetch callback on first access', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeFetchResult());

      const entry = await cache.getOrFetch('file-1', fetchFn);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith('file-1');
      expect(entry.file_id).toBe('file-1');
      expect(entry.file.name).toBe('Test File');
    });
  });

  describe('cache hit returns cached data', () => {
    it('does not call fetch on second access', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeFetchResult());

      await cache.getOrFetch('file-1', fetchFn);
      const entry = await cache.getOrFetch('file-1', fetchFn);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(entry.file.name).toBe('Test File');
    });
  });

  describe('TTL expiry', () => {
    it('re-fetches after TTL expires', async () => {
      const shortTtlCache = new TokenCache(50); // 50ms TTL
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(makeFetchResult('First'))
        .mockResolvedValueOnce(makeFetchResult('Second'));

      const first = await shortTtlCache.getOrFetch('file-1', fetchFn);
      expect(first.file.name).toBe('First');

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 60));

      const second = await shortTtlCache.getOrFetch('file-1', fetchFn);
      expect(second.file.name).toBe('Second');
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('returns cached entry before TTL expires', async () => {
      const longTtlCache = new TokenCache(10_000); // 10s TTL
      const fetchFn = vi.fn().mockResolvedValue(makeFetchResult());

      await longTtlCache.getOrFetch('file-1', fetchFn);
      await longTtlCache.getOrFetch('file-1', fetchFn);

      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('force_refresh bypasses cache', () => {
    it('re-fetches even when cache is valid', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(makeFetchResult('Cached'))
        .mockResolvedValueOnce(makeFetchResult('Refreshed'));

      await cache.getOrFetch('file-1', fetchFn);
      const entry = await cache.getOrFetch('file-1', fetchFn, true);

      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(entry.file.name).toBe('Refreshed');
    });
  });

  describe('dedup of parallel requests', () => {
    it('only calls fetch once for concurrent requests to same file_id', async () => {
      let resolveOuter: (value: FetchResult) => void;
      const fetchFn = vi.fn().mockReturnValue(
        new Promise<FetchResult>((resolve) => {
          resolveOuter = resolve;
        }),
      );

      // Launch two concurrent requests
      const p1 = cache.getOrFetch('file-1', fetchFn);
      const p2 = cache.getOrFetch('file-1', fetchFn);

      // Resolve the single fetch
      resolveOuter!(makeFetchResult());

      const [entry1, entry2] = await Promise.all([p1, p2]);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(entry1).toBe(entry2);
    });

    it('does not dedup requests for different file_ids', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeFetchResult());

      await Promise.all([
        cache.getOrFetch('file-1', fetchFn),
        cache.getOrFetch('file-2', fetchFn),
      ]);

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('listCached', () => {
    it('returns empty array when nothing is cached', () => {
      expect(cache.listCached()).toEqual([]);
    });

    it('returns file IDs of cached entries', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeFetchResult());

      await cache.getOrFetch('file-1', fetchFn);
      await cache.getOrFetch('file-2', fetchFn);

      const list = cache.listCached();
      expect(list).toContain('file-1');
      expect(list).toContain('file-2');
      expect(list).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('propagates fetch errors', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('API error'));

      await expect(cache.getOrFetch('file-1', fetchFn)).rejects.toThrow('API error');
    });

    it('allows retry after fetch error', async () => {
      const fetchFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(makeFetchResult());

      await expect(cache.getOrFetch('file-1', fetchFn)).rejects.toThrow('Temporary error');

      const entry = await cache.getOrFetch('file-1', fetchFn);
      expect(entry.file.name).toBe('Test File');
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });
});
