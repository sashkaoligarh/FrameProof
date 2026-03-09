/**
 * Figma REST API HTTP client.
 * Handles authentication, rate limiting (FR-017), and token masking (FR-018).
 */

const FIGMA_API_BASE = 'https://api.figma.com/v1';
const MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
/** Longer timeout for file fetches (large files with include_hidden can be 50MB+) */
const FILE_FETCH_TIMEOUT_MS = 180_000;
/** Longer timeout for image rendering (Figma renders server-side, can be slow at scale=2) */
const IMAGE_RENDER_TIMEOUT_MS = 120_000;
/** Timeout for downloading rendered images */
const IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
/** Max concurrent image downloads */
const MAX_CONCURRENT_DOWNLOADS = 5;

export interface FetchOptions {
  nodeIds?: string[];
  depth?: number;
}

export class FigmaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fileId: string,
  ) {
    super(message);
    this.name = 'FigmaApiError';
  }
}

/** Mask a Figma token for safe logging. */
export function maskToken(token: string): string {
  if (token.length <= 8) return '***';
  return `${token.slice(0, 5)}***`;
}

/**
 * Fetch a Figma file via REST API.
 * Implements auto-retry on 429 with Retry-After header (FR-017).
 */
export async function fetchFigmaFile(
  fileId: string,
  token: string,
  options: FetchOptions = {},
): Promise<unknown> {
  let url = `${FIGMA_API_BASE}/files/${encodeURIComponent(fileId)}`;
  const params = new URLSearchParams();

  if (options.nodeIds && options.nodeIds.length > 0) {
    params.set('ids', options.nodeIds.join(','));
  }
  if (options.depth !== undefined) {
    params.set('depth', String(options.depth));
  }

  const query = params.toString();
  if (query) {
    url += `?${query}`;
  }

  return fetchWithRetry(url, token, fileId, FILE_FETCH_TIMEOUT_MS);
}

/**
 * Fetch Figma file nodes by IDs.
 * Uses GET /v1/files/:key/nodes?ids=X endpoint.
 */
export async function fetchFigmaNodes(
  fileId: string,
  token: string,
  nodeIds: string[],
): Promise<unknown> {
  const params = new URLSearchParams();
  params.set('ids', nodeIds.join(','));

  const url = `${FIGMA_API_BASE}/files/${encodeURIComponent(fileId)}/nodes?${params.toString()}`;
  return fetchWithRetry(url, token, fileId);
}

export interface ImageExportOptions {
  format: 'svg' | 'png' | 'jpg' | 'pdf';
  scale?: number;
  svgIncludeId?: boolean;
  svgOutlineText?: boolean;
}

/**
 * Get image download URLs for given node IDs.
 * Uses GET /v1/images/:key endpoint (FR-015).
 * Supports svg, png, jpg, pdf formats.
 */
export async function fetchFigmaImages(
  fileId: string,
  token: string,
  nodeIds: string[],
  options: ImageExportOptions = { format: 'png' },
): Promise<Record<string, string | null>> {
  const params = new URLSearchParams();
  params.set('ids', nodeIds.join(','));
  params.set('format', options.format);

  if (options.scale !== undefined && options.format !== 'svg') {
    params.set('scale', String(options.scale));
  }
  if (options.format === 'svg') {
    if (options.svgIncludeId) params.set('svg_include_id', 'true');
    if (options.svgOutlineText) params.set('svg_outline_text', 'true');
  }

  const url = `${FIGMA_API_BASE}/images/${encodeURIComponent(fileId)}?${params.toString()}`;
  process.stderr.write(`Requesting image render for ${nodeIds.length} node(s) [${options.format}, scale=${options.scale ?? 1}]...\n`);
  const result = (await fetchWithRetry(url, token, fileId, IMAGE_RENDER_TIMEOUT_MS)) as {
    images: Record<string, string | null>;
  };
  process.stderr.write(`Image render URLs received for ${Object.keys(result.images).length} node(s).\n`);
  return result.images;
}

/**
 * Download a binary image from a URL.
 */
