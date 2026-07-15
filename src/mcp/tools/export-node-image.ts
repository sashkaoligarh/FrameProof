/**
 * MCP Tool: export_node_image
 * Export a Figma node as an image file.
 */

import { z } from 'zod';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { ImageExportOptions } from '../../api/client.js';
import type { CompressionResult } from '../../types/tokens.js';
import { isCompressibleFormat, compressImageBuffer } from '../../api/tinyjpg.js';
import { resolveParams } from '../utils/normalize-node-id.js';
import { atomicWriteOutputFile, nodeIdFilenamePart, prepareOutputDirectory } from '../utils/output-path.js';

export const exportNodeImageSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  node_id: z.string().optional().describe('Node to export. Auto-extracted from URL if not provided.'),
  format: z.enum(['svg', 'png', 'jpg', 'pdf']).optional().default('png').describe('Image format'),
  scale: z.number().finite().min(1).max(4).optional().default(1).describe('Scale for raster formats 1-4'),
  output_dir: z.string().optional().default('.figma').describe('Directory to save'),
  compress: z.boolean().optional().default(false).describe('Compress output via TinyJPG API (requires TINYJPG_TOKEN env var)'),
};

export interface ExportNodeImageParams {
  file_id: string;
  node_id?: string;
  format?: 'svg' | 'png' | 'jpg' | 'pdf';
  scale?: number;
  output_dir?: string;
  compress?: boolean;
}

export interface ExportNodeImageResult {
  file_path: string;
  format: string;
  size_bytes: number;
  compression?: CompressionResult;
  warning?: string;
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
  const { file_id: fileId, node_id: nodeId } = resolveParams(params.file_id, params.node_id);
  if (!nodeId) {
    throw new Error('node_id is required. Provide it explicitly or include node-id in the Figma URL.');
  }

  const entry = await cache.getOrFetch(fileId, fetchFn);

  // Validate node exists
  const node = entry.nodes.find((n) => n.node_id === nodeId);
  if (!node) {
    throw new Error(
      `Node "${nodeId}" not found in file "${fileId}". ` +
        `Use get_document_structure to discover available node IDs.`,
    );
  }

  const format = params.format ?? 'png';
  const scale = params.scale ?? 1;
  const outputDir = prepareOutputDirectory(params.output_dir ?? '.figma');

  // Get FIGMA_TOKEN from env
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error('FIGMA_TOKEN environment variable is not set.');
  }

  // Get render URL
  const imageUrls = await fetchImagesFn(fileId, token, [nodeId], {
    format,
    scale,
  });

  const imageUrl = imageUrls[nodeId];
  if (!imageUrl) {
    throw new Error(`Figma API returned no image URL for node "${nodeId}".`);
  }

  // Download binary
  const rawBuffer = await downloadImageFn(imageUrl);
  let fileBuffer: Uint8Array = new Uint8Array(rawBuffer);

  let compression: CompressionResult | undefined;
  let warning: string | undefined;

  // Compress if requested and format is compressible
  if (params.compress && isCompressibleFormat(format)) {
    if (!process.env.TINYJPG_TOKEN) {
      warning = 'compress requested but TINYJPG_TOKEN is not set — saving without compression';
    } else {
      const result = await compressImageBuffer(fileBuffer);
      compression = result.result;
      fileBuffer = result.compressed;
    }
  }

  const safeName = node.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filePath = atomicWriteOutputFile(
    path.join(outputDir, `${safeName}_${nodeIdFilenamePart(nodeId)}.${format}`),
    fileBuffer,
  );

  return {
    file_path: filePath,
    format,
    size_bytes: fileBuffer.length,
    compression,
    warning,
  };
}
