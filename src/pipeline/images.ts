/**
 * Image download pipeline.
 * Fetches render URLs from Figma API and downloads images in requested formats.
 * Optionally compresses raster images via TinyJPG API.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageToken, ImageFormat, ParseContext, CompressionResult, CompressionStats } from '../types/tokens.js';
import { fetchFigmaImages, downloadImage } from '../api/client.js';
import { isCompressibleFormat, compressImageBuffer } from '../api/tinyjpg.js';

export interface ImageDownloadResult {
  downloaded: number;
  failed: number;
  files: string[];
  compression_stats?: CompressionStats;
}

/**
 * Download all extracted images in the requested formats.
 * Creates images/<format>/ subdirectories.
 * When ctx.compress is true, compresses raster images via TinyJPG.
 */
export async function downloadImages(
  images: ImageToken[],
  ctx: ParseContext,
): Promise<ImageDownloadResult> {
  if (!ctx.export_images || images.length === 0 || ctx.image_formats.length === 0) {
    return { downloaded: 0, failed: 0, files: [] };
  }

  // US3: Early missing-token check — warn once, skip compression entirely
  const shouldCompress = ctx.compress && !!process.env.TINYJPG_TOKEN;
  if (ctx.compress && !process.env.TINYJPG_TOKEN) {
    process.stderr.write('Warning: --compress enabled but TINYJPG_TOKEN is not set. Compression skipped.\n');
  }

  const imagesDir = join(ctx.output_dir, 'images');
  const allFiles: string[] = [];
  let downloaded = 0;
  let failed = 0;

  // Compression stats accumulator
  const compressionResults: CompressionResult[] = [];
  let lastCompressionCount: number | undefined;

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
          // SVG is text — never compressed
          const response = await fetch(url, {
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const svgText = await response.text();
          await writeFile(filePath, svgText, 'utf-8');
        } else {
          // PNG/JPG/PDF are binary
          const rawBuffer = await downloadImage(url);
          let fileBuffer: Uint8Array = new Uint8Array(rawBuffer);

          // Compress if enabled and format is compressible (JPG/PNG only, skip PDF)
          if (shouldCompress && isCompressibleFormat(format)) {
            const { compressed, result } = await compressImageBuffer(fileBuffer);
            compressionResults.push(result);

            if (result.success) {
              fileBuffer = compressed;
              process.stderr.write(
                `  Compressed ${img.name}.${ext}: ${formatBytes(result.original_size)} → ${formatBytes(result.compressed_size)} (${result.savings_percent}% saved)\n`,
              );
            } else {
              process.stderr.write(
                `  Warning: Compression failed for ${img.name}.${ext}: ${result.error}\n`,
              );
            }
          }

          await writeFile(filePath, fileBuffer);
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

  // Build compression stats and log batch summary (FR-013)
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
      monthly_compression_count: lastCompressionCount,
    };

    process.stderr.write(
      `\nCompression summary: ${compressedCount}/${compressionResults.length} images compressed, ` +
      `${formatBytes(totalOriginal - totalCompressed)} saved (${totalSavingsPercent}% overall)\n`,
    );
  }

  return { downloaded, failed, files: allFiles, compression_stats: compressionStats };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
