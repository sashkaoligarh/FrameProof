import * as fs from 'node:fs';
import * as path from 'node:path';
import { captureLiveViewport, launchChromium, redactUrl } from './browser.js';
import { comparePngRmse, cropPng, identifyPng } from './image.js';
import {
  copyImageReference,
  createFigmaReferenceSession,
  exportFigmaReference,
  type FigmaReferenceResult,
  type FigmaReferenceSession,
} from './figma-reference.js';
import {
  DEFAULT_VIEWPORTS,
  REAL_FLOW_VIEWPORTS,
  worstVerdict,
  type GateCheck,
  type GateCheckVerdict,
  type ComparisonMode,
  type GateReport,
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
export const MAX_CAPTURE_VIEWPORT_WIDTH = 4_096;
export const MAX_CAPTURE_VIEWPORT_HEIGHT = 10_000;

export async function runVisualGate(options: VisualGateOptions): Promise<GateReport> {
  const viewports = resolveGateViewports(options);
  if (viewports.length === 0) throw new Error('At least one viewport is required.');
  for (const viewport of viewports) validateViewport(viewport);
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const sizeTolerance = options.sizeTolerance ?? DEFAULT_SIZE_TOLERANCE;
  const runDir = resolveRunDir(options.outputDir ?? '.pixel-perfect/figma-gate', options.name ?? options.selector);
  fs.mkdirSync(runDir, { recursive: true });

  const browser = await launchChromium();
  const results: GateViewportResult[] = [];
  const exactViewportNames = viewports
    .filter((viewport) => comparisonModeOf(viewport) === 'exact-frame')
    .map((viewport) => viewport.name);
  let figmaSession: FigmaReferenceSession | undefined;
  const getFigmaSession = () => figmaSession ??= createFigmaReferenceSession();
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
        reference = await resolveReferenceForViewport(
          options,
          viewport.referenceName ?? viewport.name,
          referenceDir,
          getFigmaSession,
        );
        checks.push(row('Figma reference', 'PASS', `source=${reference.kind}; ${reference.source}`, reference.imagePath));
      } catch (error) {
        checks.push(row('Figma reference', 'FAIL', error instanceof Error ? error.message : String(error)));
      }

      const hasSpecificReference = Boolean(
        options.figmaImages?.[viewport.referenceName ?? viewport.name]
        || options.figmaUrls?.[viewport.referenceName ?? viewport.name],
      );
      const captureViewport = reference
        ? resolveCaptureViewport(viewport, reference, hasSpecificReference || exactViewportNames.length === 1)
        : viewport;
      const comparisonMode = comparisonModeOf(captureViewport);
      if (comparisonMode === 'responsive-flow') {
        checks.push(row(
          'Viewport purpose',
          'PASS',
          'behavior-only; validates DOM geometry, semantic visibility, and overflow but does not provide pixel acceptance',
        ));
        checks.push(row(
          'Exact-frame pixel coverage',
          exactViewportNames.length > 0 ? 'PASS' : 'FAIL',
          exactViewportNames.length > 0
            ? `pixel acceptance is provided only by exact-frame viewports: ${exactViewportNames.join(', ')}`
            : 'at least one exact-frame viewport is required for pixel acceptance',
        ));
      }

      const capture = await captureLiveViewport({
        pageUrl: options.pageUrl,
        selector: options.selector,
        viewport: captureViewport,
        outputDir: liveDir,
        waitMs: options.waitMs ?? 500,
        browser,
      });

      checks.push(row(
        'HTTP/live capture',
        capture.ok && capture.pageErrors.length === 0 ? 'PASS' : 'FAIL',
        `status=${capture.status}; pageErrors=${formatDetails(capture.pageErrors)}`,
        reference?.imagePath,
        capture.fullPath ?? undefined,
      ));
      checks.push(row(
        'Console/request errors',
        capture.consoleMessages.length === 0 && capture.failedRequests.length === 0 ? 'PASS' : 'FAIL',
        `console=${formatDetails(capture.consoleMessages)}; failedRequests=${formatDetails(capture.failedRequests)}`,
        reference?.imagePath,
        capture.domPath ?? capture.fullPath ?? undefined,
      ));
      checks.push(row(
        'Horizontal overflow',
        capture.domReport && !capture.domReport.horizontalOverflow ? 'PASS' : 'FAIL',
        `scrollWidth=${capture.domReport?.scrollWidth ?? 'n/a'}; viewport=${captureViewport.width}`,
        reference?.imagePath,
        capture.domPath ?? undefined,
      ));
      if (options.realFlow) {
        const semanticIssues = capture.domReport?.semanticVisibilityIssues ?? [];
        checks.push(row(
          'Real DOM semantic visibility',
          capture.domReport && semanticIssues.length === 0 ? 'PASS' : 'FAIL',
          !capture.domReport
            ? 'DOM report is unavailable'
            : semanticIssues.length === 0
              ? 'all semantic text nodes are visible'
              : JSON.stringify(semanticIssues.slice(0, 12)),
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
      if (comparisonMode === 'responsive-flow') {
        const focusRect = capture.domReport?.focus?.rect;
        const hasNonzeroGeometry = Boolean(
          focusRect
          && Number.isFinite(focusRect.width)
          && Number.isFinite(focusRect.height)
          && focusRect.width > 0
          && focusRect.height > 0,
        );
        checks.push(row(
          'Behavior-only selector geometry',
          hasNonzeroGeometry ? 'PASS' : 'FAIL',
          focusRect
            ? `selector rect=${focusRect.width}x${focusRect.height} at ${focusRect.x},${focusRect.y}`
            : 'selector is absent from the DOM report',
          reference?.nodePath ?? reference?.imagePath,
          capture.domPath ?? undefined,
        ));
      }

      if (reference && capture.focusPath) {
        checks.push(...evaluateImages(
          reference,
          capture.focusPath,
          diffDir,
          threshold,
          sizeTolerance,
          options.strictSize ?? true,
          comparisonMode,
        ));
      }

      results.push({
        viewport: captureViewport,
        verdict: worstVerdict(checks.map((check) => check.verdict)),
        checks,
        referencePath: reference?.imagePath,
        livePath: capture.focusPath ?? undefined,
        domPath: capture.domPath ?? undefined,
        diagnostics: {
          status: capture.status,
          ok: capture.ok,
          fullPath: capture.fullPath ?? undefined,
          consoleMessages: capture.consoleMessages,
          failedRequests: capture.failedRequests,
          pageErrors: capture.pageErrors,
        },
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
    pageUrl: redactUrl(options.pageUrl),
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
  comparisonMode: ComparisonMode,
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
  if (comparisonMode === 'responsive-flow') {
    checks.push(row(
      'Image size semantics',
      'SKIP',
      `behavior-only viewport; figma=${figmaSize.width}x${figmaSize.height}; live=${liveSize.width}x${liveSize.height}; no pixel verdict`,
      reference.imagePath,
      livePath,
    ));
    checks.push(row(
      'Figma vs live RMSE',
      'SKIP',
      'behavior-only viewport; RMSE is intentionally not used and exact-frame viewports remain required for pixel acceptance',
      reference.imagePath,
      livePath,
    ));
    return checks;
  }

  checks.push(row(
    'Image size semantics',
    sizeMatches ? 'PASS' : strictSize ? 'FAIL' : 'REVIEW',
    `mode=${comparisonMode}; figma=${figmaSize.width}x${figmaSize.height}; live=${liveSize.width}x${liveSize.height}; delta=${widthDelta}x${heightDelta}`,
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
  getFigmaSession: () => FigmaReferenceSession,
): Promise<FigmaReferenceResult> {
  const imagePath = options.figmaImages?.[viewportName] ?? options.figmaImage;
  if (imagePath) return copyImageReference(imagePath, outputDir);

  const figmaUrl = options.figmaUrls?.[viewportName] ?? options.figmaUrl;
  if (figmaUrl) return exportFigmaReference(figmaUrl, outputDir, 1, getFigmaSession());

  throw new Error(`No Figma URL or reference image configured for viewport "${viewportName}".`);
}

function row(
  check: string,
  verdict: GateCheckVerdict,
  notes: string,
  figmaSource?: string,
  liveSource?: string,
): GateCheck {
  return { check, verdict, notes, figmaSource, liveSource };
}

function comparisonModeOf(viewport: ViewportPreset): ComparisonMode {
  return viewport.comparisonMode ?? (viewport.preserveWidth ? 'responsive-flow' : 'exact-frame');
}

function resolveCaptureViewport(
  viewport: ViewportPreset,
  reference: FigmaReferenceResult,
  followReferenceWidth: boolean,
): ViewportPreset {
  if (comparisonModeOf(viewport) !== 'exact-frame' || !followReferenceWidth) return viewport;

  const referenceSize = identifyPng(reference.imagePath);
  if (!referenceSize) throw new Error(`Could not read Figma reference dimensions: ${reference.imagePath}`);
  if (referenceSize.width > MAX_CAPTURE_VIEWPORT_WIDTH) {
    throw new RangeError(
      `Figma reference width ${referenceSize.width}px exceeds the maximum capture viewport width of ${MAX_CAPTURE_VIEWPORT_WIDTH}px.`,
    );
  }
  return { ...viewport, width: referenceSize.width };
}

function resolveGateViewports(options: VisualGateOptions): ViewportPreset[] {
  if (options.viewports) return options.viewports;

  const specificNames = new Set([
    ...Object.keys(options.figmaUrls ?? {}),
    ...Object.keys(options.figmaImages ?? {}),
  ]);
  if (specificNames.size > 0) {
    const exact = DEFAULT_VIEWPORTS.filter((viewport) => specificNames.has(viewport.name));
    if (options.realFlow && specificNames.has('desktop')) {
      exact.push(REAL_FLOW_VIEWPORTS.find((viewport) => viewport.name === 'ultrawide')!);
    }
    return exact;
  }

  if (options.figmaUrl || options.figmaImage) {
    const desktop = DEFAULT_VIEWPORTS.find((viewport) => viewport.name === 'desktop')!;
    if (!options.realFlow) return [desktop];
    const ultrawide = REAL_FLOW_VIEWPORTS.find((viewport) => viewport.name === 'ultrawide')!;
    return [desktop, ultrawide];
  }

  return options.realFlow ? REAL_FLOW_VIEWPORTS : DEFAULT_VIEWPORTS;
}

function validateViewport(viewport: ViewportPreset): void {
  if (!Number.isInteger(viewport.width) || viewport.width < 1 || viewport.width > MAX_CAPTURE_VIEWPORT_WIDTH) {
    throw new RangeError(
      `Viewport "${viewport.name}" width must be an integer between 1 and ${MAX_CAPTURE_VIEWPORT_WIDTH}px.`,
    );
  }
  if (!Number.isInteger(viewport.height) || viewport.height < 1 || viewport.height > MAX_CAPTURE_VIEWPORT_HEIGHT) {
    throw new RangeError(
      `Viewport "${viewport.name}" height must be an integer between 1 and ${MAX_CAPTURE_VIEWPORT_HEIGHT}px.`,
    );
  }
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
    lines.push('### Capture diagnostics');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(viewport.diagnostics, null, 2));
    lines.push('```');
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function formatDetails(values: unknown[]): string {
  return values.length === 0 ? 'none' : JSON.stringify(values);
}
