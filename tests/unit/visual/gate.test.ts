import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureLiveOptions, LiveCaptureResult } from '../../../src/visual/browser.js';
import type { FigmaReferenceResult, FigmaReferenceSession } from '../../../src/visual/figma-reference.js';

const mocks = vi.hoisted(() => ({
  browserClose: vi.fn(),
  captureLiveViewport: vi.fn(),
  createFigmaReferenceSession: vi.fn(),
  exportFigmaReference: vi.fn(),
  launchChromium: vi.fn(),
}));

vi.mock('../../../src/visual/browser.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/visual/browser.js')>();
  return {
    ...actual,
    captureLiveViewport: mocks.captureLiveViewport,
    launchChromium: mocks.launchChromium,
  };
});

vi.mock('../../../src/visual/figma-reference.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/visual/figma-reference.js')>();
  return {
    ...actual,
    createFigmaReferenceSession: mocks.createFigmaReferenceSession,
    exportFigmaReference: mocks.exportFigmaReference,
  };
});

import { MAX_CAPTURE_VIEWPORT_WIDTH, runVisualGate } from '../../../src/visual/gate.js';

const temporaryDirs: string[] = [];
let liveColor: [number, number, number, number];

beforeEach(() => {
  vi.clearAllMocks();
  liveColor = [255, 255, 255, 255];
  mocks.launchChromium.mockResolvedValue({ close: mocks.browserClose });
  mocks.captureLiveViewport.mockImplementation(defaultCapture);
});

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('visual gate comparison semantics', () => {
  it('uses one global real-flow reference only for desktop and behavior-only ultrawide', async () => {
    const root = temporaryDir();
    const referencePath = path.join(root, 'reference.png');
    writePng(referencePath, 100, 60, [255, 255, 255, 255]);

    const report = await runVisualGate({
      pageUrl: 'http://example.test/',
      selector: '.focus',
      outputDir: root,
      figmaImage: referencePath,
      realFlow: true,
      waitMs: 0,
    });

    expect(report.viewports.map((result) => result.viewport.name)).toEqual(['desktop', 'ultrawide']);
    expect(report.viewports[0]?.viewport.width).toBe(100);
    expect(report.viewports[1]?.viewport.width).toBe(2412);
  });

  it('does not collapse multiple explicit exact viewports to one global reference width', async () => {
    const root = temporaryDir();
    const referencePath = path.join(root, 'reference.png');
    writePng(referencePath, 100, 60, [255, 255, 255, 255]);

    const report = await runVisualGate({
      pageUrl: 'http://example.test/',
      selector: '.focus',
      outputDir: root,
      figmaImage: referencePath,
      viewports: [
        { name: 'desktop', width: 100, height: 60 },
        { name: 'mobile', width: 50, height: 60 },
      ],
      waitMs: 0,
    });

    expect(report.viewports.map((result) => result.viewport.width)).toEqual([100, 50]);
    expect(report.viewports[1]?.checks.find((check) => check.check === 'Image size semantics')?.verdict).toBe('FAIL');
  });

  it('uses reference width for exact frames and labels responsive checks as behavior-only', async () => {
    const root = temporaryDir();
    const referencePath = path.join(root, 'reference.png');
    writePng(referencePath, 100, 60, [255, 255, 255, 255]);

    const report = await runVisualGate({
      pageUrl: 'http://example.test/',
      selector: '.focus',
      outputDir: root,
      figmaImage: referencePath,
      viewports: [
        { name: 'exact', width: 140, height: 60 },
        { name: 'responsive', width: 140, height: 60, comparisonMode: 'responsive-flow' },
      ],
      waitMs: 0,
    });

    const exact = report.viewports[0];
    const responsive = report.viewports[1];
    expect(exact?.viewport.width).toBe(100);
    expect(exact?.checks.find((check) => check.check === 'Image size semantics')?.verdict).toBe('PASS');
    expect(exact?.checks.find((check) => check.check === 'Figma vs live RMSE')?.verdict).toBe('PASS');
    expect(responsive?.checks.find((check) => check.check === 'Viewport purpose')?.notes).toContain('behavior-only');
    expect(responsive?.checks.find((check) => check.check === 'Image size semantics')?.verdict).toBe('SKIP');
    expect(responsive?.checks.find((check) => check.check === 'Figma vs live RMSE')).toMatchObject({
      verdict: 'SKIP',
      notes: expect.stringContaining('exact-frame'),
    });
    expect(responsive?.verdict).toBe('PASS');
    expect(mocks.captureLiveViewport.mock.calls.map((call) => call[0].viewport.width)).toEqual([100, 140]);
  });

  it('never treats a behavior-only viewport as a pixel comparison even when sizes match', async () => {
    const root = temporaryDir();
    const referencePath = path.join(root, 'reference.png');
    writePng(referencePath, 100, 60, [255, 255, 255, 255]);
    liveColor = [0, 0, 0, 255];

    const report = await runVisualGate({
      pageUrl: 'http://example.test/',
      selector: '.focus',
      outputDir: root,
      figmaImage: referencePath,
      threshold: 0,
      viewports: [{ name: 'responsive', width: 100, height: 60, comparisonMode: 'responsive-flow' }],
      waitMs: 0,
    });

    expect(report.viewports[0]?.checks.find((check) => check.check === 'Figma vs live RMSE')?.verdict).toBe('SKIP');
    expect(report.viewports[0]?.checks.find((check) => check.check === 'Exact-frame pixel coverage')?.verdict).toBe('FAIL');
    expect(report.verdict).toBe('FAIL');
  });

  it('resolves 1920 desktop and 390 mobile exact capture widths from breakpoint references', async () => {
    const root = temporaryDir();
    const desktopPath = path.join(root, 'desktop.png');
    const mobilePath = path.join(root, 'mobile.png');
    writePng(desktopPath, 1920, 60, [255, 255, 255, 255]);
    writePng(mobilePath, 390, 60, [255, 255, 255, 255]);

    const report = await runVisualGate({
      pageUrl: 'http://example.test/',
      selector: '.focus',
      outputDir: root,
      figmaImages: { desktop: desktopPath, mobile: mobilePath },
      viewports: [
        { name: 'desktop', width: 1440, height: 60 },
        { name: 'mobile', width: 375, height: 60 },
      ],
      waitMs: 0,
    });

    expect(report.viewports.map((result) => result.viewport.width)).toEqual([1920, 390]);
    expect(report.viewports.map((result) => result.verdict)).toEqual(['PASS', 'PASS']);
  });

  it('rejects an exact reference wider than the explicit capture maximum', async () => {
    const root = temporaryDir();
    const referencePath = path.join(root, 'too-wide.png');
    writePng(referencePath, MAX_CAPTURE_VIEWPORT_WIDTH + 1, 1, [255, 255, 255, 255]);

    await expect(runVisualGate({
      pageUrl: 'http://example.test/',
      selector: '.focus',
      outputDir: root,
      figmaImage: referencePath,
      viewports: [{ name: 'desktop', width: 1440, height: 60 }],
      waitMs: 0,
    })).rejects.toThrow(`exceeds the maximum capture viewport width of ${MAX_CAPTURE_VIEWPORT_WIDTH}px`);
    expect(mocks.browserClose).toHaveBeenCalledTimes(1);
  });

  it('fails behavior-only validation when selector DOM geometry is zero', async () => {
    const root = temporaryDir();
    const referencePath = path.join(root, 'reference.png');
    writePng(referencePath, 100, 60, [255, 255, 255, 255]);
    mocks.captureLiveViewport.mockImplementation(async (options: CaptureLiveOptions) => {
      const capture = await defaultCapture(options);
      capture.domReport!.focus!.rect.width = 0;
      return capture;
    });

    const report = await runVisualGate({
      pageUrl: 'http://example.test/',
      selector: '.focus',
      outputDir: root,
      figmaImage: referencePath,
      viewports: [
        { name: 'desktop', width: 100, height: 60 },
        { name: 'ultrawide', referenceName: 'desktop', width: 2412, height: 60, comparisonMode: 'responsive-flow' },
      ],
      realFlow: true,
      waitMs: 0,
    });

    expect(report.viewports[1]?.checks.find((check) => check.check === 'Behavior-only selector geometry')?.verdict).toBe('FAIL');
    expect(report.viewports[1]?.checks.find((check) => check.check === 'Figma vs live RMSE')?.verdict).toBe('SKIP');
    expect(report.verdict).toBe('FAIL');
  });

  it('preserves detailed capture failures in results, JSON, and Markdown', async () => {
    const root = temporaryDir();
    const referencePath = path.join(root, 'reference.png');
    writePng(referencePath, 100, 60, [255, 255, 255, 255]);
    mocks.captureLiveViewport.mockImplementation(async (options: CaptureLiveOptions) => {
      const result = await defaultCapture(options);
      return {
        ...result,
        consoleMessages: [{
          type: 'error',
          text: 'console failed at https://example.test/api?[redacted]',
          location: { url: 'https://example.test/?[redacted]', lineNumber: 4, columnNumber: 2 },
        }],
        failedRequests: [{ method: 'GET', url: 'https://example.test/image?[redacted]', failure: 'net::ERR_FAILED' }],
        pageErrors: ['Error: page exploded at https://example.test/?[redacted]'],
      };
    });

    const report = await runVisualGate({
      pageUrl: 'http://example.test/?token=top-secret#details',
      selector: '.focus',
      outputDir: root,
      figmaImage: referencePath,
      viewports: [{ name: 'desktop', width: 100, height: 60 }],
      waitMs: 0,
    });

    expect(report.pageUrl).toBe('http://example.test/?[redacted]#[redacted]');
    expect(report.viewports[0]?.diagnostics.failedRequests[0]).toMatchObject({
      url: 'https://example.test/image?[redacted]',
      failure: 'net::ERR_FAILED',
    });
    const summary = fs.readFileSync(report.jsonPath, 'utf8');
    const markdown = fs.readFileSync(report.reportPath, 'utf8');
    expect(summary).toContain('net::ERR_FAILED');
    expect(summary).toContain('page exploded');
    expect(markdown).toContain('Capture diagnostics');
    expect(markdown).toContain('console failed');
    expect(`${summary}\n${markdown}`).not.toContain('top-secret');
  });

  it('shares one Figma reference session across all viewports in a gate run', async () => {
    const root = temporaryDir();
    const session = { cache: {}, fetchFigmaData: vi.fn() } as unknown as FigmaReferenceSession;
    mocks.createFigmaReferenceSession.mockReturnValue(session);
    mocks.exportFigmaReference.mockImplementation(async (
      figmaUrl: string,
      outputDir: string,
      _scale: number,
      receivedSession: FigmaReferenceSession,
    ): Promise<FigmaReferenceResult> => {
      expect(receivedSession).toBe(session);
      const imagePath = path.join(outputDir, 'reference.png');
      writePng(imagePath, 100, 60, [255, 255, 255, 255]);
      return { kind: 'figma-url', source: figmaUrl, imagePath };
    });

    await runVisualGate({
      pageUrl: 'http://example.test/',
      selector: '.focus',
      outputDir: root,
      figmaUrl: 'https://www.figma.com/design/file/design?node-id=1-2',
      viewports: [
        { name: 'desktop', width: 100, height: 60 },
        { name: 'wide', referenceName: 'desktop', width: 100, height: 60 },
      ],
      waitMs: 0,
    });

    expect(mocks.createFigmaReferenceSession).toHaveBeenCalledTimes(1);
    expect(mocks.exportFigmaReference).toHaveBeenCalledTimes(2);
    expect(mocks.exportFigmaReference.mock.calls.map((call) => call[3])).toEqual([session, session]);
  });
});

