/**
 * In-memory cache for parsed Figma files.
 * Map<string, CacheEntry> with configurable TTL and request deduplication.
 */

import type { FigmaFile, ParsedNode, AllTokens } from '../types/tokens.js';
import type { CacheEntry } from '../types/mcp.js';

export interface FetchResult {
  file: FigmaFile;
  nodes: ParsedNode[];
  tokens: AllTokens;
}

export type FetchCallback = (fileId: string) => Promise<FetchResult>;

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_SIZE = 50;

export interface TokenCacheOptions {
  ttlMs?: number;
  maxSize?: number;
}

interface InflightEntry {
  generation: number;
  promise: Promise<CacheEntry>;
}

export class TokenCache {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, InflightEntry>();
  private activeGenerations = new Map<string, number>();
  private nextGeneration = 0;
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(options: number | TokenCacheOptions = {}) {
    const ttlMs = typeof options === 'number'
      ? options
      : (options.ttlMs ?? DEFAULT_TTL_MS);
    const maxSize = typeof options === 'number'
      ? DEFAULT_MAX_SIZE
      : (options.maxSize ?? DEFAULT_MAX_SIZE);

    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new RangeError('TokenCache ttlMs must be a non-negative finite number.');
    }
    if (!Number.isInteger(maxSize) || maxSize <= 0) {
      throw new RangeError('TokenCache maxSize must be a positive integer.');
    }

    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  /**
   * Get a cached entry or fetch it. Deduplicates concurrent requests
   * to the same file_id into a single in-flight fetch.
   */
  async getOrFetch(
    fileId: string,
    fetchFn: FetchCallback,
    forceRefresh = false,
  ): Promise<CacheEntry> {
    if (!forceRefresh) {
      const cached = this.get(fileId);
      if (cached) return cached;
    }

    const existing = this.inflight.get(fileId);
    if (existing && !forceRefresh) {
      return existing.promise;
    }

    const generation = ++this.nextGeneration;
    this.activeGenerations.set(fileId, generation);
    const fetchPromise = this.doFetch(fileId, fetchFn, generation);
    this.inflight.set(fileId, { generation, promise: fetchPromise });

    try {
      return await fetchPromise;
    } finally {
      if (this.inflight.get(fileId)?.generation === generation) {
        this.inflight.delete(fileId);
      }
      if (this.activeGenerations.get(fileId) === generation && !this.cache.has(fileId)) {
        this.activeGenerations.delete(fileId);
      }
    }
  }

  /** List all cached (non-expired) file IDs. */
  listCached(): string[] {
    const result: string[] = [];
    for (const [fileId, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.deleteCached(fileId);
      } else {
        result.push(fileId);
      }
    }
    return result;
  }

  /** Get a cached entry without fetching. Returns undefined if not cached or expired. */
  get(fileId: string): CacheEntry | undefined {
    const entry = this.cache.get(fileId);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.deleteCached(fileId);
      return undefined;
    }

    // Map insertion order is the LRU order; move hits to the newest position.
    this.cache.delete(fileId);
    this.cache.set(fileId, entry);
    return entry;
  }

  /** Remove one cached value and supersede any in-flight fetch for it. */
  invalidate(fileId: string): boolean {
    const existed = this.cache.delete(fileId) || this.inflight.has(fileId);
    this.inflight.delete(fileId);
    this.activeGenerations.delete(fileId);
    return existed;
  }

  /** Remove all cached values and prevent current in-flight fetches from storing results. */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
    this.activeGenerations.clear();
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.fetched_at >= entry.ttl_ms;
  }

  private async doFetch(
    fileId: string,
    fetchFn: FetchCallback,
    generation: number,
  ): Promise<CacheEntry> {
    const result = await fetchFn(fileId);
    const entry: CacheEntry = {
      file_id: fileId,
      file: result.file,
      nodes: result.nodes,
      tokens: result.tokens,
      fetched_at: Date.now(),
      ttl_ms: this.ttlMs,
    };

    if (this.activeGenerations.get(fileId) !== generation) {
      return entry;
    }

    this.cache.delete(fileId);
    this.cache.set(fileId, entry);
    this.evictOverflow();
    return entry;
  }

  private evictOverflow(): void {
    while (this.cache.size > this.maxSize) {
      const oldestFileId = this.cache.keys().next().value as string | undefined;
      if (oldestFileId === undefined) return;
      this.deleteCached(oldestFileId);
    }
  }

  private deleteCached(fileId: string): void {
    this.cache.delete(fileId);
    if (!this.inflight.has(fileId)) {
      this.activeGenerations.delete(fileId);
    }
  }
}
