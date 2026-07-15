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

    it('deletes expired entries during direct access and listing', async () => {
      let now = 1_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const shortTtlCache = new TokenCache({ ttlMs: 10, maxSize: 2 });
      const fetchFn = vi.fn().mockResolvedValue(makeFetchResult());

      await shortTtlCache.getOrFetch('file-1', fetchFn);
      now += 10;

      expect(shortTtlCache.get('file-1')).toBeUndefined();
      expect(shortTtlCache.listCached()).toEqual([]);
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

    it('preserves a still-valid entry when the refresh fails', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(makeFetchResult('Cached'))
        .mockRejectedValueOnce(new Error('Refresh failed'));

      const cached = await cache.getOrFetch('file-1', fetchFn);
      await expect(cache.getOrFetch('file-1', fetchFn, true)).rejects.toThrow('Refresh failed');

      expect(cache.get('file-1')).toBe(cached);
      expect(await cache.getOrFetch('file-1', fetchFn)).toBe(cached);
      expect(fetchFn).toHaveBeenCalledTimes(2);
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

  describe('bounded LRU eviction', () => {
    it('evicts the least recently used entry at max size', async () => {
      const boundedCache = new TokenCache({ maxSize: 2 });
      const fetchFn = vi.fn((fileId: string) => Promise.resolve(makeFetchResult(fileId)));

      await boundedCache.getOrFetch('file-1', fetchFn);
      await boundedCache.getOrFetch('file-2', fetchFn);
      expect(boundedCache.get('file-1')).toBeDefined();
      await boundedCache.getOrFetch('file-3', fetchFn);

      expect(boundedCache.get('file-1')).toBeDefined();
      expect(boundedCache.get('file-2')).toBeUndefined();
      expect(boundedCache.get('file-3')).toBeDefined();
    });
  });

  describe('invalidation', () => {
    it('supports explicit invalidate and clear', async () => {
      const fetchFn = vi.fn().mockResolvedValue(makeFetchResult());
      await cache.getOrFetch('file-1', fetchFn);
      await cache.getOrFetch('file-2', fetchFn);

      expect(cache.invalidate('file-1')).toBe(true);
      expect(cache.get('file-1')).toBeUndefined();
      cache.clear();
      expect(cache.listCached()).toEqual([]);
    });

    it('does not cache a fetch invalidated while in flight', async () => {
      let resolveFetch: (value: FetchResult) => void;
      const fetchFn = vi.fn().mockReturnValue(new Promise<FetchResult>((resolve) => {
        resolveFetch = resolve;
      }));

      const pending = cache.getOrFetch('file-1', fetchFn);
      cache.invalidate('file-1');
      resolveFetch!(makeFetchResult('Stale'));
      await pending;

      expect(cache.get('file-1')).toBeUndefined();
    });
  });

  describe('force-refresh races', () => {
    it('prevents an older request from replacing a forced refresh', async () => {
      let resolveOld: (value: FetchResult) => void;
      let resolveRefresh: (value: FetchResult) => void;
      const fetchFn = vi
        .fn()
        .mockReturnValueOnce(new Promise<FetchResult>((resolve) => {
          resolveOld = resolve;
        }))
        .mockReturnValueOnce(new Promise<FetchResult>((resolve) => {
          resolveRefresh = resolve;
        }));

      const oldRequest = cache.getOrFetch('file-1', fetchFn);
      const refreshRequest = cache.getOrFetch('file-1', fetchFn, true);
      resolveRefresh!(makeFetchResult('Fresh'));
      await refreshRequest;
      resolveOld!(makeFetchResult('Stale'));
      await oldRequest;

      expect(cache.get('file-1')?.file.name).toBe('Fresh');
    });

    it('does not let an older refresh replace cached data after a newer refresh fails', async () => {
      const seed = vi.fn().mockResolvedValue(makeFetchResult('Cached'));
      const cached = await cache.getOrFetch('file-1', seed);
      let resolveOlderRefresh: (value: FetchResult) => void;
      const olderRefresh = vi.fn().mockReturnValue(new Promise<FetchResult>((resolve) => {
        resolveOlderRefresh = resolve;
      }));

      const olderRequest = cache.getOrFetch('file-1', olderRefresh, true);
      await expect(
        cache.getOrFetch('file-1', vi.fn().mockRejectedValue(new Error('Newer failed')), true),
      ).rejects.toThrow('Newer failed');
      resolveOlderRefresh!(makeFetchResult('Superseded'));
      await olderRequest;

      expect(cache.get('file-1')).toBe(cached);
      expect(cache.get('file-1')?.file.name).toBe('Cached');
    });

    it('keeps deduplicating against the newer refresh after the old request settles', async () => {
      let resolveOld: (value: FetchResult) => void;
      let resolveRefresh: (value: FetchResult) => void;
      const fetchFn = vi
        .fn()
        .mockReturnValueOnce(new Promise<FetchResult>((resolve) => {
          resolveOld = resolve;
        }))
        .mockReturnValueOnce(new Promise<FetchResult>((resolve) => {
          resolveRefresh = resolve;
        }));

      const oldRequest = cache.getOrFetch('file-1', fetchFn);
      const refreshRequest = cache.getOrFetch('file-1', fetchFn, true);
      resolveOld!(makeFetchResult('Stale'));
      await oldRequest;
      const deduplicated = cache.getOrFetch('file-1', fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      resolveRefresh!(makeFetchResult('Fresh'));

      const [fresh, sameFresh] = await Promise.all([refreshRequest, deduplicated]);
      expect(sameFresh).toBe(fresh);
      expect(cache.get('file-1')?.file.name).toBe('Fresh');
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
