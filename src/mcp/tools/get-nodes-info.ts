/**
 * MCP Tool: get_nodes_info
 * Batch version of get_node_info for multiple nodes.
 */

import { z } from 'zod';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { NodeDetail, NodeDetailDeduped } from '../../types/mcp.js';
import { mapNodeToDetail } from '../mappers/css-mapper.js';
import { trimNodeDetailArray, DEFAULT_MAX_CHARS } from '../utils/response-limiter.js';
import { deduplicateStylesArray } from '../utils/style-dedup.js';
import { collapseSvgGroups } from '../utils/svg-collapse.js';

export const getNodesInfoSchema = {
  file_id: z.string().describe('Figma file ID or URL'),
  node_ids: z.array(z.string()).describe('Array of node IDs'),
  depth: z.number().optional().default(3).describe('Max child depth (default: 3)'),
  max_response_chars: z
    .number()
    .optional()
    .default(DEFAULT_MAX_CHARS)
    .describe('Max response size in chars; auto-trims if exceeded'),
  deduplicate_styles: z
    .boolean()
    .optional()
    .default(false)
    .describe('Replace repeated fills/strokes/effects with hash refs to reduce size'),
};

export interface GetNodesInfoParams {
  file_id: string;
  node_ids: string[];
  depth?: number;
  max_response_chars?: number;
  deduplicate_styles?: boolean;
}

export interface GetNodesInfoResult {
  nodes: (NodeDetail | NodeDetailDeduped)[];
  total_requested: number;
  total_returned: number;
  _truncated?: boolean;
  _message?: string;
}

/**
 * Handle get_nodes_info request.
 * Maps each node ID through the same logic as get_node_info.
 * Auto-trims response if it exceeds max_response_chars.
 */
export async function handleGetNodesInfo(
  params: GetNodesInfoParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<GetNodesInfoResult> {
  if (params.node_ids.length === 0) {
    return { nodes: [], total_requested: 0, total_returned: 0 };
  }

  const entry = await cache.getOrFetch(params.file_id, fetchFn);
  const depth = params.depth ?? 3;

  const details = params.node_ids.map((nodeId) => {
    const node = entry.nodes.find((n) => n.node_id === nodeId);
    if (!node) {
      throw new Error(
        `Node "${nodeId}" not found in file "${params.file_id}". ` +
          `Use get_document_structure to discover available node IDs.`,
      );
    }
    // SVG collapse first (per T030 pipeline order)
    return collapseSvgGroups(mapNodeToDetail(node.raw, entry.tokens, depth));
  });

  const maxChars = params.max_response_chars ?? DEFAULT_MAX_CHARS;
  const trimResult = trimNodeDetailArray(details, maxChars);

  if (params.deduplicate_styles) {
    const dedupedNodes = deduplicateStylesArray(trimResult.data);
    const result: GetNodesInfoResult = {
      nodes: dedupedNodes,
      total_requested: params.node_ids.length,
      total_returned: dedupedNodes.length,
    };
    if (trimResult.truncated) {
      result._truncated = true;
      result._message = trimResult.message!;
    }
    return result;
  }

  const result: GetNodesInfoResult = {
    nodes: trimResult.data,
    total_requested: params.node_ids.length,
    total_returned: trimResult.data.length,
  };

  if (trimResult.truncated) {
    result._truncated = true;
    result._message = trimResult.message!;
  }

  return result;
}
