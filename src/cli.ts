#!/usr/bin/env node
/**
 * CLI entry point for parser, visual gate, and environment diagnostics.
 * Uses commander for argument parsing (FR-009).
 * Figma credentials should be supplied through $FIGMA_TOKEN (FR-018).
 */

import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParseContext, ImageFormat } from './types/tokens.js';
import { parseFileIdOrUrl, fetchAndParse } from './pipeline/fetch.js';
import { parseDocumentTree } from './pipeline/parse.js';
import { extractAllTokens } from './pipeline/transform.js';
import { writeOutput } from './pipeline/output.js';
import { runVisualGate } from './visual/gate.js';
import { findChromeExecutable } from './visual/browser.js';
import { DEFAULT_VIEWPORTS, REAL_FLOW_VIEWPORTS, type ViewportPreset } from './visual/types.js';
import { prepareOutputDirectory, resolveOutputPath } from './mcp/utils/output-path.js';

export const program = new Command();

export const SUPPORTED_NODE_RANGE = '^20.19.0 || >=22.12.0';

program
  .name('frameproof')
  .description('Extract design tokens from Figma files')
  .version('0.1.0');

program
  .command('doctor')
  .description('Check local prerequisites without exposing credential values')
  .option('--json', 'Output a machine-readable JSON report', false)
  .action((opts: { json?: boolean }) => {
    const report = collectDoctorReport();
    console.log(opts.json ? JSON.stringify(report, null, 2) : formatDoctorReport(report));
    if (!report.ok) process.exitCode = 1;
  });

