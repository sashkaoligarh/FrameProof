import * as fs from 'node:fs';
import * as path from 'node:path';
import { captureLiveViewport, launchChromium } from './browser.js';
import { comparePngRmse, cropPng, identifyPng } from './image.js';
import { copyImageReference, exportFigmaReference, type FigmaReferenceResult } from './figma-reference.js';
import {
  DEFAULT_VIEWPORTS,
  REAL_FLOW_VIEWPORTS,
  worstVerdict,
  type GateCheck,
  type GateReport,
  type GateVerdict,
  type GateViewportResult,
  type ViewportPreset,
} from './types.js';

export interface VisualGateOptions {
  pageUrl: string;
  selector: string;
  outputDir?: string;
  name?: string;
  viewports?: ViewportPreset[];
  figmaUrl?: string;
  figmaUrls?: Record<string, string | undefined>;
  figmaImage?: string;
  figmaImages?: Record<string, string | undefined>;
  threshold?: number;
  sizeTolerance?: number;
  strictSize?: boolean;
  failOnReview?: boolean;
  waitMs?: number;
  realFlow?: boolean;
}

const DEFAULT_THRESHOLD = 0.025;
const DEFAULT_SIZE_TOLERANCE = 2;

export async function runVisualGate(options: VisualGateOptions): Promise<GateReport> {
  const viewports = options.viewports ?? (options.realFlow ? REAL_FLOW_VIEWPORTS : DEFAULT_VIEWPORTS);
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const sizeTolerance = options.sizeTolerance ?? DEFAULT_SIZE_TOLERANCE;
  const runDir = resolveRunDir(options.outputDir ?? '.pixel-perfect/figma-gate', options.name ?? options.selector);
  fs.mkdirSync(runDir, { recursive: true });

  const browser = await launchChromium();
  const results: GateViewportResult[] = [];
  try {
    for (const viewport of viewports) {
      const viewportDir = path.join(runDir, viewport.name);
      const referenceDir = path.join(viewportDir, 'figma');
      const liveDir = path.join(viewportDir, 'live');
      const diffDir = path.join(viewportDir, 'diff');
      fs.mkdirSync(referenceDir, { recursive: true });
      fs.mkdirSync(liveDir, { recursive: true });
      fs.mkdirSync(diffDir, { recursive: true });

      const checks: GateCheck[] = [];
      let reference: FigmaReferenceResult | null = null;
      try {
        reference = await resolveReferenceForViewport(options, viewport.referenceName ?? viewport.name, referenceDir);
        checks.push(row('Figma reference', 'PASS', `source=${reference.kind}; ${reference.source}`, reference.imagePath));
      } catch (error) {
        checks.push(row('Figma reference', 'FAIL', error instanceof Error ? error.message : String(error)));
      }

      const capture = await captureLiveViewport({
        pageUrl: options.pageUrl,
        selector: options.selector,
        viewport,
        outputDir: liveDir,
        waitMs: options.waitMs ?? 500,
        browser,
      });

      checks.push(row(
        'HTTP/live capture',
        capture.ok && capture.pageErrors.length === 0 ? 'PASS' : 'FAIL',
        `status=${capture.status}; pageErrors=${capture.pageErrors.length}`,
        reference?.imagePath,
        capture.fullPath ?? undefined,
      ));
      checks.push(row(
        'Console/request errors',
        capture.consoleMessages.length === 0 && capture.failedRequests.length === 0 ? 'PASS' : 'FAIL',
        `console=${capture.consoleMessages.length}; failedRequests=${capture.failedRequests.length}`,
        reference?.imagePath,
        capture.domPath ?? capture.fullPath ?? undefined,
      ));
      checks.push(row(
        'Horizontal overflow',
        capture.domReport?.horizontalOverflow ? 'FAIL' : 'PASS',
        `scrollWidth=${capture.domReport?.scrollWidth ?? 'n/a'}; viewport=${viewport.width}`,
        reference?.imagePath,
        capture.domPath ?? undefined,
      ));
      if (options.realFlow) {
        const semanticIssues = capture.domReport?.semanticVisibilityIssues ?? [];
        checks.push(row(
          'Real DOM semantic visibility',
          semanticIssues.length === 0 ? 'PASS' : 'FAIL',
          semanticIssues.length === 0 ? 'all semantic text nodes are visible' : JSON.stringify(semanticIssues.slice(0, 12)),
          reference?.nodePath ?? reference?.imagePath,
          capture.domPath ?? undefined,
        ));
      }
      checks.push(row(
        'Focused block screenshot',
        capture.focusPath ? 'PASS' : 'FAIL',
        capture.focusPath ? `selector captured: ${options.selector}` : `selector missing: ${options.selector}`,
        reference?.imagePath,
        capture.focusPath ?? undefined,
      ));

      if (reference && capture.focusPath) {
        checks.push(...evaluateImages(reference, capture.focusPath, diffDir, threshold, sizeTolerance, options.strictSize ?? true));
      }

      results.push({
        viewport,
        verdict: worstVerdict(checks.map((check) => check.verdict)),
        checks,
        referencePath: reference?.imagePath,
        livePath: capture.focusPath ?? undefined,
        domPath: capture.domPath ?? undefined,
      });
    }
  } finally {
    await browser.close();
  }

  const report: GateReport = {
    verdict: worstVerdict(results.map((result) => result.verdict)),
    outputDir: runDir,
    reportPath: path.join(runDir, 'REPORT.md'),
    jsonPath: path.join(runDir, 'summary.json'),
    pageUrl: options.pageUrl,
    selector: options.selector,
    threshold,
    sizeTolerance,
    viewports: results,
  };

  fs.writeFileSync(report.jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(report.reportPath, renderReport(report), 'utf8');
  return report;
}

function evaluateImages(
  reference: FigmaReferenceResult,
  livePath: string,
  diffDir: string,
  threshold: number,
  sizeTolerance: number,
  strictSize: boolean,
): GateCheck[] {
  const checks: GateCheck[] = [];
  const figmaSize = identifyPng(reference.imagePath);
  const liveSize = identifyPng(livePath);
  if (!figmaSize || !liveSize) {
    checks.push(row('Image dimensions', 'FAIL', `figma=${JSON.stringify(figmaSize)}; live=${JSON.stringify(liveSize)}`, reference.imagePath, livePath));
    return checks;
  }

  const widthDelta = liveSize.width - figmaSize.width;
  const heightDelta = liveSize.height - figmaSize.height;
  const sizeMatches = Math.abs(widthDelta) <= sizeTolerance && Math.abs(heightDelta) <= sizeTolerance;
  checks.push(row(
    'Image size match',
    sizeMatches ? 'PASS' : strictSize ? 'FAIL' : 'REVIEW',
    `figma=${figmaSize.width}x${figmaSize.height}; live=${liveSize.width}x${liveSize.height}; delta=${widthDelta}x${heightDelta}`,
    reference.imagePath,
    livePath,
  ));

  let comparisonFigmaPath = reference.imagePath;
  let comparisonLivePath = livePath;
  if (figmaSize.width !== liveSize.width || figmaSize.height !== liveSize.height) {
    if (sizeMatches) {
      const commonCrop = {
        x: 0,
        y: 0,
        width: Math.min(figmaSize.width, liveSize.width),
        height: Math.min(figmaSize.height, liveSize.height),
      };
      comparisonFigmaPath = path.join(diffDir, 'figma.tolerance-crop.png');
      comparisonLivePath = path.join(diffDir, 'live.tolerance-crop.png');
      cropPng(reference.imagePath, commonCrop, comparisonFigmaPath);
      cropPng(livePath, commonCrop, comparisonLivePath);
    } else {
      checks.push(row('Figma vs live RMSE', strictSize ? 'FAIL' : 'REVIEW', 'skipped because image sizes differ', reference.imagePath, livePath));
      return checks;
    }
  }

  const diffPath = path.join(diffDir, 'figma-vs-live.diff.png');
  const diff = comparePngRmse(comparisonFigmaPath, comparisonLivePath, diffPath);
  const rmseVerdict = diff.status === 'ok' && diff.normalized !== null && diff.normalized <= threshold ? 'PASS' : 'FAIL';
  checks.push(row('Figma vs live RMSE', rmseVerdict, JSON.stringify(diff), comparisonFigmaPath, comparisonLivePath));
  return checks;
}

async function resolveReferenceForViewport(
  options: VisualGateOptions,
  viewportName: string,
  outputDir: string,
): Promise<FigmaReferenceResult> {
  const imagePath = options.figmaImages?.[viewportName] ?? options.figmaImage;
  if (imagePath) return copyImageReference(imagePath, outputDir);

  const figmaUrl = options.figmaUrls?.[viewportName] ?? options.figmaUrl;
  if (figmaUrl) return exportFigmaReference(figmaUrl, outputDir);

  throw new Error(`No Figma URL or reference image configured for viewport "${viewportName}".`);
}

function row(
  check: string,
  verdict: GateVerdict,
  notes: string,
  figmaSource?: string,
  liveSource?: string,
): GateCheck {
  return { check, verdict, notes, figmaSource, liveSource };
}

function resolveRunDir(root: string, name: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(root, `${stamp}-${slugify(name)}`);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'scope';
}

function renderReport(report: GateReport): string {
  const lines = [
    '# Figma Visual Gate Report',
    '',
    `Verdict: ${report.verdict}`,
    `Page: ${report.pageUrl}`,
    `Selector: ${report.selector}`,
    `Threshold: ${report.threshold}`,
    `Size tolerance: ${report.sizeTolerance}px`,
    '',
  ];

  for (const viewport of report.viewports) {
    lines.push(`## ${viewport.viewport.name} ${viewport.viewport.width}x${viewport.viewport.height}`);
    lines.push('');
    lines.push(`Verdict: ${viewport.verdict}`);
    lines.push('');
    lines.push('| Check | Verdict | Notes |');
    lines.push('|---|---|---|');
    for (const check of viewport.checks) {
      lines.push(`| ${escapeMd(check.check)} | ${check.verdict} | ${escapeMd(check.notes)} |`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}
