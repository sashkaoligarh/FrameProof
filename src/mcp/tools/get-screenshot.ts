/**
 * MCP Tool: get_screenshot
 * Export a screenshot of a Figma frame with structural summary for visual verification.
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { ImageExportOptions } from '../../api/client.js';
import { mapNodeToDetail } from '../mappers/css-mapper.js';
import { resolveParams } from '../utils/normalize-node-id.js';

export const getScreenshotSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  node_id: z.string().optional().describe('Node to screenshot (usually a frame). Auto-extracted from URL if not provided.'),
  scale: z.number().optional().default(1).describe('Export scale (1-4)'),
  output_dir: z.string().optional().default('.figma').describe('Directory to save'),
};

export interface GetScreenshotParams {
  file_id: string;
  node_id?: string;
  scale?: number;
  output_dir?: string;
}

export interface ScreenshotSummary {
  node_name: string;
  node_type: string;
  width: number;
  height: number;
  child_count: number;
  has_auto_layout: boolean;
  layout_mode: string | null;
  dominant_fills: string[];
}

export interface GetScreenshotResult {
  file_path: string;
  width: number;
  height: number;
  file_size_bytes: number;
  summary: ScreenshotSummary;
}

type FetchImagesFn = (
  fileId: string,
  token: string,
  nodeIds: string[],
  options?: ImageExportOptions,
) => Promise<Record<string, string | null>>;

type DownloadImageFn = (url: string) => Promise<ArrayBuffer>;

/**
 * Handle get_screenshot request.
 * Exports a PNG screenshot and returns structural summary alongside file path.
 */
export async function handleGetScreenshot(
  params: GetScreenshotParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
  fetchImagesFn: FetchImagesFn,
  downloadImageFn: DownloadImageFn,
): Promise<GetScreenshotResult> {
  const { file_id: fileId, node_id: nodeId } = resolveParams(params.file_id, params.node_id);
  if (!nodeId) {
    throw new Error('node_id is required. Provide it explicitly or include node-id in the Figma URL.');
  }

  const entry = await cache.getOrFetch(fileId, fetchFn);

  const node = entry.nodes.find((n) => n.node_id === nodeId);
  if (!node) {
    throw new Error(
      `Node "${nodeId}" not found in file "${fileId}". ` +
        `Use get_document_structure to discover available node IDs.`,
    );
  }

  const scale = params.scale ?? 1;
  const outputDir = params.output_dir ?? '.figma';

  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error('FIGMA_TOKEN environment variable is not set.');
  }

  // Get render URL (always PNG for screenshots)
  const imageUrls = await fetchImagesFn(fileId, token, [nodeId], {
    format: 'png',
    scale,
  });

  const imageUrl = imageUrls[nodeId];
  if (!imageUrl) {
    throw new Error(`Figma API returned no image URL for node "${nodeId}".`);
  }

  // Download binary
  const buffer = await downloadImageFn(imageUrl);

  // Write to disk
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeName = node.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filePath = path.join(outputDir, `${safeName}_screenshot.png`);
  fs.writeFileSync(filePath, Buffer.from(buffer));

  // Build structural summary from mapped detail
  const fileCtx = { styles: entry.file.styles, components: entry.file.components };
  const detail = mapNodeToDetail(node.raw, entry.tokens, 1, fileCtx);

  const dominantFills = detail.fills
    .filter((f) => f.fill_type === 'solid' && f.value_hex)
    .map((f) => f.value_hex!)
    .slice(0, 3);

  const summary: ScreenshotSummary = {
    node_name: detail.name,
    node_type: detail.node_type,
    width: detail.width,
    height: detail.height,
    child_count: (node.raw as Record<string, unknown>).children
      ? ((node.raw as Record<string, unknown>).children as unknown[]).length
      : 0,
    has_auto_layout: detail.layout !== null,
    layout_mode: detail.layout?.mode ?? null,
    dominant_fills: dominantFills,
  };

  return {
    file_path: filePath,
    width: detail.width,
    height: detail.height,
    file_size_bytes: buffer.byteLength,
    summary,
  };
}
