/**
 * MCP Tool: get_node_info
 * Get detailed information about a specific Figma node with CSS mappings.
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { NodeDetail, NodeDetailDeduped } from '../../types/mcp.js';
import { mapNodeToDetail } from '../mappers/css-mapper.js';
import { trimNodeDetail, DEFAULT_MAX_CHARS } from '../utils/response-limiter.js';
import { deduplicateStyles } from '../utils/style-dedup.js';
import { collapseSvgGroups } from '../utils/svg-collapse.js';
import { buildNodeSummary, type NodeSummary } from '../utils/node-summary.js';
import { resolveParams } from '../utils/normalize-node-id.js';

export const getNodeInfoSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (node-id will be auto-extracted from URL if present)'),
  node_id: z.string().optional().describe('Target node ID (accepts "8077:4170" or "8077-4170"). If omitted, extracted from file_id URL.'),
  depth: z.number().optional().default(5).describe('Max child depth (default: 5)'),
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
    .describe('Save full JSON to this file path and return only a compact summary. Use this for large nodes to avoid filling context window.'),
};

export interface GetNodeInfoParams {
  file_id: string;
  node_id?: string;
  depth?: number;
  max_response_chars?: number;
  deduplicate_styles?: boolean;
  save_to?: string;
}

export interface GetNodeInfoResult {
  node: NodeDetail | NodeDetailDeduped;
  _truncated?: boolean;
  _message?: string;
}

export interface GetNodeInfoSavedResult {
  saved_to: string;
  file_size_bytes: number;
  summary: NodeSummary;
  _truncated?: boolean;
}

/**
 * Handle get_node_info request.
 * Finds node by ID in cached parsed tree and maps to NodeDetail with CSS variables.
 * Auto-trims response if it exceeds max_response_chars.
 * When save_to is set, writes full JSON to file and returns summary only.
 */
export async function handleGetNodeInfo(
  params: GetNodeInfoParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<GetNodeInfoResult | GetNodeInfoSavedResult> {
  const { file_id: fileId, node_id: nodeId } = resolveParams(params.file_id, params.node_id);

  if (!nodeId) {
    throw new Error(
      'node_id is required. Provide it as a parameter or include node-id in the Figma URL.',
    );
  }

  const entry = await cache.getOrFetch(fileId, fetchFn);

  const node = entry.nodes.find((n) => n.node_id === nodeId);
  if (!node) {
    throw new Error(
      `Node "${nodeId}" not found in file "${fileId}". ` +
        `Use get_document_structure to discover available node IDs.`,
    );
  }

  const fileCtx = { styles: entry.file.styles, components: entry.file.components };
  let detail = mapNodeToDetail(node.raw, entry.tokens, params.depth ?? 5, fileCtx);

  // SVG collapse first, then dedup (per T030 pipeline order)
  detail = collapseSvgGroups(detail);

  const maxChars = params.max_response_chars ?? DEFAULT_MAX_CHARS;
  const trimResult = trimNodeDetail(detail, maxChars);

  // If save_to is specified, write full data to file and return summary
  if (params.save_to) {
    let dataToSave: NodeDetail | NodeDetailDeduped;
    if (params.deduplicate_styles) {
      dataToSave = deduplicateStyles(trimResult.data);
    } else {
      dataToSave = trimResult.data;
    }

    const jsonStr = JSON.stringify(dataToSave, null, 2);
    const dir = path.dirname(params.save_to);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(params.save_to, jsonStr, 'utf-8');

    const result: GetNodeInfoSavedResult = {
      saved_to: params.save_to,
      file_size_bytes: Buffer.byteLength(jsonStr, 'utf-8'),
      summary: buildNodeSummary(detail),
    };
    if (trimResult.truncated) {
      result._truncated = true;
    }
    return result;
  }

  if (params.deduplicate_styles) {
    const deduped = deduplicateStyles(trimResult.data);
    if (trimResult.truncated) {
      return { node: deduped, _truncated: true, _message: trimResult.message! };
    }
    return { node: deduped };
  }

  if (trimResult.truncated) {
    return {
      node: trimResult.data,
      _truncated: true,
      _message: trimResult.message!,
    };
  }

  return { node: trimResult.data };
}
