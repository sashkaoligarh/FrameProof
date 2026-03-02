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

export class TokenCache {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<CacheEntry>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
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
    // Return cached if valid and not force-refreshing
    if (!forceRefresh) {
      const cached = this.cache.get(fileId);
      if (cached && !this.isExpired(cached)) {
        return cached;
      }
    }

    // Deduplicate: if there's already an in-flight request, reuse it
    const existing = this.inflight.get(fileId);
    if (existing && !forceRefresh) {
      return existing;
    }

    // Create new fetch promise
    const fetchPromise = this.doFetch(fileId, fetchFn);
    this.inflight.set(fileId, fetchPromise);

    try {
      const entry = await fetchPromise;
      return entry;
    } finally {
      this.inflight.delete(fileId);
    }
  }

  /** List all cached (non-expired) file IDs. */
  listCached(): string[] {
    const result: string[] = [];
    for (const [fileId, entry] of this.cache) {
      if (!this.isExpired(entry)) {
        result.push(fileId);
      }
    }
    return result;
  }

  /** Get a cached entry without fetching. Returns undefined if not cached or expired. */
  get(fileId: string): CacheEntry | undefined {
    const entry = this.cache.get(fileId);
    if (entry && !this.isExpired(entry)) {
      return entry;
    }
    return undefined;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.fetched_at > entry.ttl_ms;
  }

  private async doFetch(
    fileId: string,
    fetchFn: FetchCallback,
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
    this.cache.set(fileId, entry);
    return entry;
  }
}
