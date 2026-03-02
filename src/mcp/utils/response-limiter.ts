/**
 * Response size limiter for MCP tool responses.
 * Prevents oversized JSON responses that exceed Claude Code's token limit.
 *
 * Strategy: progressively strip children from deepest levels first,
 * then add a truncation warning.
 */

import type { NodeDetail } from '../../types/mcp.js';

/** Default max response size in characters (~80k, safe for Claude Code). */
export const DEFAULT_MAX_CHARS = 80_000;

export interface TrimResult<T> {
  data: T;
  truncated: boolean;
  original_chars: number;
  final_chars: number;
  message: string | null;
}

/**
 * Estimate JSON character count without actually serializing.
 * Uses a fast recursive estimator (~20% overhead vs JSON.stringify).
 */
export function estimateJsonSize(value: unknown): number {
  if (value === null || value === undefined) return 4; // "null"
  if (typeof value === 'string') return value.length + 2; // quotes
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).length;

  if (Array.isArray(value)) {
    let size = 2; // []
    for (const item of value) {
      size += estimateJsonSize(item) + 1; // comma
    }
    return size;
  }

  if (typeof value === 'object') {
    let size = 2; // {}
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      size += k.length + 3 + estimateJsonSize(v) + 1; // "key": value,
    }
    return size;
  }

  return String(value).length;
}

/**
 * Count the maximum depth of children in a NodeDetail tree.
 */
function maxChildDepth(node: NodeDetail): number {
  if (!node.children || node.children.length === 0) return 0;
  let max = 0;
  for (const child of node.children) {
    const d = maxChildDepth(child);
    if (d > max) max = d;
  }
  return max + 1;
}

/**
 * Strip children at a given depth level, replacing them with empty arrays.
 * Returns a new object (does not mutate the original).
 */
function stripAtDepth(node: NodeDetail, cutDepth: number, currentDepth: number = 0): NodeDetail {
  if (currentDepth >= cutDepth) {
    const childCount = node.children?.length ?? 0;
    return {
      ...node,
      children: [],
      // Add truncation marker as name suffix when children were removed
      name: childCount > 0 ? `${node.name} [+${childCount} children hidden]` : node.name,
    };
  }

  return {
    ...node,
    children: (node.children ?? []).map((c) => stripAtDepth(c, cutDepth, currentDepth + 1)),
  };
}

/**
 * Trim a single NodeDetail tree to fit within maxChars.
 * Progressively reduces depth until it fits.
 */
export function trimNodeDetail(
  node: NodeDetail,
  maxChars: number = DEFAULT_MAX_CHARS,
): TrimResult<NodeDetail> {
  const originalSize = estimateJsonSize(node);

  if (originalSize <= maxChars) {
    return {
      data: node,
      truncated: false,
      original_chars: originalSize,
      final_chars: originalSize,
      message: null,
    };
  }

  const depth = maxChildDepth(node);
  let trimmed = node;
  let currentSize = originalSize;

  // Progressively strip from deepest level
  for (let cutAt = depth; cutAt >= 0 && currentSize > maxChars; cutAt--) {
    trimmed = stripAtDepth(node, cutAt);
    currentSize = estimateJsonSize(trimmed);
  }

  return {
    data: trimmed,
    truncated: true,
    original_chars: originalSize,
    final_chars: currentSize,
    message:
      `Response truncated from ~${Math.round(originalSize / 1000)}k to ~${Math.round(currentSize / 1000)}k chars. ` +
      `Use get_node_info with specific node IDs to explore deeper levels.`,
  };
}

/**
 * Trim an array of NodeDetail trees to fit within maxChars total.
 * Strategy: first try reducing depth uniformly, then limit array length.
 */
export function trimNodeDetailArray(
  nodes: NodeDetail[],
  maxChars: number = DEFAULT_MAX_CHARS,
): TrimResult<NodeDetail[]> {
  const originalSize = estimateJsonSize(nodes);

  if (originalSize <= maxChars) {
    return {
      data: nodes,
      truncated: false,
      original_chars: originalSize,
      final_chars: originalSize,
      message: null,
    };
  }

  // Find max depth across all nodes
  let globalMaxDepth = 0;
  for (const node of nodes) {
    const d = maxChildDepth(node);
    if (d > globalMaxDepth) globalMaxDepth = d;
  }

  // Progressively strip from deepest level
  let trimmed = nodes;
  let currentSize = originalSize;

  for (let cutAt = globalMaxDepth; cutAt >= 0 && currentSize > maxChars; cutAt--) {
    trimmed = nodes.map((n) => stripAtDepth(n, cutAt));
    currentSize = estimateJsonSize(trimmed);
  }

  // If still too large after removing all children, truncate the array itself
  if (currentSize > maxChars) {
    const result: NodeDetail[] = [];
    let accumulated = 2; // []
    for (const node of trimmed) {
      const nodeSize = estimateJsonSize(node);
      if (accumulated + nodeSize + 1 > maxChars) break;
      result.push(node);
      accumulated += nodeSize + 1;
    }
    trimmed = result;
    currentSize = accumulated;
  }

  return {
    data: trimmed,
    truncated: true,
    original_chars: originalSize,
    final_chars: currentSize,
    message:
      `Response truncated from ~${Math.round(originalSize / 1000)}k to ~${Math.round(currentSize / 1000)}k chars` +
      (trimmed.length < nodes.length
        ? ` (showing ${trimmed.length}/${nodes.length} nodes).`
        : '.') +
      ` Use get_node_info with specific node IDs to explore deeper levels.`,
  };
}
