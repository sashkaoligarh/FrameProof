/**
 * MCP server entry point for figma-scaler.
 * Exposes design token extraction, node inspection, image export,
 * and AI-optimized context generation as MCP tools for Claude Code.
 *
 * Transport: stdio (stdout = MCP messages, stderr = logs)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { TokenCache, type FetchResult } from './cache.js';
import { parseFileIdOrUrl, fetchAndParse } from '../pipeline/fetch.js';
import { parseDocumentTree } from '../pipeline/parse.js';
import { extractAllTokens } from '../pipeline/transform.js';
import type { ParseContext } from '../types/tokens.js';
import { getDesignTokensSchema, handleGetDesignTokens } from './tools/get-design-tokens.js';
import { getNodeInfoSchema, handleGetNodeInfo } from './tools/get-node-info.js';
import { getNodesInfoSchema, handleGetNodesInfo } from './tools/get-nodes-info.js';
import { getCSSVariablesSchema, handleGetCSSVariables } from './tools/get-css-variables.js';
import { exportNodeImageSchema, handleExportNodeImage } from './tools/export-node-image.js';
import { getDocumentStructureSchema, handleGetDocumentStructure } from './tools/get-document-structure.js';
import { getDesignContextSchema, handleGetDesignContext } from './tools/get-design-context.js';
import { searchTokenSchema, handleSearchToken } from './tools/search-token.js';
import { getScreenshotSchema, handleGetScreenshot } from './tools/get-screenshot.js';
import { getFrameOverviewSchema, handleGetFrameOverview } from './tools/get-frame-overview.js';
import { batchScreenshotsSchema, handleBatchScreenshots } from './tools/batch-screenshots.js';
import { exportPageAnalysisSchema, handleExportPageAnalysis } from './tools/export-page-analysis.js';
import { pixelPerfectOrchestratorSchema, handlePixelPerfectOrchestrator } from './tools/pixel-perfect-orchestrator.js';
import { fetchFigmaImages, downloadImage } from '../api/client.js';
import { getVariablesSchema, handleGetVariables } from './tools/get-variables.js';
import { createVariableCollectionSchema, handleCreateVariableCollection } from './tools/create-variable-collection.js';
import { createVariableSchema, handleCreateVariable } from './tools/create-variable.js';
import { updateVariableSchema, handleUpdateVariable } from './tools/update-variable.js';
import { deleteVariableSchema, handleDeleteVariable } from './tools/delete-variable.js';
import { syncVariablesSchema, handleSyncVariables } from './tools/sync-variables.js';
import { listDevResourcesSchema, handleListDevResources } from './tools/list-dev-resources.js';
import { createDevResourceSchema, handleCreateDevResource } from './tools/create-dev-resource.js';
import { updateDevResourceSchema, handleUpdateDevResource } from './tools/update-dev-resource.js';
import { deleteDevResourceSchema, handleDeleteDevResource } from './tools/delete-dev-resource.js';
import { postCommentSchema, handlePostComment } from './tools/post-comment.js';
import { replyToCommentSchema, handleReplyToComment } from './tools/reply-to-comment.js';
import { getCommentsSchema, handleGetComments } from './tools/get-comments.js';
import {
  LAYOUT_STRATEGY_NAME,
  LAYOUT_STRATEGY_DESCRIPTION,
  LAYOUT_STRATEGY_MESSAGE,
} from './prompts/layout-strategy.js';
import {
  READ_DESIGN_STRATEGY_NAME,
  READ_DESIGN_STRATEGY_DESCRIPTION,
  READ_DESIGN_STRATEGY_MESSAGE,
} from './prompts/read-design-strategy.js';
import {
  TOKEN_USAGE_RULES_NAME,
  TOKEN_USAGE_RULES_DESCRIPTION,
  TOKEN_USAGE_RULES_MESSAGE,
} from './prompts/token-usage-rules.js';
import {
  WRITE_DESIGN_STRATEGY_NAME,
  WRITE_DESIGN_STRATEGY_DESCRIPTION,
  WRITE_DESIGN_STRATEGY_MESSAGE,
} from './prompts/write-design-strategy.js';
import {
  PIXEL_PERFECT_ORCHESTRATION_NAME,
  PIXEL_PERFECT_ORCHESTRATION_DESCRIPTION,
  PIXEL_PERFECT_ORCHESTRATION_MESSAGE,
} from './prompts/pixel-perfect-orchestration.js';
import { FIGMA_TOKENS_TEMPLATE, createTokensResourceHandlers } from './resources/figma-tokens.js';

// ─── Configuration ──────────────────────────────────────

const SERVER_NAME = 'figma-scaler';
const SERVER_VERSION = '0.2.0';

// ─── Shared State ───────────────────────────────────────

export const cache = new TokenCache();

/**
 * Resolve FIGMA_TOKEN from environment.
 * Returns null if not set.
 */
