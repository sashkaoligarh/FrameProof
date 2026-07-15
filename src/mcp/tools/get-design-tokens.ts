/**
 * MCP Tool: get_design_tokens
 * Extract all design tokens from a Figma file.
 * Supports save_to (write to file, return summary) and categories filter.
 */

import { z } from 'zod';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { AllTokens, ParsedNode } from '../../types/tokens.js';
import { extractAllTokens } from '../../pipeline/transform.js';
import { resolveParams } from '../utils/normalize-node-id.js';
import { atomicWriteOutputFile } from '../utils/output-path.js';

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

export type DesignTokenScope =
  | { type: 'file' }
  | { type: 'page'; page: string; page_id: string }
  | { type: 'node'; node_id: string; node_name: string };

export interface GetDesignTokensResult {
  file_name: string;
  node_count: number;
  cached: boolean;
  scope: DesignTokenScope;
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
  scope: DesignTokenScope;
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
  const { file_id: fileId, node_id: nodeId } = resolveParams(params.file_id, params.node_id);

  // Track whether this was a cache hit
  const wasCached = !params.force_refresh && cache.get(fileId) !== undefined;

  const entry = await cache.getOrFetch(
    fileId,
    fetchFn,
    params.force_refresh ?? false,
  );

  let scopedNodes = entry.nodes;
  let tokens = entry.tokens;
  let scope: DesignTokenScope = { type: 'file' };

  // A node ID, including one embedded in the Figma URL, takes precedence over page.
  if (nodeId) {
    const node = entry.nodes.find((candidate) => candidate.node_id === nodeId);
    if (!node) {
      throw new Error(
        `Node "${nodeId}" not found in file "${fileId}". ` +
          `Use get_document_structure to discover available node IDs.`,
      );
    }
    scopedNodes = collectSubtree(entry.nodes, node.node_id);
    tokens = extractAllTokens(
      scopedNodes,
      entry.file.styles,
      entry.file.components,
      entry.file.component_sets,
    );
    scope = { type: 'node', node_id: node.node_id, node_name: node.name };
  } else if (params.page) {
    const pages = entry.nodes.filter((node) => node.node_type === 'CANVAS');
    const page = pages.find((candidate) => candidate.name === params.page);
    if (!page) {
      const availablePages = pages.map((candidate) => candidate.name);
      throw new Error(
        `Page "${params.page}" not found in file "${fileId}". ` +
          (availablePages.length > 0
            ? `Available pages: ${availablePages.join(', ')}.`
            : 'No pages are available in the cached document.') +
          ' Use get_document_structure to inspect the file.',
      );
    }
    scopedNodes = collectSubtree(entry.nodes, page.node_id);
    tokens = extractAllTokens(
      scopedNodes,
      entry.file.styles,
      entry.file.components,
      entry.file.component_sets,
    );
    scope = { type: 'page', page: page.name, page_id: page.node_id };
  }

  // Default: exclude components and images (they cause 27M+ output)
  const categories = params.categories ?? ['colors', 'gradients', 'typography', 'spacing', 'radii', 'shadows'];

  const filtered: Partial<AllTokens> = {};
  for (const cat of categories) {
    filtered[cat] = tokens[cat] as never;
  }

  const meta = {
    file_name: entry.file.name,
    node_count: scopedNodes.length,
    cached: wasCached,
    scope,
  };

  // If save_to is specified, write to file and return summary
  if (params.save_to) {
    const dataToSave = { ...meta, ...filtered };
    const jsonStr = JSON.stringify(dataToSave, null, 2);
    const savedTo = atomicWriteOutputFile(params.save_to, jsonStr);

    const tokenCounts: Record<string, number> = {};
    for (const cat of categories) {
      tokenCounts[cat] = tokens[cat].length;
    }

    return {
      saved_to: savedTo,
      file_size_bytes: Buffer.byteLength(jsonStr, 'utf-8'),
      ...meta,
      token_counts: tokenCounts,
    };
  }

  return { ...meta, ...filtered };
}

function collectSubtree(nodes: ParsedNode[], rootId: string): ParsedNode[] {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parent_id) continue;
    const children = childrenByParent.get(node.parent_id) ?? [];
    children.push(node.node_id);
    childrenByParent.set(node.parent_id, children);
  }

  const included = new Set<string>([rootId]);
  const pending = [rootId];
  while (pending.length > 0) {
    const parentId = pending.pop()!;
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (included.has(childId)) continue;
      included.add(childId);
      pending.push(childId);
    }
  }

  return nodes.filter((node) => included.has(node.node_id));
}
