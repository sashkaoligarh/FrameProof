/**
 * Image download pipeline.
 * Fetches render URLs from Figma API and downloads images in requested formats.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageToken, ImageFormat, ParseContext } from '../types/tokens.js';
import { fetchFigmaImages, downloadImage } from '../api/client.js';

export interface ImageDownloadResult {
  downloaded: number;
  failed: number;
  files: string[];
}

/**
 * Download all extracted images in the requested formats.
 * Creates images/<format>/ subdirectories.
 */
export async function downloadImages(
  images: ImageToken[],
  ctx: ParseContext,
): Promise<ImageDownloadResult> {
  if (!ctx.export_images || images.length === 0 || ctx.image_formats.length === 0) {
    return { downloaded: 0, failed: 0, files: [] };
  }

  const imagesDir = join(ctx.output_dir, 'images');
  const allFiles: string[] = [];
  let downloaded = 0;
  let failed = 0;

  // Get all node IDs that need rendering
  const nodeIds = images.map((img) => img.node_id);

  for (const format of ctx.image_formats) {
    const formatDir = ctx.image_formats.length > 1
      ? join(imagesDir, format)
      : imagesDir;
    await mkdir(formatDir, { recursive: true });

    process.stderr.write(`Fetching ${format.toUpperCase()} render URLs for ${nodeIds.length} nodes...\n`);

    // Figma API batches: max ~100 nodes per request
    const batchSize = 100;
    const urls: Record<string, string | null> = {};

    for (let i = 0; i < nodeIds.length; i += batchSize) {
      const batch = nodeIds.slice(i, i + batchSize);
      const batchUrls = await fetchFigmaImages(ctx.file_id, ctx.token, batch, {
        format,
        scale: format === 'svg' ? undefined : ctx.image_scale,
      });
      Object.assign(urls, batchUrls);
    }

    // Download each image
    for (const img of images) {
      const url = urls[img.node_id];
      if (!url) {
        process.stderr.write(`Warning: No render URL for node ${img.node_id} (${img.name})\n`);
        failed++;
        continue;
      }

      try {
        const ext = format === 'jpg' ? 'jpg' : format;
        const fileName = `${img.file_name}.${ext}`;
        const filePath = join(formatDir, fileName);

        if (format === 'svg') {
          // SVG is text
          const response = await fetch(url, {
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const svgText = await response.text();
          await writeFile(filePath, svgText, 'utf-8');
        } else {
          // PNG/JPG/PDF are binary
          const buffer = await downloadImage(url);
          await writeFile(filePath, Buffer.from(buffer));
        }

        img.downloaded = true;
        img.formats_downloaded.push(format);
        allFiles.push(filePath);
        downloaded++;

        if (downloaded % 10 === 0) {
          process.stderr.write(`  Downloaded ${downloaded}/${images.length * ctx.image_formats.length}...\n`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Warning: Failed to download ${img.name} as ${format}: ${msg}\n`);
        failed++;
      }
    }
  }

  process.stderr.write(`Images: ${downloaded} downloaded, ${failed} failed\n`);

  return { downloaded, failed, files: allFiles };
}