export function getFigmaToken(): string | null {
  return process.env.FIGMA_TOKEN ?? null;
}

/**
 * Fetch and parse a Figma file, returning data suitable for caching.
 * This is the default fetch callback used by cache.getOrFetch().
 * Includes hidden nodes so component variants and hidden layers are accessible.
 */
export async function fetchFigmaData(fileId: string): Promise<FetchResult> {
  const token = getFigmaToken();
  if (!token) {
    throw new Error(
      'FIGMA_TOKEN environment variable is not set.\n\n' +
        'To use figma-scaler MCP server:\n' +
        '1. Generate a personal access token at https://www.figma.com/developers/api#access-tokens\n' +
        '2. Set it: export FIGMA_TOKEN="your-token-here"\n' +
        '3. Or add it to your .env file',
    );
  }

  const resolvedId = parseFileIdOrUrl(fileId);

  const ctx: ParseContext = {
    file_id: resolvedId,
    token,
    output_dir: '',
    include_hidden: true,
    format: 'all',
    export_images: false,
    image_formats: [],
    image_scale: 1,
    compress: false,
  };

  process.stderr.write(`Fetching Figma file ${resolvedId} (this may take 30-60s for large files)...\n`);
  const file = await fetchAndParse(ctx);
  process.stderr.write(`Parsing ${file.name}: building node tree...\n`);
  // Include hidden nodes — needed for component variants, hidden states, and decorative layers
  const nodes = parseDocumentTree(file.document, { includeHidden: true });
  process.stderr.write(`Extracting tokens from ${nodes.length} nodes...\n`);
  const tokens = extractAllTokens(nodes, file.styles, file.components, file.component_sets);
  process.stderr.write(`Done: ${tokens.colors.length} colors, ${tokens.typography.length} typography, ${tokens.spacing.length} spacing tokens.\n`);

  return { file, nodes, tokens };
}

// ─── Server Setup ───────────────────────────────────────

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// ─── Tools ──────────────────────────────────────────────

