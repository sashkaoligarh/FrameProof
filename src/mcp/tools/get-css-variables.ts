/**
 * MCP Tool: get_css_variables
 * Generate CSS Custom Properties from design tokens.
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import { generateCSS } from '../../writers/css.js';
import { resolveParams } from '../utils/normalize-node-id.js';

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
    const dir = path.dirname(params.save_to);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(params.save_to, css, 'utf-8');
    return { css, saved: true, file_path: params.save_to };
  }

  return { css, saved: false };
}
