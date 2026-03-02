/**
 * MCP Resource: figma://tokens/{file_id}
 * Dynamic resource for accessing cached design tokens.
 */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TokenCache } from '../cache.js';

export const FIGMA_TOKENS_TEMPLATE = new ResourceTemplate(
  'figma://tokens/{file_id}',
  { list: undefined },
);

export function createTokensResourceHandlers(cache: TokenCache) {
  return {
    /** List all cached file IDs as available resources. */
    list: () => {
      const cached = cache.listCached();
      return {
        resources: cached.map((fileId) => ({
          uri: `figma://tokens/${fileId}`,
          name: `Design tokens for ${fileId}`,
          mimeType: 'application/json',
        })),
      };
    },

    /** Read tokens for a specific file ID. */
    read: (uri: URL, params: Record<string, string | string[]>) => {
      const fileId = Array.isArray(params.file_id) ? params.file_id[0] : params.file_id;
      const entry = cache.get(fileId);
      if (!entry) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `No cached tokens for file "${params.file_id}". Call get_design_tokens first.`,
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(entry.tokens, null, 2),
          },
        ],
      };
    },
  };
}
