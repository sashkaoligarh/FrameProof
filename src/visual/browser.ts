import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import type { ViewportPreset } from './types.js';

export interface DomElementSample {
  index: number;
  tag: string;
  className: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
}

export interface DomReport {
  title: string;
  url: string;
  viewport: { width: number; height: number };
  body: { x: number; y: number; width: number; height: number };
  documentHeight: number;
  scrollWidth: number;
  horizontalOverflow: boolean;
  focusSelector: string;
  focus: DomElementSample | null;
  focusSamples: DomElementSample[];
  semanticVisibilityIssues: DomElementSample[];
}

export interface LiveCaptureResult {
  viewport: string;
  width: number;
  height: number;
  status: number | null;
  ok: boolean;
  fullPath: string | null;
  focusPath: string | null;
  domPath: string | null;
  consoleMessages: Array<{ type: string; text: string }>;
  failedRequests: Array<{ method: string; url: string; failure: string }>;
  pageErrors: string[];
  domReport: DomReport | null;
}

export interface CaptureLiveOptions {
  pageUrl: string;
  selector: string;
  viewport: ViewportPreset;
  outputDir: string;
  waitMs: number;
  browser?: Browser;
}

export async function captureLiveViewport(options: CaptureLiveOptions): Promise<LiveCaptureResult> {
  fs.mkdirSync(options.outputDir, { recursive: true });

  const browser = options.browser ?? await launchChromium();
  let closeBrowser = !options.browser;
  const context = await browser.newContext({
    viewport: { width: options.viewport.width, height: options.viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  const consoleMessages: Array<{ type: string; text: string }> = [];
  const failedRequests: Array<{ method: string; url: string; failure: string }> = [];
  const pageErrors: string[] = [];
  const fullPath = path.join(options.outputDir, `${options.viewport.name}.full.png`);
  const focusPath = path.join(options.outputDir, `${options.viewport.name}.focus.png`);
  const domPath = path.join(options.outputDir, `${options.viewport.name}.dom.json`);
  let status: number | null = null;
  let ok = false;
  let focusCaptured = false;
  let domReport: DomReport | null = null;

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText ?? 'unknown',
    });
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    const response = await page.goto(options.pageUrl, { waitUntil: 'networkidle', timeout: 45_000 });
    status = response?.status() ?? null;
    ok = Boolean(response?.ok());
    if (options.waitMs > 0) await page.waitForTimeout(options.waitMs);

    await waitForImages(page);
    await stabilizeScroll(page);
    await page.addStyleTag({
      content: [
        'astro-dev-toolbar',
        'astro-dev-toolbar-window',
        'vite-error-overlay',
        '[data-astro-dev-toolbar]',
      ].join(', ') + ' { display: none !important; visibility: hidden !important; }',
    });

    const documentSize = await page.evaluate(() => ({
      width: Math.ceil(Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, window.innerWidth)),
      height: Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight)),
    }));
    if (documentSize.height > options.viewport.height) {
      await page.setViewportSize({ width: options.viewport.width, height: documentSize.height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
    }

    await page.screenshot({ path: fullPath, fullPage: true });

    const locator = page.locator(options.selector).first();
    if (await locator.count()) {
      await locator.screenshot({ path: focusPath });
      focusCaptured = true;
    }

    domReport = await page.evaluate(buildDomReport, options.selector) as DomReport;
    fs.writeFileSync(domPath, JSON.stringify(domReport, null, 2), 'utf8');
  } catch (error) {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
    if (closeBrowser) await browser.close();
    closeBrowser = false;
  }

  return {
    viewport: options.viewport.name,
    width: options.viewport.width,
    height: options.viewport.height,
    status,
    ok,
    fullPath: fs.existsSync(fullPath) ? fullPath : null,
    focusPath: focusCaptured ? focusPath : null,
    domPath: domReport ? domPath : null,
    consoleMessages,
    failedRequests,
    pageErrors,
    domReport,
  };
}

