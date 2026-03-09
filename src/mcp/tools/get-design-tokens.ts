/**
 * MCP Tool: get_design_tokens
 * Extract all design tokens from a Figma file.
 * Supports save_to (write to file, return summary) and categories filter.
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { AllTokens } from '../../types/tokens.js';
import { resolveParams } from '../utils/normalize-node-id.js';

const ALL_CATEGORIES = ['colors', 'gradients', 'typography', 'spacing', 'radii', 'shadows', 'images', 'components'] as const;
type TokenCategory = (typeof ALL_CATEGORIES)[number];

export const getDesignTokensSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  page: z.string().optional().describe('Filter by page name'),
  node_id: z.string().optional().describe('Filter by node ID'),
  force_refresh: z.boolean().optional().default(false).describe('Bypass cache'),
  categories: z
    .array(z.enum(ALL_CATEGORIES))
    .optional()
    .describe(
      'Which token categories to include. Default: all except "components" and "images" (they are huge). ' +
      'Options: colors, gradients, typography, spacing, radii, shadows, images, components',
    ),
  save_to: z
    .string()
    .optional()
    .describe('Save full JSON to file and return only a compact summary. Recommended for large files.'),
};

export interface GetDesignTokensParams {
  file_id: string;
  page?: string;
  node_id?: string;
  force_refresh?: boolean;
  categories?: TokenCategory[];
  save_to?: string;
}

export interface GetDesignTokensResult {
  file_name: string;
  node_count: number;
  cached: boolean;
  colors?: AllTokens['colors'];
  gradients?: AllTokens['gradients'];
  typography?: AllTokens['typography'];
  spacing?: AllTokens['spacing'];
  radii?: AllTokens['radii'];
  shadows?: AllTokens['shadows'];
  images?: AllTokens['images'];
  components?: AllTokens['components'];
}

export interface GetDesignTokensSavedResult {
  saved_to: string;
  file_size_bytes: number;
  file_name: string;
  node_count: number;
  cached: boolean;
  token_counts: Record<string, number>;
}

/**
 * Handle get_design_tokens request.
 * Uses cache for repeated requests; supports force_refresh.
 * When save_to is set, writes full JSON to file and returns compact summary.
 * Default categories exclude 'components' and 'images' (they are huge).
 */
export async function handleGetDesignTokens(
  params: GetDesignTokensParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<GetDesignTokensResult | GetDesignTokensSavedResult> {
  const { file_id: fileId } = resolveParams(params.file_id);

  // Track whether this was a cache hit
  const wasCached = !params.force_refresh && cache.get(fileId) !== undefined;

  const entry = await cache.getOrFetch(
    fileId,
    fetchFn,
    params.force_refresh ?? false,
  );

  // Default: exclude components and images (they cause 27M+ output)
  const categories = params.categories ?? ['colors', 'gradients', 'typography', 'spacing', 'radii', 'shadows'];

  const filtered: Partial<AllTokens> = {};
  for (const cat of categories) {
    filtered[cat] = entry.tokens[cat] as never;
  }

  const meta = {
    file_name: entry.file.name,
    node_count: entry.nodes.length,
    cached: wasCached,
  };

  // If save_to is specified, write to file and return summary
  if (params.save_to) {
    const dataToSave = { ...meta, ...filtered };
    const jsonStr = JSON.stringify(dataToSave, null, 2);
    const dir = path.dirname(params.save_to);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(params.save_to, jsonStr, 'utf-8');

    const tokenCounts: Record<string, number> = {};
    for (const cat of categories) {
      tokenCounts[cat] = entry.tokens[cat].length;
    }

    return {
      saved_to: params.save_to,
      file_size_bytes: Buffer.byteLength(jsonStr, 'utf-8'),
      ...meta,
      token_counts: tokenCounts,
    };
  }

  return { ...meta, ...filtered };
}