program
  .command('parse <fileIdOrUrl>')
  .description('Parse a Figma file and extract design tokens')
  .option('-t, --token <token>', 'Discouraged: process arguments may leak secrets; prefer $FIGMA_TOKEN')
  .option('-o, --output <dir>', 'Output directory', './figma-output')
  .option('-f, --format <format>', 'Output format: all, json, css, context', 'all')
  .option('-p, --page <name>', 'Filter by page name')
  .option('-n, --node <id>', 'Filter by node ID')
  .option('--include-hidden', 'Include hidden layers', false)
  .option('--export-images', 'Download images (icons as SVG, rasters as PNG)', false)
  .option('--image-format <formats>', 'Image formats: svg,png,jpg,pdf (comma-separated)', 'svg,png')
  .option('--image-scale <scale>', 'Scale for PNG/JPG (1-4, e.g. 2 for retina)', '1')
  .option('--compress', 'Compress raster images via TinyJPG API (requires TINYJPG_TOKEN)', false)
  .action(async (fileIdOrUrl: string, opts: Record<string, unknown>) => {
    const startTime = Date.now();

    // Keep --token for compatibility, but do not encourage credentials in process arguments.
    const token = (opts.token as string) ?? process.env.FIGMA_TOKEN;
    if (!token) {
      process.stderr.write('Error: Figma API token required. Set FIGMA_TOKEN in the environment.\n');
      process.exit(1);
      return;
    }
    if (opts.token) {
      process.stderr.write(
        'Warning: --token may expose credentials in process listings and shell history; prefer FIGMA_TOKEN.\n',
      );
    }

    // Validate format
    const validFormats = ['all', 'json', 'css', 'context'];
    const format = opts.format as string;
    if (!validFormats.includes(format)) {
      process.stderr.write(
        `Error: Invalid format "${format}". Must be one of: ${validFormats.join(', ')}\n`,
      );
      process.exit(1);
      return;
    }

    // Parse image formats
    const imageFormatsStr = (opts.imageFormat as string) ?? 'svg,png';
    const validImageFormats = ['svg', 'png', 'jpg', 'pdf'];
    const imageFormats = imageFormatsStr.split(',').map((f: string) => f.trim()) as ImageFormat[];
    for (const f of imageFormats) {
      if (!validImageFormats.includes(f)) {
        process.stderr.write(`Error: Invalid image format "${f}". Must be: ${validImageFormats.join(', ')}\n`);
        process.exit(1);
        return;
      }
    }

    const compress = opts.compress as boolean;

    // FR-003: When --compress is enabled and --image-scale was not explicitly provided, default to 2x
    const rawScale = opts.imageScale as string;
    let parsedScale: number;
    try {
      parsedScale = parseFiniteNumberInRange(rawScale, '--image-scale', 1, 4);
    } catch (error) {
      process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
      return;
    }
    const explicitlySetScale = process.argv.some(
      (argument) => argument === '--image-scale' || argument.startsWith('--image-scale='),
    );
    const imageScale = explicitlySetScale ? parsedScale : (compress ? 2 : parsedScale);

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
  .option('--real-flow', 'Check available exact breakpoint references plus behavior-only ultrawide when desktop exists', false)
  .option('--soft-size-mismatch', 'Size mismatch becomes REVIEW instead of FAIL', false)
  .option('--fail-on-review', 'Exit non-zero for REVIEW as well as FAIL', false)
  .action(async (opts: Record<string, unknown>) => {
    try {
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
        throw new Error('provide --figma-url, per-viewport --figma-url-*, --figma-image, or per-viewport --figma-image-*.');
      }

      const threshold = parseFiniteNumberInRange(
        String(opts.rmseThreshold ?? '0.025'),
        '--rmse-threshold',
        0,
        1,
      );
      const sizeTolerance = parseNonnegativeInteger(
        String(opts.sizeTolerance ?? '2'),
        '--size-tolerance',
      );
      const waitMs = parseNonnegativeInteger(String(opts.waitMs ?? '500'), '--wait-ms');
      const viewports = parseViewportList(opts.viewports as string | undefined);

      const report = await runVisualGate({
        pageUrl,
        selector,
        outputDir: opts.outputDir as string,
        name: opts.name as string | undefined,
        viewports,
        figmaUrl: opts.figmaUrl as string | undefined,
        figmaUrls,
        figmaImage: opts.figmaImage as string | undefined,
        figmaImages,
        threshold,
        sizeTolerance,
        strictSize: !(opts.softSizeMismatch as boolean),
        failOnReview: opts.failOnReview as boolean,
        waitMs,
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

if (isDirectExecution()) program.parse();

export type DoctorStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  name: 'node' | 'figma_token' | 'chrome' | 'output_root' | 'tinyjpg_token';
  status: DoctorStatus;
  blocker: boolean;
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

export function collectDoctorReport(): DoctorReport {
  const checks: DoctorCheck[] = [];
  const nodeVersion = process.versions.node;
  checks.push(doctorCheck(
    'node',
    isSupportedNodeVersion(nodeVersion),
    `Node.js v${nodeVersion} (requires ${SUPPORTED_NODE_RANGE})`,
    `Node.js v${nodeVersion} is unsupported; install ${SUPPORTED_NODE_RANGE}.`,
  ));

  checks.push(doctorCheck(
    'figma_token',
    Boolean(process.env.FIGMA_TOKEN?.trim()),
    'FIGMA_TOKEN is configured (value hidden).',
    'FIGMA_TOKEN is not configured.',
  ));

  const chromePath = findChromeExecutable();
  let chromeExecutable = false;
  if (chromePath) {
    try {
      fs.accessSync(chromePath, fs.constants.X_OK);
      const probe = spawnSync(chromePath, ['--version'], {
        encoding: 'utf8',
        timeout: 5_000,
        windowsHide: true,
      });
      chromeExecutable = probe.status === 0 && /chrom(?:e|ium)/i.test(`${probe.stdout}\n${probe.stderr}`);
    } catch {
      chromeExecutable = false;
    }
  }
  checks.push(doctorCheck(
    'chrome',
    chromeExecutable,
    `Chrome/Chromium is available at ${chromePath}.`,
    chromePath
      ? `Chrome/Chromium was found at ${chromePath}, but it is not executable or did not identify as Chrome/Chromium.`
      : 'Chrome/Chromium was not found; set CHROME_BIN or CHROMIUM_BIN.',
  ));

  try {
    const outputRoot = prepareOutputDirectory('.');
    let sandboxRejectedEscape = false;
    try {
      resolveOutputPath('../frameproof-doctor-escape');
    } catch {
      sandboxRejectedEscape = true;
    }
    if (!sandboxRejectedEscape) throw new Error('safe output-root traversal was not rejected');

    const probePath = path.join(outputRoot, `.frameproof-doctor-${randomUUID()}`);
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(probePath, 'wx', 0o600);
      fs.writeFileSync(descriptor, 'ok', 'utf8');
      fs.closeSync(descriptor);
      descriptor = undefined;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(probePath)) fs.unlinkSync(probePath);
    }
    checks.push(doctorCheck(
      'output_root',
      true,
      `Safe output root is writable and sandboxed at ${outputRoot}.`,
      '',
    ));
  } catch (error) {
    checks.push(doctorCheck(
      'output_root',
      false,
      '',
      `Safe output root is not writable or usable: ${error instanceof Error ? error.message : String(error)}`,
    ));
  }

  const tinyJpgConfigured = Boolean(process.env.TINYJPG_TOKEN?.trim());
  checks.push({
    name: 'tinyjpg_token',
    status: tinyJpgConfigured ? 'pass' : 'warn',
    blocker: false,
    message: tinyJpgConfigured
      ? 'TINYJPG_TOKEN is configured (value hidden).'
      : 'TINYJPG_TOKEN is not configured; image compression remains optional.',
  });

  return { ok: !checks.some((check) => check.blocker), checks };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = report.checks.map(
    (check) => `${check.status.toUpperCase().padEnd(4)} ${check.message}`,
  );
  lines.push(`Overall: ${report.ok ? 'READY' : 'BLOCKED'}`);
  return lines.join('\n');
}

export function isSupportedNodeVersion(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major === 20) return minor >= 19;
  if (major === 21 || major < 20) return false;
  if (major === 22) return minor >= 12;
  return major > 22;
}

export function parseFiniteNumberInRange(
  value: string,
  optionName: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${optionName} must be a finite number from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

export function parseNonnegativeInteger(value: string, optionName: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a nonnegative integer.`);
  }
  return parsed;
}

function doctorCheck(
  name: DoctorCheck['name'],
  passed: boolean,
  passMessage: string,
  failMessage: string,
): DoctorCheck {
  return {
    name,
    status: passed ? 'pass' : 'fail',
    blocker: !passed,
    message: passed ? passMessage : failMessage,
  };
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

function resolvePageUrl(opts: Record<string, unknown>): string {
  if (opts.pageUrl) return opts.pageUrl as string;
  const route = (opts.route as string | undefined) ?? '/';
  const baseUrl = (opts.baseUrl as string | undefined) ?? 'http://localhost:3000';
  return new URL(route, baseUrl).toString();
}

function parseViewportList(value: string | undefined): ViewportPreset[] | undefined {
  if (!value) return undefined;
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