export async function downloadImage(imageUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

/**
 * Download multiple images with concurrency limit.
 * Returns results in same order as input URLs.
 */
export async function downloadImagesBatch(
  urls: Array<{ id: string; url: string }>,
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, ArrayBuffer>> {
  const results = new Map<string, ArrayBuffer>();
  let completed = 0;

  // Process in chunks of MAX_CONCURRENT_DOWNLOADS
  for (let i = 0; i < urls.length; i += MAX_CONCURRENT_DOWNLOADS) {
    const chunk = urls.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
    const promises = chunk.map(async ({ id, url }) => {
      try {
        const buffer = await downloadImage(url);
        results.set(id, buffer);
      } catch {
        // Skip failed downloads — caller handles missing entries
      }
      completed++;
      onProgress?.(completed, urls.length);
    });
    await Promise.all(promises);
  }

  return results;
}

/**
 * Check if an error is a timeout/abort error.
 * These should NOT be retried — if Figma couldn't respond in time, retrying just wastes time.
 */
function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof DOMException && error.name === 'TimeoutError') return true;
  if (error instanceof Error && error.name === 'TimeoutError') return true;
  if (error instanceof Error && error.message.includes('timed out')) return true;
  return false;
}

async function fetchWithRetry(
  url: string,
  token: string,
  fileId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        process.stderr.write(`Retry ${attempt}/${MAX_RETRIES} for ${fileId}...\n`);
      }

      const startTime = Date.now();
      process.stderr.write(`Figma API request (timeout: ${Math.round(timeoutMs / 1000)}s)...\n`);

      const response = await fetch(url, {
        headers: {
          'X-Figma-Token': token,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        let waitSeconds = retryAfter ? parseInt(retryAfter, 10) : 5;

        // Figma sometimes returns Unix timestamps or absurd values in Retry-After.
        // If the value is > 120 seconds, it's likely a timestamp or error — don't wait.
        if (isNaN(waitSeconds) || waitSeconds > 120) {
          throw new FigmaApiError(
            `Rate limited by Figma API (Retry-After: ${retryAfter ?? 'unknown'}). ` +
              `Wait a minute and try again.`,
            429,
            fileId,
          );
        }

        if (attempt >= MAX_RETRIES) {
          throw new FigmaApiError(
            `Rate limited by Figma API after ${MAX_RETRIES} retries. ` +
              `Try again later or use --page/--node to reduce request scope.`,
            429,
            fileId,
          );
        }

        // Cap wait to 30s max
        waitSeconds = Math.min(waitSeconds, 30);
        const waitMs = waitSeconds * 1000;

        process.stderr.write(
          `Rate limited (429). Waiting ${waitSeconds}s before retry ${attempt + 1}/${MAX_RETRIES}...\n`,
        );
        await sleep(waitMs);
        continue;
      }

      if (response.status === 403) {
        throw new FigmaApiError(
          `Access denied. Check that your token (${maskToken(token)}) has read access to file ${fileId}.`,
          403,
          fileId,
        );
      }

      if (response.status === 404) {
        throw new FigmaApiError(
          `File not found: ${fileId}. Check the file ID or URL.`,
          404,
          fileId,
        );
      }

      if (!response.ok) {
        throw new FigmaApiError(
          `Figma API error: ${response.status} ${response.statusText}`,
          response.status,
          fileId,
        );
      }

      process.stderr.write(`Figma API responded in ${elapsed}s, parsing JSON...\n`);
      const json = await response.json();
      process.stderr.write(`JSON parsed successfully.\n`);
      return json;
    } catch (error) {
      if (error instanceof FigmaApiError) throw error;

      // NEVER retry timeout errors — Figma won't magically get faster
      if (isTimeoutError(error)) {
        const secs = Math.round(timeoutMs / 1000);
        throw new Error(
          `Figma API timed out after ${secs}s for file "${fileId}". ` +
            `The file may be very large. Try again or use node_id to fetch a specific section.`,
        );
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      process.stderr.write(`Network error: ${lastError.message}. ${attempt < MAX_RETRIES ? 'Retrying...' : 'Giving up.'}\n`);

      if (attempt >= MAX_RETRIES) break;
    }
  }

  throw lastError ?? new Error('Unknown fetch error');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
