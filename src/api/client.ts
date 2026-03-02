/**
 * Figma REST API HTTP client.
 * Handles authentication, rate limiting (FR-017), and token masking (FR-018).
 */

const FIGMA_API_BASE = 'https://api.figma.com/v1';
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

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

  return fetchWithRetry(url, token, fileId);
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
  const result = (await fetchWithRetry(url, token, fileId)) as {
    images: Record<string, string | null>;
  };
  return result.images;
}

/**
 * Download a binary image from a URL.
 */
export async function downloadImage(imageUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

async function fetchWithRetry(
  url: string,
  token: string,
  fileId: string,
): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'X-Figma-Token': token,
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      if (response.status === 429) {
        if (attempt >= MAX_RETRIES) {
          throw new FigmaApiError(
            `Rate limited by Figma API after ${MAX_RETRIES} retries. ` +
              `Try again later or use --page/--node to reduce request scope.`,
            429,
            fileId,
          );
        }

        const retryAfter = response.headers.get('Retry-After');
        const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : 5;
        const waitMs = (isNaN(waitSeconds) ? 5 : waitSeconds) * 1000;

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

      return await response.json();
    } catch (error) {
      if (error instanceof FigmaApiError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= MAX_RETRIES) break;
    }
  }

  throw lastError ?? new Error('Unknown fetch error');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
