/**
 * MCP Tool: get_nodes_info
 * Batch version of get_node_info for multiple nodes.
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { NodeDetail, NodeDetailDeduped } from '../../types/mcp.js';
import { mapNodeToDetail } from '../mappers/css-mapper.js';
import { trimNodeDetailArray, DEFAULT_MAX_CHARS } from '../utils/response-limiter.js';
import { deduplicateStylesArray } from '../utils/style-dedup.js';
import { collapseSvgGroups } from '../utils/svg-collapse.js';
import { buildNodeSummary, type NodeSummary } from '../utils/node-summary.js';
import { normalizeNodeId, resolveParams } from '../utils/normalize-node-id.js';

export const getNodesInfoSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
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
  save_to: z
    .string()
    .optional()
    .describe('Save full JSON to this file path and return only summaries. Use this for large responses to avoid filling context window.'),
};

export interface GetNodesInfoParams {
  file_id: string;
  node_ids: string[];
  depth?: number;
  max_response_chars?: number;
  deduplicate_styles?: boolean;
  save_to?: string;
}

export interface GetNodesInfoResult {
  nodes: (NodeDetail | NodeDetailDeduped)[];
  total_requested: number;
  total_returned: number;
  _truncated?: boolean;
  _message?: string;
}

export interface GetNodesInfoSavedResult {
  saved_to: string;
  file_size_bytes: number;
  total_requested: number;
  total_returned: number;
  summaries: NodeSummary[];
  _truncated?: boolean;
}

/**
 * Handle get_nodes_info request.
 * Maps each node ID through the same logic as get_node_info.
 * Auto-trims response if it exceeds max_response_chars.
 * When save_to is set, writes full JSON to file and returns summaries only.
 */
export async function handleGetNodesInfo(
  params: GetNodesInfoParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<GetNodesInfoResult | GetNodesInfoSavedResult> {
  if (params.node_ids.length === 0) {
    return { nodes: [], total_requested: 0, total_returned: 0 };
  }

  const { file_id: fileId } = resolveParams(params.file_id);
  const entry = await cache.getOrFetch(fileId, fetchFn);
  const depth = params.depth ?? 3;

  const fileCtx = { styles: entry.file.styles, components: entry.file.components };

  const details = params.node_ids.map((rawId) => {
    const nodeId = normalizeNodeId(rawId);
    const node = entry.nodes.find((n) => n.node_id === nodeId);
    if (!node) {
      throw new Error(
        `Node "${nodeId}" not found in file "${fileId}". ` +
          `Use get_document_structure to discover available node IDs.`,
      );
    }
    // SVG collapse first (per T030 pipeline order)
    return collapseSvgGroups(mapNodeToDetail(node.raw, entry.tokens, depth, fileCtx));
  });

  const maxChars = params.max_response_chars ?? DEFAULT_MAX_CHARS;
  const trimResult = trimNodeDetailArray(details, maxChars);

  // If save_to is specified, write full data to file and return summaries
  if (params.save_to) {
    let dataToSave: (NodeDetail | NodeDetailDeduped)[];
    if (params.deduplicate_styles) {
      dataToSave = deduplicateStylesArray(trimResult.data);
    } else {
      dataToSave = trimResult.data;
    }

    const jsonStr = JSON.stringify(dataToSave, null, 2);
    const dir = path.dirname(params.save_to);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(params.save_to, jsonStr, 'utf-8');

    const result: GetNodesInfoSavedResult = {
      saved_to: params.save_to,
      file_size_bytes: Buffer.byteLength(jsonStr, 'utf-8'),
      total_requested: params.node_ids.length,
      total_returned: trimResult.data.length,
      summaries: details.map((d) => buildNodeSummary(d)),
    };
    if (trimResult.truncated) {
      result._truncated = true;
    }
    return result;
  }

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
