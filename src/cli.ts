#!/usr/bin/env node
/**
 * CLI entry point — `figma-scaler parse <fileId>`.
 * Uses commander for argument parsing (FR-009).
 * Token is read from --token or $FIGMA_TOKEN env (FR-018).
 */

import { Command } from 'commander';
import type { ParseContext, ImageFormat } from './types/tokens.js';
import { parseFileIdOrUrl, fetchAndParse } from './pipeline/fetch.js';
import { parseDocumentTree } from './pipeline/parse.js';
import { extractAllTokens } from './pipeline/transform.js';
import { writeOutput } from './pipeline/output.js';

const program = new Command();

program
  .name('figma-scaler')
  .description('Extract design tokens from Figma files')
  .version('0.1.0');

program
  .command('parse <fileIdOrUrl>')
  .description('Parse a Figma file and extract design tokens')
  .option('-t, --token <token>', 'Figma API token (or set $FIGMA_TOKEN)')
  .option('-o, --output <dir>', 'Output directory', './figma-output')
  .option('-f, --format <format>', 'Output format: all, json, css, context', 'all')
  .option('-p, --page <name>', 'Filter by page name')
  .option('-n, --node <id>', 'Filter by node ID')
  .option('--include-hidden', 'Include hidden layers', false)
  .option('--export-images', 'Download images (icons as SVG, rasters as PNG)', false)
  .option('--image-format <formats>', 'Image formats: svg,png,jpg (comma-separated)', 'svg,png')
  .option('--image-scale <scale>', 'Scale for PNG/JPG (1-4, e.g. 2 for retina)', '1')
  .option('--compress', 'Compress raster images via TinyJPG API (requires TINYJPG_TOKEN)', false)
  .action(async (fileIdOrUrl: string, opts: Record<string, unknown>) => {
    const startTime = Date.now();

    // Resolve token
    const token = (opts.token as string) ?? process.env.FIGMA_TOKEN;
    if (!token) {
      process.stderr.write(
        'Error: Figma API token required. Use --token or set $FIGMA_TOKEN environment variable.\n',
      );
      process.exit(1);
    }

    // Validate format
    const validFormats = ['all', 'json', 'css', 'context'];
    const format = opts.format as string;
    if (!validFormats.includes(format)) {
      process.stderr.write(
        `Error: Invalid format "${format}". Must be one of: ${validFormats.join(', ')}\n`,
      );
      process.exit(1);
    }

    // Parse image formats
    const imageFormatsStr = (opts.imageFormat as string) ?? 'svg,png';
    const validImageFormats = ['svg', 'png', 'jpg', 'pdf'];
    const imageFormats = imageFormatsStr.split(',').map((f: string) => f.trim()) as ImageFormat[];
    for (const f of imageFormats) {
      if (!validImageFormats.includes(f)) {
        process.stderr.write(`Error: Invalid image format "${f}". Must be: ${validImageFormats.join(', ')}\n`);
        process.exit(1);
      }
    }

    const compress = opts.compress as boolean;

    // FR-003: When --compress is enabled and --image-scale was not explicitly provided, default to 2x
    const rawScale = opts.imageScale as string;
    const explicitlySetScale = process.argv.includes('--image-scale');
    const imageScale = explicitlySetScale
      ? (parseFloat(rawScale) || 1)
      : (compress ? 2 : (parseFloat(rawScale) || 1));

    const ctx: ParseContext = {
      file_id: parseFileIdOrUrl(fileIdOrUrl),
      token,
      output_dir: opts.output as string,
      format: format as ParseContext['format'],
      page_filter: opts.page as string | undefined,
      node_filter: opts.node as string | undefined,
      include_hidden: opts.includeHidden as boolean,
      export_images: opts.exportImages as boolean,
      image_formats: imageFormats,
      image_scale: imageScale,
      compress,
    };

    try {
      // Stage 1: Fetch
      const file = await fetchAndParse(ctx);

      // Stage 2: Parse
      const nodes = parseDocumentTree(file.document, {
        includeHidden: ctx.include_hidden,
        pageFilter: ctx.page_filter,
        nodeFilter: ctx.node_filter,
      });

      process.stderr.write(`Parsed ${nodes.length} nodes.\n`);

      // T064: Warn about large files
      if (nodes.length > 10_000 && !ctx.page_filter && !ctx.node_filter) {
        process.stderr.write(
          `Warning: Large file (${nodes.length} nodes). Consider using --page or --node to filter.\n`,
        );
      }

      // Stage 3: Transform
      process.stderr.write('Extracting design tokens...\n');
      const tokens = extractAllTokens(nodes, file.styles, file.components, file.component_sets);
      process.stderr.write(
        `Extracted: ${tokens.colors.length} colors, ${tokens.typography.length} typography, ${tokens.spacing.length} spacing, ${tokens.radii.length} radii, ${tokens.shadows.length} shadows, ${tokens.gradients.length} gradients, ${tokens.images.length} images, ${tokens.components.length} components\n`,
      );

      // Stage 4: Output
      process.stderr.write('Writing output files...\n');
      const result = await writeOutput(tokens, file, ctx, nodes.length);

      // Final summary to stdout
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const summary = [
        `File: ${file.name}`,
        `Tokens: ${tokens.colors.length} colors, ${tokens.gradients.length} gradients, ${tokens.typography.length} typography, ${tokens.spacing.length} spacing, ${tokens.radii.length} radii, ${tokens.shadows.length} shadows, ${tokens.images.length} images`,
        `Components: ${tokens.components.length}`,
        `Output: ${result.output_dir} (${result.files_written.length} files)`,
        `Time: ${elapsed}s`,
      ];
      console.log(summary.join('\n'));

      process.exit(0);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Determine exit code based on error type
      if (err.name === 'FigmaApiError') {
        process.stderr.write(`API Error: ${err.message}\n`);
        process.exit(2);
      }

      if (err.message.includes('ENOENT') || err.message.includes('EACCES')) {
        process.stderr.write(`File System Error: ${err.message}\n`);
        process.exit(3);
      }

      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    }
  });

program.parse();
