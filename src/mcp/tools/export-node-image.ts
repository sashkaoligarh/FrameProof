/**
 * MCP Tool: export_node_image
 * Export a Figma node as an image file.
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { ImageExportOptions } from '../../api/client.js';

export const exportNodeImageSchema = {
  file_id: z.string().describe('Figma file ID or URL'),
  node_id: z.string().describe('Node to export'),
  format: z.enum(['svg', 'png', 'jpg', 'pdf']).optional().default('png').describe('Image format'),
  scale: z.number().optional().default(1).describe('Scale for raster formats 1-4'),
  output_dir: z.string().optional().default('./figma-assets').describe('Directory to save'),
};

export interface ExportNodeImageParams {
  file_id: string;
  node_id: string;
  format?: 'svg' | 'png' | 'jpg' | 'pdf';
  scale?: number;
  output_dir?: string;
}

export interface ExportNodeImageResult {
  file_path: string;
  format: string;
  size_bytes: number;
}

type FetchImagesFn = (
  fileId: string,
  token: string,
  nodeIds: string[],
  options?: ImageExportOptions,
) => Promise<Record<string, string | null>>;

type DownloadImageFn = (url: string) => Promise<ArrayBuffer>;

export async function handleExportNodeImage(
  params: ExportNodeImageParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
  fetchImagesFn: FetchImagesFn,
  downloadImageFn: DownloadImageFn,
): Promise<ExportNodeImageResult> {
  const entry = await cache.getOrFetch(params.file_id, fetchFn);

  // Validate node exists
  const node = entry.nodes.find((n) => n.node_id === params.node_id);
  if (!node) {
    throw new Error(
      `Node "${params.node_id}" not found in file "${params.file_id}". ` +
        `Use get_document_structure to discover available node IDs.`,
    );
  }

  const format = params.format ?? 'png';
  const scale = params.scale ?? 1;
  const outputDir = params.output_dir ?? './figma-assets';

  // Get FIGMA_TOKEN from env
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error('FIGMA_TOKEN environment variable is not set.');
  }

  // Get render URL
  const imageUrls = await fetchImagesFn(entry.file_id, token, [params.node_id], {
    format,
    scale,
  });

  const imageUrl = imageUrls[params.node_id];
  if (!imageUrl) {
    throw new Error(`Figma API returned no image URL for node "${params.node_id}".`);
  }

  // Download binary
  const buffer = await downloadImageFn(imageUrl);

  // Write to disk
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeName = node.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filePath = path.join(outputDir, `${safeName}.${format}`);
  fs.writeFileSync(filePath, Buffer.from(buffer));

  return {
    file_path: filePath,
    format,
    size_bytes: buffer.byteLength,
  };
}
