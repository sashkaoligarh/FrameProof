/**
 * MCP Tool: get_design_tokens
 * Extract all design tokens from a Figma file.
 */

import { z } from 'zod';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { AllTokens } from '../../types/tokens.js';

export const getDesignTokensSchema = {
  file_id: z.string().describe('Figma file ID or URL'),
  page: z.string().optional().describe('Filter by page name'),
  node_id: z.string().optional().describe('Filter by node ID'),
  force_refresh: z.boolean().optional().default(false).describe('Bypass cache'),
};

export interface GetDesignTokensParams {
  file_id: string;
  page?: string;
  node_id?: string;
  force_refresh?: boolean;
}

export interface GetDesignTokensResult extends AllTokens {
  file_name: string;
  node_count: number;
  cached: boolean;
}

/**
 * Handle get_design_tokens request.
 * Uses cache for repeated requests; supports force_refresh.
 */
export async function handleGetDesignTokens(
  params: GetDesignTokensParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<GetDesignTokensResult> {
  // Track whether this was a cache hit
  const wasCached = !params.force_refresh && cache.get(params.file_id) !== undefined;

  const entry = await cache.getOrFetch(
    params.file_id,
    fetchFn,
    params.force_refresh ?? false,
  );

  return {
    ...entry.tokens,
    file_name: entry.file.name,
    node_count: entry.nodes.length,
    cached: wasCached,
  };
}
