/**
 * Stage 1: Fetch — wraps API client with URL parsing and progress output.
 */

import type { FigmaFile, ParseContext } from '../types/tokens.js';
import { fetchFigmaFile, maskToken } from '../api/client.js';

/**
 * Extract a Figma file ID from a URL or return the ID as-is.
 * Supports:
 * - figma.com/file/<id>/...
 * - figma.com/design/<id>/...
 * - Raw file ID string
 */
export function parseFileIdOrUrl(input: string): string {
  // Try to parse as URL
  const urlPatterns = [
    /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/,
  ];

  for (const pattern of urlPatterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }

  // Assume it's a raw file ID
  return input;
}

/**
 * Fetch a Figma file and return a normalized FigmaFile object.
 */
export async function fetchAndParse(ctx: ParseContext): Promise<FigmaFile> {
  const fileId = parseFileIdOrUrl(ctx.file_id);

  process.stderr.write(`Fetching file ${fileId} (token: ${maskToken(ctx.token)})...\n`);

  const fetchOptions: import('../api/client.js').FetchOptions = {};
  if (ctx.node_filter) {
    fetchOptions.nodeIds = [ctx.node_filter];
  }

  const raw = (await fetchFigmaFile(fileId, ctx.token, fetchOptions)) as Record<string, unknown>;

  process.stderr.write(`File "${raw.name as string}" loaded.\n`);

  return {
    file_id: fileId,
    name: raw.name as string,
    last_modified: raw.lastModified as string,
    version: raw.version as string,
    document: raw.document as FigmaFile['document'],
    components: normalizeComponents(raw.components as Record<string, Record<string, unknown>> | undefined),
    component_sets: normalizeComponentSets(raw.componentSets as Record<string, Record<string, unknown>> | undefined),
    styles: normalizeStyles(raw.styles as Record<string, Record<string, unknown>> | undefined),
  };
}

function normalizeComponents(
  raw: Record<string, Record<string, unknown>> | undefined,
): FigmaFile['components'] {
  if (!raw) return {};
  const result: FigmaFile['components'] = {};
  for (const [id, comp] of Object.entries(raw)) {
    result[id] = {
      key: comp.key as string,
      name: comp.name as string,
      description: (comp.description as string) ?? '',
      component_set_id: comp.componentSetId as string | undefined,
    };
  }
  return result;
}

function normalizeComponentSets(
  raw: Record<string, Record<string, unknown>> | undefined,
): FigmaFile['component_sets'] {
  if (!raw) return {};
  const result: FigmaFile['component_sets'] = {};
  for (const [id, set] of Object.entries(raw)) {
    result[id] = {
      key: set.key as string,
      name: set.name as string,
      description: (set.description as string) ?? '',
    };
  }
  return result;
}

function normalizeStyles(
  raw: Record<string, Record<string, unknown>> | undefined,
): FigmaFile['styles'] {
  if (!raw) return {};
  const result: FigmaFile['styles'] = {};
  for (const [id, style] of Object.entries(raw)) {
    result[id] = {
      key: style.key as string,
      name: style.name as string,
      style_type: style.styleType as string,
      description: (style.description as string) ?? '',
    };
  }
  return result;
}
