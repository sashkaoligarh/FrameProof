import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import type { ViewportPreset } from './types.js';

const CAPTURE_STYLES = `
*, *::before, *::after {
  animation: none !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
  transition: none !important;
}
astro-dev-toolbar,
astro-dev-toolbar-window,
vite-error-overlay,
[data-astro-dev-toolbar] {
  display: none !important;
  visibility: hidden !important;
}`;
const FONT_READY_TIMEOUT_MS = 5_000;

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
  consoleMessages: Array<{
    type: string;
    text: string;
    location?: { url: string; lineNumber: number; columnNumber: number };
  }>;
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
  const captureCookies = readCaptureCookies();
  if (captureCookies.length > 0) await context.addCookies(captureCookies);
  const page = await context.newPage();

  const consoleMessages: LiveCaptureResult['consoleMessages'] = [];
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
      const location = message.location();
      consoleMessages.push({
        type: message.type(),
        text: redactUrls(message.text()),
        location: location.url ? { ...location, url: redactUrl(location.url) } : undefined,
      });
    }
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      method: request.method(),
      url: redactUrl(request.url()),
      failure: redactUrls(request.failure()?.errorText ?? 'unknown'),
    });
  });
  page.on('pageerror', (error) => pageErrors.push(formatError(error)));

  try {
    const response = await page.goto(options.pageUrl, { waitUntil: 'networkidle', timeout: 45_000 });
    status = response?.status() ?? null;
    ok = Boolean(response?.ok());
    await page.addStyleTag({ content: CAPTURE_STYLES });
    if (options.waitMs > 0) await page.waitForTimeout(options.waitMs);

    await waitForImages(page);
    await waitForFonts(page);
    await stabilizeScroll(page);

    const locator = page.locator(options.selector).first();
    if (await locator.count()) {
      await locator.screenshot({ path: focusPath, animations: 'disabled', caret: 'hide' });
      focusCaptured = true;
    }

    domReport = await page.evaluate(buildDomReport, options.selector) as DomReport;
    domReport.url = redactUrl(domReport.url);
    fs.writeFileSync(domPath, JSON.stringify(domReport, null, 2), 'utf8');

    // Full-page capture runs last because Playwright may scroll or resize internally.
    await page.screenshot({ path: fullPath, fullPage: true, animations: 'disabled', caret: 'hide' });
  } catch (error) {
    pageErrors.push(formatError(error));
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

export function redactUrl(value: string): string {
  return redactSingleUrl(value) ?? redactUrls(value);
}

function redactSingleUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const query = url.search ? '?[redacted]' : '';
    const fragment = url.hash ? '#[redacted]' : '';
    return `${url.protocol}//${url.host}${url.pathname}${query}${fragment}`;
  } catch {
    return null;
  }
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

function readCaptureCookies(): Array<{ name: string; value: string; url: string }> {
  const serialized = process.env.FRAMEPROOF_COOKIES_JSON;
  if (!serialized) return [];

  try {
    const cookies = JSON.parse(serialized) as unknown;
    if (!Array.isArray(cookies)) return [];

    return cookies.filter((cookie): cookie is { name: string; value: string; url: string } => (
      typeof cookie === 'object'
      && cookie !== null
      && typeof cookie.name === 'string'
      && typeof cookie.value === 'string'
      && typeof cookie.url === 'string'
    ));
  } catch {
    return [];
  }
}

async function waitForImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitForImage = (image: HTMLImageElement) => new Promise<void>((resolve) => {
      if (image.complete) {
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

async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async (timeoutMs) => {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }, FONT_READY_TIMEOUT_MS);
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
      animationName: styles.animationName,
      transitionProperty: styles.transitionProperty,
      caretColor: styles.caretColor,
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

function redactUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => redactSingleUrl(url) ?? url);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return redactUrls(error.stack ?? `${error.name}: ${error.message}`);
  return redactUrls(String(error));
}
