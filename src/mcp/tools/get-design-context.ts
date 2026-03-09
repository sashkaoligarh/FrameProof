/**
 * MCP Tool: get_design_context
 * Generate an AI-optimized design system summary.
 */

import { z } from 'zod';
import type { TokenCache, FetchCallback } from '../cache.js';
import { generateMarkdown } from '../../writers/markdown.js';
import { resolveParams } from '../utils/normalize-node-id.js';

export const getDesignContextSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
};

export interface GetDesignContextParams {
  file_id: string;
}

export async function handleGetDesignContext(
  params: GetDesignContextParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<string> {
  const { file_id: fileId } = resolveParams(params.file_id);
  const entry = await cache.getOrFetch(fileId, fetchFn);
  return generateMarkdown(entry.tokens, fileId, entry.file.name);
}
