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
import { runVisualGate } from './visual/gate.js';
import { DEFAULT_VIEWPORTS, REAL_FLOW_VIEWPORTS, type ViewportPreset } from './visual/types.js';

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

program
  .command('gate')
  .description('Strict visual gate: compare a live React/Astro selector against Figma/reference screenshots')
  .option('--page-url <url>', 'Absolute live page URL')
  .option('--route <route>', 'Route relative to --base-url')
  .option('--base-url <url>', 'Base URL for --route', 'http://localhost:3000')
  .requiredOption('--selector <selector>', 'CSS selector for the live block to compare')
  .option('--figma-url <url>', 'Figma node URL used for all viewports')
  .option('--figma-url-desktop <url>', 'Desktop-specific Figma node URL')
  .option('--figma-url-tablet <url>', 'Tablet-specific Figma node URL')
  .option('--figma-url-mobile <url>', 'Mobile-specific Figma node URL')
  .option('--figma-image <path>', 'Reference image used for all viewports')
  .option('--figma-image-desktop <path>', 'Desktop-specific reference image')
  .option('--figma-image-tablet <path>', 'Tablet-specific reference image')
  .option('--figma-image-mobile <path>', 'Mobile-specific reference image')
  .option('--viewports <list>', 'Viewport names: desktop,tablet,mobile,ultrawide')
  .option('--output-dir <dir>', 'Output artifact directory', '.pixel-perfect/figma-gate')
  .option('--name <name>', 'Stable run name')
  .option('--rmse-threshold <number>', 'Normalized RMSE pass threshold', '0.025')
  .option('--size-tolerance <number>', 'Allowed image size delta in px', '2')
  .option('--wait-ms <number>', 'Extra wait after page load', '500')
  .option('--real-flow', 'Use strict desktop/tablet/mobile/ultrawide viewports plus semantic DOM checks', false)
  .option('--soft-size-mismatch', 'Size mismatch becomes REVIEW instead of FAIL', false)
  .option('--fail-on-review', 'Exit non-zero for REVIEW as well as FAIL', false)
  .action(async (opts: Record<string, unknown>) => {
    const pageUrl = resolvePageUrl(opts);
    const selector = opts.selector as string;
    const figmaUrls = compactRecord({
      desktop: opts.figmaUrlDesktop as string | undefined,
      tablet: opts.figmaUrlTablet as string | undefined,
      mobile: opts.figmaUrlMobile as string | undefined,
    });
    const figmaImages = compactRecord({
      desktop: opts.figmaImageDesktop as string | undefined,
      tablet: opts.figmaImageTablet as string | undefined,
      mobile: opts.figmaImageMobile as string | undefined,
    });

    if (!opts.figmaUrl && Object.keys(figmaUrls).length === 0 && !opts.figmaImage && Object.keys(figmaImages).length === 0) {
      process.stderr.write('Error: provide --figma-url, per-viewport --figma-url-*, --figma-image, or per-viewport --figma-image-*.\n');
      process.exit(1);
    }

    try {
      const report = await runVisualGate({
        pageUrl,
        selector,
        outputDir: opts.outputDir as string,
        name: opts.name as string | undefined,
        viewports: parseViewportList(opts.viewports as string | undefined, opts.realFlow as boolean),
        figmaUrl: opts.figmaUrl as string | undefined,
        figmaUrls,
        figmaImage: opts.figmaImage as string | undefined,
        figmaImages,
        threshold: Number(opts.rmseThreshold ?? '0.025'),
        sizeTolerance: Number(opts.sizeTolerance ?? '2'),
        strictSize: !(opts.softSizeMismatch as boolean),
        failOnReview: opts.failOnReview as boolean,
        waitMs: Number(opts.waitMs ?? '500'),
        realFlow: opts.realFlow as boolean,
      });

      console.log(`Verdict: ${report.verdict}`);
      console.log(`Report: ${report.reportPath}`);
      console.log(`Summary: ${report.jsonPath}`);

      if (report.verdict === 'FAIL' || (report.verdict === 'REVIEW' && opts.failOnReview)) {
        process.exit(1);
      }
    } catch (error) {
      process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  });

program.parse();

function resolvePageUrl(opts: Record<string, unknown>): string {
  if (opts.pageUrl) return opts.pageUrl as string;
  const route = (opts.route as string | undefined) ?? '/';
  const baseUrl = (opts.baseUrl as string | undefined) ?? 'http://localhost:3000';
  return new URL(route, baseUrl).toString();
}

function parseViewportList(value: string | undefined, realFlow: boolean): ViewportPreset[] | undefined {
  if (!value) return realFlow ? REAL_FLOW_VIEWPORTS : undefined;
  const presets = new Map([...DEFAULT_VIEWPORTS, ...REAL_FLOW_VIEWPORTS].map((viewport) => [viewport.name, viewport]));
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => {
      const preset = presets.get(name);
      if (!preset) throw new Error(`Unknown viewport "${name}". Use desktop, tablet, mobile, ultrawide.`);
      return preset;
    });
}

function compactRecord(record: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value)) as Record<string, string>;
}
