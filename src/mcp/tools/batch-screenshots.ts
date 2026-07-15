/**
 * MCP Tool: batch_screenshots
 * Export screenshots of all direct children of a frame in one call.
 * Returns file paths for each section screenshot.
 */

import { z } from 'zod';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { ImageExportOptions } from '../../api/client.js';
import type { CompressionResult, CompressionStats } from '../../types/tokens.js';
import { compressImageBuffer } from '../../api/tinyjpg.js';
import { resolveParams } from '../utils/normalize-node-id.js';
import { atomicWriteOutputFile, nodeIdFilenamePart, prepareOutputDirectory } from '../utils/output-path.js';

export const batchScreenshotsSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  node_id: z.string().optional().describe('Parent frame whose direct children will be screenshotted. Auto-extracted from URL if not provided.'),
  scale: z.number().finite().min(1).max(4).optional().default(1).describe('Export scale (1-4)'),
  output_dir: z.string().optional().default('.figma').describe('Directory to save screenshots'),
  include_hidden: z.boolean().optional().default(false).describe('Include hidden children'),
  compress: z.boolean().optional().default(false).describe('Compress output via TinyJPG API (requires TINYJPG_TOKEN env var)'),
};

export interface BatchScreenshotsParams {
  file_id: string;
  node_id?: string;
  scale?: number;
  output_dir?: string;
  include_hidden?: boolean;
  compress?: boolean;
}

export interface ScreenshotEntry {
  node_id: string;
  name: string;
  node_type: string;
  file_path: string;
  width: number;
  height: number;
}

export interface BatchScreenshotsResult {
  parent_node_id: string;
  parent_name: string;
  output_dir: string;
  total_children: number;
  screenshots: ScreenshotEntry[];
  failed: Array<{ node_id: string; name: string; error: string }>;
  compression_stats?: CompressionStats;
  warning?: string;
}

type FetchImagesFn = (
  fileId: string,
  token: string,
  nodeIds: string[],
  options?: ImageExportOptions,
) => Promise<Record<string, string | null>>;

type DownloadImageFn = (url: string) => Promise<ArrayBuffer>;

/**
 * Handle batch_screenshots request.
 * Gets render URLs for all children at once via Figma API, then downloads each.
 */
export async function handleBatchScreenshots(
  params: BatchScreenshotsParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
  fetchImagesFn: FetchImagesFn,
  downloadImageFn: DownloadImageFn,
): Promise<BatchScreenshotsResult> {
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

  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error('FIGMA_TOKEN environment variable is not set.');
  }

  const raw = node.raw as Record<string, unknown>;
  const rawChildren = (raw.children ?? []) as Array<Record<string, unknown>>;
  const outputDir = prepareOutputDirectory(params.output_dir ?? '.figma');

  // Filter children
  const childrenToScreenshot = rawChildren.filter((child) => {
    if (!params.include_hidden && child.visible === false) return false;
    return true;
  });

  if (childrenToScreenshot.length === 0) {
    return {
      parent_node_id: nodeId,
      parent_name: (raw.name as string) ?? '',
      output_dir: outputDir,
      total_children: 0,
      screenshots: [],
      failed: [],
    };
  }

  const scale = params.scale ?? 1;

  // Get all child node IDs
  const childNodeIds = childrenToScreenshot.map((c) => (c.id as string) ?? '');

  // Batch fetch all render URLs at once
  const imageUrls = await fetchImagesFn(fileId, token, childNodeIds, {
    format: 'png',
    scale,
  });

  const screenshots: ScreenshotEntry[] = [];
  const failed: Array<{ node_id: string; name: string; error: string }> = [];
  const compressionResults: CompressionResult[] = [];

  // Check compression eligibility
  const shouldCompress = params.compress && !!process.env.TINYJPG_TOKEN;
  let batchWarning: string | undefined;
  if (params.compress && !process.env.TINYJPG_TOKEN) {
    batchWarning = 'compress requested but TINYJPG_TOKEN is not set — saving without compression';
  }

  // Build download list (filter out missing URLs)
  const downloadList: Array<{ id: string; url: string; child: Record<string, unknown> }> = [];
  for (const child of childrenToScreenshot) {
    const childId = (child.id as string) ?? '';
    const childName = (child.name as string) ?? '';
    const imageUrl = imageUrls[childId];
    if (!imageUrl) {
      failed.push({ node_id: childId, name: childName, error: 'No image URL returned from Figma API' });
    } else {
      downloadList.push({ id: childId, url: imageUrl, child });
    }
  }

  // Download in parallel (5 concurrent) instead of sequential
  const CONCURRENT = 5;
  for (let i = 0; i < downloadList.length; i += CONCURRENT) {
    const chunk = downloadList.slice(i, i + CONCURRENT);
    const results = await Promise.allSettled(
      chunk.map(async ({ id, url, child }) => {
        const rawBuffer = await downloadImageFn(url);
        let fileBuffer: Uint8Array = new Uint8Array(rawBuffer);

        // Compress if enabled (screenshots are always PNG)
        let compressionResult: CompressionResult | undefined;
        if (shouldCompress) {
          const { compressed, result } = await compressImageBuffer(fileBuffer);
          compressionResult = result;
          fileBuffer = compressed;
        }

        const childName = (child.name as string) ?? '';
        const safeName = childName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        const filePath = atomicWriteOutputFile(
          path.join(outputDir, `${safeName}_${nodeIdFilenamePart(id)}_screenshot.png`),
          fileBuffer,
        );

        const bbox = child.absoluteBoundingBox as
          | { width: number; height: number }
          | undefined;

        return {
          entry: {
            node_id: id,
            name: childName,
            node_type: (child.type as string) ?? 'UNKNOWN',
            file_path: filePath,
            width: Math.round(bbox?.width ?? 0),
            height: Math.round(bbox?.height ?? 0),
          },
          compressionResult,
        };
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        screenshots.push(result.value.entry);
        if (result.value.compressionResult) {
          compressionResults.push(result.value.compressionResult);
        }
      } else {
        const { id, child } = chunk[j];
        failed.push({
          node_id: id,
          name: (child.name as string) ?? '',
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    if (i + CONCURRENT < downloadList.length) {
      process.stderr.write(`Downloaded ${Math.min(i + CONCURRENT, downloadList.length)}/${downloadList.length} screenshots...\n`);
    }
  }

  // Build compression stats
  let compressionStats: CompressionStats | undefined;
  if (shouldCompress && compressionResults.length > 0) {
    const compressedCount = compressionResults.filter((r) => r.success).length;
    const failedCount = compressionResults.filter((r) => !r.success).length;
    const totalOriginal = compressionResults.reduce((sum, r) => sum + r.original_size, 0);
    const totalCompressed = compressionResults.reduce((sum, r) => sum + r.compressed_size, 0);
    const totalSavingsPercent = totalOriginal > 0
      ? Math.round(((totalOriginal - totalCompressed) / totalOriginal) * 1000) / 10
      : 0;

    compressionStats = {
      total_images: compressionResults.length,
      compressed_count: compressedCount,
      failed_count: failedCount,
      total_original_bytes: totalOriginal,
      total_compressed_bytes: totalCompressed,
      total_savings_percent: totalSavingsPercent,
    };
  }

  return {
    parent_node_id: nodeId,
    parent_name: (raw.name as string) ?? '',
    output_dir: outputDir,
    total_children: childrenToScreenshot.length,
    screenshots,
    failed,
    compression_stats: compressionStats,
    warning: batchWarning,
  };
}