async function defaultCapture(options: CaptureLiveOptions): Promise<LiveCaptureResult> {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const focusPath = path.join(options.outputDir, `${options.viewport.name}.focus.png`);
  const fullPath = path.join(options.outputDir, `${options.viewport.name}.full.png`);
  const domPath = path.join(options.outputDir, `${options.viewport.name}.dom.json`);
  writePng(focusPath, options.viewport.width, options.viewport.height, liveColor);
  writePng(fullPath, options.viewport.width, options.viewport.height, liveColor);
  fs.writeFileSync(domPath, '{}', 'utf8');
  return {
    viewport: options.viewport.name,
    width: options.viewport.width,
    height: options.viewport.height,
    status: 200,
    ok: true,
    fullPath,
    focusPath,
    domPath,
    consoleMessages: [],
    failedRequests: [],
    pageErrors: [],
    domReport: {
      title: 'Fixture',
      url: 'http://example.test/',
      viewport: { width: options.viewport.width, height: options.viewport.height },
      body: { x: 0, y: 0, width: options.viewport.width, height: options.viewport.height },
      documentHeight: options.viewport.height,
      scrollWidth: options.viewport.width,
      horizontalOverflow: false,
      focusSelector: '.focus',
      focus: {
        index: 0,
        tag: 'section',
        className: 'focus',
        text: 'Fixture',
        rect: { x: 0, y: 0, width: options.viewport.width, height: options.viewport.height },
        styles: {},
      },
      focusSamples: [],
      semanticVisibilityIssues: [],
    },
  };
}

function temporaryDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-gate-'));
  temporaryDirs.push(dir);
  return dir;
}

function writePng(
  filePath: string,
  width: number,
  height: number,
  rgba: [number, number, number, number],
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const png = new PNG({ width, height });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = rgba[0];
    png.data[index + 1] = rgba[1];
    png.data[index + 2] = rgba[2];
    png.data[index + 3] = rgba[3];
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}
