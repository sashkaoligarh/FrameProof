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
import { buildNodeSummary, type NodeSummary } from '../utils/node-summary.js';
import { normalizeNodeId, resolveParams } from '../utils/normalize-node-id.js';
import { atomicWriteOutputFile } from '../utils/output-path.js';

const MAX_DEPTH = 20;
const MAX_RESPONSE_CHARS = 1_000_000;
const MAX_NODE_IDS = 100;

export const getNodesInfoSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  node_ids: z.array(z.string()).max(MAX_NODE_IDS).describe(`Array of node IDs (max ${MAX_NODE_IDS})`),
  depth: z.number().finite().int().min(0).max(MAX_DEPTH).optional().default(3).describe(`Max child depth (0-${MAX_DEPTH}, default: 3)`),
  max_response_chars: z
    .number()
    .finite()
    .int()
    .min(1)
    .max(MAX_RESPONSE_CHARS)
    .optional()
    .default(DEFAULT_MAX_CHARS)
    .describe(`Max response size in chars (1-${MAX_RESPONSE_CHARS}); auto-trims if exceeded`),
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
  errors?: GetNodesInfoError[];
  _truncated?: boolean;
  _message?: string;
}

export interface GetNodesInfoSavedResult {
  saved_to: string;
  file_size_bytes: number;
  total_requested: number;
  total_returned: number;
  summaries: NodeSummary[];
  errors?: GetNodesInfoError[];
}

export interface GetNodesInfoError {
  node_id: string;
  error: string;
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

  const details: NodeDetail[] = [];
  const errors: GetNodesInfoError[] = [];
  for (const rawId of params.node_ids) {
    const nodeId = normalizeNodeId(rawId);
    const node = entry.nodes.find((n) => n.node_id === nodeId);
    if (!node) {
      errors.push({
        node_id: nodeId,
        error:
          `Node "${nodeId}" not found in file "${fileId}". ` +
          'Use get_document_structure to discover available node IDs.',
      });
      continue;
    }
    try {
      // SVG collapse first (per T030 pipeline order)
      details.push(collapseSvgGroups(mapNodeToDetail(node.raw, entry.tokens, depth, fileCtx)));
    } catch (error) {
      errors.push({
        node_id: nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // If save_to is specified, write full data to file and return summaries
  if (params.save_to) {
    let dataToSave: (NodeDetail | NodeDetailDeduped)[];
    if (params.deduplicate_styles) {
      dataToSave = deduplicateStylesArray(details);
    } else {
      dataToSave = details;
    }

    const jsonStr = JSON.stringify(dataToSave, null, 2);
    const savedTo = atomicWriteOutputFile(params.save_to, jsonStr);

    const result: GetNodesInfoSavedResult = {
      saved_to: savedTo,
      file_size_bytes: Buffer.byteLength(jsonStr, 'utf-8'),
      total_requested: params.node_ids.length,
      total_returned: details.length,
      summaries: details.map((d) => buildNodeSummary(d)),
    };
    if (errors.length > 0) result.errors = errors;
    return result;
  }

  const maxChars = params.max_response_chars ?? DEFAULT_MAX_CHARS;
  const trimResult = trimNodeDetailArray(details, maxChars);

  if (params.deduplicate_styles) {
    const dedupedNodes = deduplicateStylesArray(trimResult.data);
    const result: GetNodesInfoResult = {
      nodes: dedupedNodes,
      total_requested: params.node_ids.length,
      total_returned: dedupedNodes.length,
    };
    if (errors.length > 0) result.errors = errors;
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
  if (errors.length > 0) result.errors = errors;

  if (trimResult.truncated) {
    result._truncated = true;
    result._message = trimResult.message!;
  }

  return result;
}
