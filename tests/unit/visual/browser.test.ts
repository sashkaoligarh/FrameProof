import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { captureLiveViewport, findChromeExecutable } from '../../../src/visual/browser.js';

describe('visual browser capture', () => {
  it.skipIf(!findChromeExecutable())('captures the selector at the requested viewport with deterministic state', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-browser-'));
    const server = http.createServer((request, response) => {
      if (request.url?.startsWith('/broken.png')) {
        request.socket.destroy();
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html>
        <html>
          <head>
            <title>fonts-pending</title>
            <style>
              html, body { margin: 0; }
              .focus {
                animation: pulse 10s infinite;
                box-sizing: border-box;
                caret-color: red;
                height: 100vh;
                transition: all 2s;
                width: 100vw;
              }
              .spacer { height: 600px; }
              @keyframes pulse { from { background: red; } to { background: blue; } }
            </style>
            <script>
              const delayedFonts = new Promise((resolve) => setTimeout(() => {
                document.title = document.cookie.includes('capture=enabled')
                  ? 'fonts-ready-cookie'
                  : 'fonts-ready-no-cookie';
                resolve();
              }, 900));
              Object.defineProperty(document.fonts, 'ready', {
                configurable: true,
                get: () => delayedFonts,
              });
              console.error('console failed https://errors.test/log?token=console-secret#details');
              setTimeout(() => {
                throw new Error('page exploded https://errors.test/page?token=error-secret#details');
              }, 0);
            </script>
          </head>
          <body>
            <section class="focus"><input value="stable"></section>
            <div class="spacer"></div>
            <img src="/broken.png?token=request-secret" alt="broken">
          </body>
        </html>`);
    });

    await listen(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
    const origin = `http://127.0.0.1:${address.port}`;
    const previousCookies = process.env.FRAMEPROOF_COOKIES_JSON;
    process.env.FRAMEPROOF_COOKIES_JSON = JSON.stringify([
      { name: 'capture', value: 'enabled', url: origin },
    ]);

    try {
      const result = await captureLiveViewport({
        pageUrl: `${origin}/?token=page-secret#section`,
        selector: '.focus',
        viewport: { name: 'fixture', width: 320, height: 120 },
        outputDir,
        waitMs: 0,
      });

      expect(result.focusPath).not.toBeNull();
      expect(result.fullPath).not.toBeNull();
      expect(readPngSize(result.focusPath!)).toEqual({ width: 320, height: 120 });
      expect(readPngSize(result.fullPath!).height).toBeGreaterThan(120);
      expect(result.domReport?.viewport).toEqual({ width: 320, height: 120 });
      expect(result.domReport?.title).toBe('fonts-ready-cookie');
      expect(result.domReport?.focus?.styles.animationName).toBe('none');
      expect(result.domReport?.focus?.styles.transitionProperty).toBe('none');
      expect(result.domReport?.focus?.styles.caretColor).toBe('rgba(0, 0, 0, 0)');

      expect(result.consoleMessages.some((message) => (
        message.text.includes('console failed') && message.text.includes('?[redacted]#[redacted]')
      ))).toBe(true);
      expect(result.failedRequests[0]?.url).toContain('?[redacted]');
      expect(result.pageErrors.join('\n')).toContain('?[redacted]#[redacted]');
      expect(JSON.stringify(result)).not.toMatch(/page-secret|console-secret|request-secret|error-secret/);
    } finally {
      if (previousCookies === undefined) delete process.env.FRAMEPROOF_COOKIES_JSON;
      else process.env.FRAMEPROOF_COOKIES_JSON = previousCookies;
      await close(server);
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  }, 20_000);

  it.skipIf(!findChromeExecutable())('bounds font readiness when document.fonts.ready never settles', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-browser-fonts-'));
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html>
        <html>
          <head>
            <style>html, body { margin: 0; } .focus { width: 100vw; height: 40px; }</style>
            <script>
              Object.defineProperty(document.fonts, 'ready', {
                configurable: true,
                get: () => new Promise(() => {}),
              });
            </script>
          </head>
          <body><section class="focus">bounded</section></body>
        </html>`);
    });

    await listen(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
    const startedAt = Date.now();

    try {
      const result = await captureLiveViewport({
        pageUrl: `http://127.0.0.1:${address.port}/`,
        selector: '.focus',
        viewport: { name: 'font-timeout', width: 320, height: 120 },
        outputDir,
        waitMs: 0,
      });

      expect(result.focusPath).not.toBeNull();
      expect(Date.now() - startedAt).toBeLessThan(8_000);
    } finally {
      await close(server);
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  }, 12_000);
});

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function readPngSize(filePath: string): { width: number; height: number } {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  return { width: png.width, height: png.height };
}
