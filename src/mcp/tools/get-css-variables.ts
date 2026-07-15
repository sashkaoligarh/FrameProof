/**
 * MCP Tool: get_css_variables
 * Generate CSS Custom Properties from design tokens.
 */

import { z } from 'zod';
import type { TokenCache, FetchCallback } from '../cache.js';
import { generateCSS } from '../../writers/css.js';
import { resolveParams } from '../utils/normalize-node-id.js';
import { atomicWriteOutputFile } from '../utils/output-path.js';

export const getCSSVariablesSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  save_to: z.string().optional().describe('File path to save CSS (if omitted, returns as text)'),
};

export interface GetCSSVariablesParams {
  file_id: string;
  save_to?: string;
}

export interface GetCSSVariablesResult {
  css: string;
  saved: boolean;
  file_path?: string;
}

export async function handleGetCSSVariables(
  params: GetCSSVariablesParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<GetCSSVariablesResult> {
  const { file_id: fileId } = resolveParams(params.file_id);
  const entry = await cache.getOrFetch(fileId, fetchFn);
  const css = generateCSS(entry.tokens, fileId);

  if (params.save_to) {
    const filePath = atomicWriteOutputFile(params.save_to, css);
    return { css, saved: true, file_path: filePath };
  }

  return { css, saved: false };
}
