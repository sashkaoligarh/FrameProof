/**
 * MCP Tool: get_design_context
 * Generate an AI-optimized design system summary.
 */

import { z } from 'zod';
import type { TokenCache, FetchCallback } from '../cache.js';
import { generateMarkdown } from '../../writers/markdown.js';

export const getDesignContextSchema = {
  file_id: z.string().describe('Figma file ID or URL'),
};

export interface GetDesignContextParams {
  file_id: string;
}

export async function handleGetDesignContext(
  params: GetDesignContextParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<string> {
  const entry = await cache.getOrFetch(params.file_id, fetchFn);
  return generateMarkdown(entry.tokens, entry.file_id, entry.file.name);
}
