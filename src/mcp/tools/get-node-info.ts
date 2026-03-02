/**
 * MCP Tool: get_node_info
 * Get detailed information about a specific Figma node with CSS mappings.
 */

import { z } from 'zod';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { NodeDetail } from '../../types/mcp.js';
import { mapNodeToDetail } from '../mappers/css-mapper.js';
import { trimNodeDetail, DEFAULT_MAX_CHARS } from '../utils/response-limiter.js';

export const getNodeInfoSchema = {
  file_id: z.string().describe('Figma file ID or URL'),
  node_id: z.string().describe('Target node ID'),
  depth: z.number().optional().default(5).describe('Max child depth (default: 5)'),
  max_response_chars: z
    .number()
    .optional()
    .default(DEFAULT_MAX_CHARS)
    .describe('Max response size in chars; auto-trims if exceeded'),
};

export interface GetNodeInfoParams {
  file_id: string;
  node_id: string;
  depth?: number;
  max_response_chars?: number;
}

export interface GetNodeInfoResult {
  node: NodeDetail;
  _truncated?: boolean;
  _message?: string;
}

/**
 * Handle get_node_info request.
 * Finds node by ID in cached parsed tree and maps to NodeDetail with CSS variables.
 * Auto-trims response if it exceeds max_response_chars.
 */
export async function handleGetNodeInfo(
  params: GetNodeInfoParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<GetNodeInfoResult> {
  const entry = await cache.getOrFetch(params.file_id, fetchFn);

  const node = entry.nodes.find((n) => n.node_id === params.node_id);
  if (!node) {
    throw new Error(
      `Node "${params.node_id}" not found in file "${params.file_id}". ` +
        `Use get_document_structure to discover available node IDs.`,
    );
  }

  const detail = mapNodeToDetail(node.raw, entry.tokens, params.depth ?? 5);
  const maxChars = params.max_response_chars ?? DEFAULT_MAX_CHARS;
  const trimResult = trimNodeDetail(detail, maxChars);

  if (trimResult.truncated) {
    return {
      node: trimResult.data,
      _truncated: true,
      _message: trimResult.message!,
    };
  }

  return { node: trimResult.data };
}