export async function launchChromium(): Promise<Browser> {
  const executablePath = findChromeExecutable();
  return chromium.launch({
    headless: true,
    executablePath,
    args: ['--disable-dev-shm-usage'],
  });
}

export function findChromeExecutable(): string | undefined {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROMIUM_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function waitForImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitForImage = (image: HTMLImageElement) => new Promise<void>((resolve) => {
      if (image.complete && image.naturalWidth > 0) {
        resolve();
        return;
      }
      const done = () => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(done, 5000);
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    });
    await Promise.race([Promise.all(Array.from(document.images).map(waitForImage)), sleep(6000)]);
  });
}

async function stabilizeScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const maxY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step = Math.max(window.innerHeight, 1);
    for (let y = 0; y <= maxY; y += step) {
      window.scrollTo(0, y);
      await nextFrame();
    }
    window.scrollTo(0, 0);
    await nextFrame();
    await nextFrame();
  });
}

function buildDomReport(selector: string): DomReport {
  const roundRect = (value: number) => Math.round(value * 100) / 100;
  const rect = (element: Element) => {
    const box = element.getBoundingClientRect();
    return { x: roundRect(box.x), y: roundRect(box.y), width: roundRect(box.width), height: roundRect(box.height) };
  };
  const className = (element: Element) => String(element.getAttribute('class') ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join('.');
  const textPreview = (element: Element) => String(element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const styleSubset = (element: Element) => {
    const styles = window.getComputedStyle(element);
    return {
      display: styles.display,
      position: styles.position,
      flexDirection: styles.flexDirection,
      alignItems: styles.alignItems,
      justifyContent: styles.justifyContent,
      gap: styles.gap,
      width: styles.width,
      minWidth: styles.minWidth,
      maxWidth: styles.maxWidth,
      height: styles.height,
      minHeight: styles.minHeight,
      maxHeight: styles.maxHeight,
      paddingTop: styles.paddingTop,
      paddingRight: styles.paddingRight,
      paddingBottom: styles.paddingBottom,
      paddingLeft: styles.paddingLeft,
      marginTop: styles.marginTop,
      marginBottom: styles.marginBottom,
      overflow: styles.overflow,
      backgroundColor: styles.backgroundColor,
      border: styles.border,
      borderRadius: styles.borderRadius,
      boxShadow: styles.boxShadow,
      opacity: styles.opacity,
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      lineHeight: styles.lineHeight,
      letterSpacing: styles.letterSpacing,
      color: styles.color,
    };
  };
  const describe = (element: Element, index: number): DomElementSample => ({
    index,
    tag: element.tagName.toLowerCase(),
    className: className(element),
    text: textPreview(element),
    rect: rect(element),
    styles: styleSubset(element),
  });
  const hasHiddenAncestor = (element: Element, boundary: Element) => {
    let current: Element | null = element;
    while (current && current !== boundary.parentElement) {
      const styles = window.getComputedStyle(current);
      if (Number(styles.opacity) < 0.01 || styles.visibility === 'hidden' || styles.display === 'none') return true;
      current = current.parentElement;
    }
    return false;
  };

  const focus = document.querySelector(selector);
  const focusSamples = focus
    ? [focus, ...Array.from(focus.querySelectorAll('h1,h2,h3,p,a,button,select,details,summary,[role="tab"],img,svg'))]
      .slice(0, 80)
      .map(describe)
    : [];
  const semanticVisibilityIssues = focus
    ? Array.from(focus.querySelectorAll('h1,h2,h3,p,a,button'))
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => !element.closest('[aria-hidden="true"],.dropdown,.popover,.tooltip'))
      .filter(({ element }) => textPreview(element).length > 0 && hasHiddenAncestor(element, focus))
      .map(({ element, index }) => describe(element, index))
    : [];

  return {
    title: document.title,
    url: window.location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    body: rect(document.body),
    documentHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) > window.innerWidth + 1,
    focusSelector: selector,
    focus: focus ? describe(focus, 0) : null,
    focusSamples,
    semanticVisibilityIssues,
  };
}