server.tool(
  'get_design_tokens',
  'Extract design tokens from a Figma file. Default: colors, gradients, typography, spacing, radii, shadows (excludes heavy components/images). Use save_to=".figma/tokens.json" for large files.',
  getDesignTokensSchema,
  async (params) => {
    try {
      const result = await handleGetDesignTokens(params, cache, fetchFigmaData);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'get_node_info',
  'Get detailed info about a Figma node with CSS mappings, constraints, min/max sizes, applied styles, and token hints. Use save_to=".figma/{name}.json" for large nodes.',
  getNodeInfoSchema,
  async (params) => {
    try {
      const result = await handleGetNodeInfo(params, cache, fetchFigmaData);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'get_nodes_info',
  'Batch get_node_info for multiple nodes. Use save_to to write to file instead of returning in context.',
  getNodesInfoSchema,
  async (params) => {
    try {
      const result = await handleGetNodesInfo(params, cache, fetchFigmaData);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'get_css_variables',
  'Generate CSS Custom Properties from design tokens. Use save_to=".figma/design-system.css" to save and import in your project.',
  getCSSVariablesSchema,
  async (params) => {
    try {
      const result = await handleGetCSSVariables(params, cache, fetchFigmaData);
      if (result.saved) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `CSS saved to ${result.file_path}\n\n${result.css}`,
            },
          ],
        };
      }
      return { content: [{ type: 'text' as const, text: result.css }] };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'export_node_image',
  'Export a Figma node as an image file (SVG, PNG, JPG, or PDF)',
  exportNodeImageSchema,
  async (params) => {
    try {
      const result = await handleExportNodeImage(
        params,
        cache,
        fetchFigmaData,
        fetchFigmaImages,
        downloadImage,
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'get_document_structure',
  'Get an overview of a Figma file — pages, top-level frames, component counts',
  getDocumentStructureSchema,
  async (params) => {
    try {
      const result = await handleGetDocumentStructure(params, cache, fetchFigmaData);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'get_design_context',
  'Generate an AI-optimized design system summary as markdown',
  getDesignContextSchema,
  async (params) => {
    try {
      const result = await handleGetDesignContext(params, cache, fetchFigmaData);
      return { content: [{ type: 'text' as const, text: result }] };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'search_token',
  'Search design tokens by value — hex color, number, or font name',
  searchTokenSchema,
  async (params) => {
    try {
      const result = await handleSearchToken(params, cache, fetchFigmaData);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'get_screenshot',
  'Export a screenshot of a Figma frame with structural summary for visual verification',
  getScreenshotSchema,
  async (params) => {
    try {
      const result = await handleGetScreenshot(
        params,
        cache,
        fetchFigmaData,
        fetchFigmaImages,
        downloadImage,
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

// ─── New Tools (v0.2.0) ─────────────────────────────────

server.tool(
  'get_frame_overview',
  'Lightweight overview of a frame\'s sections — names, types, dimensions, component refs, gaps between siblings, main component names. Use to plan which sections to inspect.',
  getFrameOverviewSchema,
  async (params) => {
    try {
      const result = await handleGetFrameOverview(params, cache, fetchFigmaData);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'batch_screenshots',
  'Screenshot all direct children of a frame in one call. Returns file paths for each section.',
  batchScreenshotsSchema,
  async (params) => {
    try {
      const result = await handleBatchScreenshots(
        params,
        cache,
        fetchFigmaData,
        fetchFigmaImages,
        downloadImage,
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'export_page_analysis',
  'Full page analysis saved to file (markdown/JSON). Includes CSS mappings, design notes for mixed colors, absolute elements, component refs, non-standard values, orphan colors, missing auto-layout.',
  exportPageAnalysisSchema,
  async (params) => {
    try {
      const result = await handleExportPageAnalysis(params, cache, fetchFigmaData);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'pixel_perfect_orchestrator',
  'Create a continuous-until-pass React/Astro pixel-perfect runbook with Figma section inventory, FSD/design-system rules, required artifacts, and strict figma-scaler gate commands.',
  pixelPerfectOrchestratorSchema,
  async (params) => {
    try {
      const result = await handlePixelPerfectOrchestrator(params, cache, fetchFigmaData);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

// ─── Variables API Tools (v0.3.0) ───────────────────────

server.tool(
  'get_variables',
  'Retrieve all local variables and collections from a Figma file. Requires Enterprise plan + file_variables:read scope.',
  getVariablesSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleGetVariables(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'create_variable_collection',
  'Create a new variable collection in a Figma file. Idempotent: returns existing collection if name already exists. Requires Enterprise plan + file_variables:write scope.',
  createVariableCollectionSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleCreateVariableCollection(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'create_variable',
  'Create a new variable in a Figma file. Idempotent: returns existing if name+collection match. Hex colors auto-converted to RGBA. Requires Enterprise plan + file_variables:write scope.',
  createVariableSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleCreateVariable(
        { ...params, resolved_type: params.resolved_type as 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' },
        token,
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'update_variable',
  'Update an existing variable (name, mode values, scopes). Hex colors auto-converted to RGBA. Requires Enterprise plan + file_variables:write scope.',
  updateVariableSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleUpdateVariable(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'delete_variable',
  'Delete a variable from a Figma file. Use dry_run=true to preview without making changes. Requires Enterprise plan + file_variables:write scope.',
  deleteVariableSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleDeleteVariable(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'sync_variables',
  'Batch create/update/delete variables and collections in a single API call. Supports dry_run. Hex colors auto-converted. Requires Enterprise plan + file_variables:write scope.',
  syncVariablesSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleSyncVariables(params as Parameters<typeof handleSyncVariables>[0], token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

// ─── Dev Resources API Tools ─────────────────────────────

server.tool(
  'list_dev_resources',
  'List dev resources (linked URLs) for a Figma file, optionally filtered by node_id. Requires file_dev_resources:read scope.',
  listDevResourcesSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleListDevResources(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'create_dev_resource',
  'Attach a URL (dev resource) to a Figma node. Idempotent: returns existing if same URL is already on the node. Max 10 per node. Requires file_dev_resources:write scope.',
  createDevResourceSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleCreateDevResource(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'update_dev_resource',
  'Update an existing dev resource (rename or change URL). Requires file_dev_resources:write scope.',
  updateDevResourceSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleUpdateDevResource(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'delete_dev_resource',
  'Delete a dev resource (unlink a URL from a Figma node). Requires file_dev_resources:write scope.',
  deleteDevResourceSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleDeleteDevResource(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

// ─── Comments API Tools ──────────────────────────────────

server.tool(
  'post_comment',
  'Post a new top-level comment on a Figma file. Optionally anchor it to a node with x/y offset (FrameOffset format). Requires comments:write scope.',
  postCommentSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handlePostComment(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'reply_to_comment',
  'Post a reply to an existing comment thread in a Figma file. Requires comments:write scope.',
  replyToCommentSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleReplyToComment(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  'get_comments',
  'Retrieve all comments from a Figma file, grouped into threads with replies nested under parent comments. Requires comments:read scope.',
  getCommentsSchema,
  async (params) => {
    const token = getFigmaToken();
    if (!token) {
      return {
        content: [{ type: 'text' as const, text: 'Error: FIGMA_TOKEN environment variable is not set.' }],
        isError: true,
      };
    }
    try {
      const result = await handleGetComments(params, token);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

// ─── Prompts ────────────────────────────────────────────

server.prompt(LAYOUT_STRATEGY_NAME, LAYOUT_STRATEGY_DESCRIPTION, () => ({
  messages: [{ role: 'assistant' as const, content: { type: 'text' as const, text: LAYOUT_STRATEGY_MESSAGE } }],
}));

server.prompt(READ_DESIGN_STRATEGY_NAME, READ_DESIGN_STRATEGY_DESCRIPTION, () => ({
  messages: [{ role: 'assistant' as const, content: { type: 'text' as const, text: READ_DESIGN_STRATEGY_MESSAGE } }],
}));

server.prompt(TOKEN_USAGE_RULES_NAME, TOKEN_USAGE_RULES_DESCRIPTION, () => ({
  messages: [{ role: 'assistant' as const, content: { type: 'text' as const, text: TOKEN_USAGE_RULES_MESSAGE } }],
}));

server.prompt(WRITE_DESIGN_STRATEGY_NAME, WRITE_DESIGN_STRATEGY_DESCRIPTION, () => ({
  messages: [{ role: 'assistant' as const, content: { type: 'text' as const, text: WRITE_DESIGN_STRATEGY_MESSAGE } }],
}));

server.prompt(PIXEL_PERFECT_ORCHESTRATION_NAME, PIXEL_PERFECT_ORCHESTRATION_DESCRIPTION, () => ({
  messages: [{ role: 'assistant' as const, content: { type: 'text' as const, text: PIXEL_PERFECT_ORCHESTRATION_MESSAGE } }],
}));

// ─── Resources ──────────────────────────────────────────

const tokenResourceHandlers = createTokensResourceHandlers(cache);
server.resource(
  'figma-tokens',
  FIGMA_TOKENS_TEMPLATE,
  tokenResourceHandlers.read,
);

// ─── Start ──────────────────────────────────────────────

async function main() {
  process.stderr.write(`${SERVER_NAME} MCP server v${SERVER_VERSION} starting...\n`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(`${SERVER_NAME} MCP server connected via stdio.\n`);
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

export { server };
