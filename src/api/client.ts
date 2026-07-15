/**
 * Figma REST API HTTP client.
 * Handles authentication, rate limiting (FR-017), and token masking (FR-018).
 */

const FIGMA_API_BASE = 'https://api.figma.com/v1';
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 30_000;
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
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
export function maskToken(_token: string): string {
  return '***';
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

  const result = await fetchWithRetry(url, token, fileId, FILE_FETCH_TIMEOUT_MS);
  assertFigmaFileResponse(result, `file ${fileId}`);
  return result;
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
  const result = await fetchWithRetry(url, token, fileId);
  assertFigmaNodesResponse(result, `nodes for file ${fileId}`);
  return result;
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
  const result = await fetchWithRetry(url, token, fileId, IMAGE_RENDER_TIMEOUT_MS);
  assertFigmaImagesResponse(result, `images for file ${fileId}`);
  process.stderr.write(`Image render URLs received for ${Object.keys(result.images).length} node(s).\n`);
  return result.images;
}

/**
 * Download a binary image from a URL.
 */
export async function downloadImage(imageUrl: string): Promise<ArrayBuffer> {
  return downloadWithRetry(imageUrl);
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

/** Check if an error is a timeout/abort error. */
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
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      if (attempt > 0) {
        process.stderr.write(`Retry ${attempt}/${MAX_RETRIES} for ${fileId}...\n`);
      }

      const startTime = Date.now();
      process.stderr.write(`Figma API request (timeout: ${Math.round(timeoutMs / 1000)}s)...\n`);

      response = await fetch(url, {
        headers: {
          'X-Figma-Token': token,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stderr.write(`Figma API responded in ${elapsed}s.\n`);
    } catch (error) {
      const timedOut = isTimeoutError(error);
      if (attempt >= MAX_RETRIES && timedOut) {
        const secs = Math.round(timeoutMs / 1000);
        throw new Error(
          `Figma API timed out after ${MAX_RETRIES + 1} attempts of ${secs}s for file "${fileId}". ` +
            `The file may be very large. Try again or use node_id to fetch a specific section.`,
        );
      }

      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= MAX_RETRIES) {
        throw new Error(
          `Figma API network request failed after ${MAX_RETRIES + 1} attempts for "${fileId}". ` +
            `Check network connectivity and retry. Last error: ${message}`,
        );
      }
      process.stderr.write(`Figma API ${timedOut ? 'timeout' : 'network error'}. Retrying safe GET request...\n`);
      await sleep(retryDelayMs(attempt));
      continue;
    }

    if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
      const delayMs = retryDelayMs(attempt, response.headers.get('Retry-After'));
      await discardResponse(response);
      process.stderr.write(
        `Figma API returned HTTP ${response.status}. Retrying safe GET request in ${delayMs}ms...\n`,
      );
      await sleep(delayMs);
      continue;
    }

    if (response.status === 429) {
      throw new FigmaApiError(
        `Rate limited by Figma API after ${MAX_RETRIES} retries. ` +
          `Try again later or reduce request scope.`,
        429,
        fileId,
      );
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

    return parseJsonResponse(response, `Figma API response for file "${fileId}"`);
  }

  throw new Error('Unexpected: Figma GET request exhausted retries without a result');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || TRANSIENT_STATUSES.has(status);
}

function retryDelayMs(attempt: number, retryAfter: string | null = null): number {
  const parsedRetryAfter = parseRetryAfterMs(retryAfter);
  if (parsedRetryAfter !== null) {
    return Math.min(parsedRetryAfter, MAX_RETRY_DELAY_MS);
  }

  const exponential = Math.min(RETRY_BASE_DELAY_MS * (2 ** attempt), MAX_RETRY_DELAY_MS);
  return Math.floor(exponential / 2 + Math.random() * exponential / 2);
}

function parseRetryAfterMs(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds * 1000)) : null;
  }

  const dateMs = Date.parse(trimmed);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

async function discardResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The body may already be closed by the fetch implementation.
  }
}

async function parseJsonResponse(response: Response, context: string): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === '') {
    throw new Error(`${context} was empty; expected JSON.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} contained malformed JSON.`);
  }
}

async function downloadWithRetry(imageUrl: string): Promise<ArrayBuffer> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= MAX_RETRIES) {
        if (isTimeoutError(error)) {
          throw new Error(
            `Image download timed out after ${MAX_RETRIES + 1} attempts of ` +
              `${Math.round(IMAGE_DOWNLOAD_TIMEOUT_MS / 1000)}s.`,
          );
        }
        throw new Error(
          `Image download failed after ${MAX_RETRIES + 1} attempts. ` +
            `Check network connectivity and retry. Last error: ${message}`,
        );
      }
      await sleep(retryDelayMs(attempt));
      continue;
    }

    if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
      const delayMs = retryDelayMs(attempt, response.headers.get('Retry-After'));
      await discardResponse(response);
      await sleep(delayMs);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  throw new Error('Unexpected: image download exhausted retries without a result');
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(context: string, detail: string): never {
  throw new Error(`Invalid Figma API response for ${context}: ${detail}.`);
}

function assertFigmaFileResponse(value: unknown, context: string): asserts value is JsonObject {
  if (!isObject(value)) invalidResponse(context, 'expected an object');
  if (typeof value.name !== 'string') invalidResponse(context, 'missing string name');
  if (typeof value.lastModified !== 'string') invalidResponse(context, 'missing string lastModified');
  if (typeof value.version !== 'string') invalidResponse(context, 'missing string version');
  if (!isObject(value.document) || typeof value.document.type !== 'string') {
    invalidResponse(context, 'missing document root');
  }
  for (const key of ['components', 'componentSets', 'styles'] as const) {
    if (value[key] !== undefined && !isObject(value[key])) {
      invalidResponse(context, `${key} must be an object`);
    }
  }
}

function assertFigmaNodesResponse(value: unknown, context: string): asserts value is JsonObject {
  if (!isObject(value) || !isObject(value.nodes)) {
    invalidResponse(context, 'missing nodes object');
  }
  for (const node of Object.values(value.nodes)) {
    if (node !== null && (!isObject(node) || !isObject(node.document))) {
      invalidResponse(context, 'node entries must contain document objects or be null');
    }
  }
}

function assertFigmaImagesResponse(
  value: unknown,
  context: string,
): asserts value is { images: Record<string, string | null> } {
  if (!isObject(value) || !isObject(value.images)) {
    invalidResponse(context, 'missing images object');
  }
  for (const imageUrl of Object.values(value.images)) {
    if (imageUrl !== null && typeof imageUrl !== 'string') {
      invalidResponse(context, 'image URLs must be strings or null');
    }
  }
}

// ─── Write API Methods ───────────────────────────────────

import type {
  PostVariablesRequestBody,
  PostVariablesResponse,
  GetLocalVariablesResponse,
  DevResourceCreateRequest,
  DevResourceUpdateRequest,
  GetDevResourcesResponse,
  PostDevResourcesResponse,
  PutDevResourcesResponse,
  PostCommentRequest,
  GetCommentsResponse,
  FigmaComment,
} from '../types/write-api.js';

/** Shared request helper for the read/write endpoints grouped below. */
async function figmaWriteRequest(
  url: string,
  token: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {
    'X-Figma-Token': token,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const safeToRetry = method === 'GET';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (safeToRetry && attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      if (!safeToRetry) {
        throw new Error(
          `Figma ${method} request failed before a response was received; its outcome is unknown. ` +
            `Automatic retry was skipped to avoid a duplicate mutation. Verify remote state before retrying. ` +
            `Cause: ${message}`,
        );
      }

      const timeoutDetail = isTimeoutError(error) ? 'timed out' : 'failed';
      throw new Error(
        `Figma GET request ${timeoutDetail} after ${attempt + 1} attempt(s). ` +
          `Check network connectivity and retry. Cause: ${message}`,
      );
    }

    if (safeToRetry && isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
      const delayMs = retryDelayMs(attempt, response.headers.get('Retry-After'));
      await discardResponse(response);
      await sleep(delayMs);
      continue;
    }

    if (response.status === 429) {
      const parsedDelay = parseRetryAfterMs(response.headers.get('Retry-After'));
      const retryGuidance = parsedDelay === null
        ? 'Retry later.'
        : `Retry after at least ${Math.ceil(parsedDelay / 1000)} second(s).`;
      const mutationGuidance = safeToRetry
        ? ''
        : ' Automatic retry was skipped to avoid a duplicate mutation.';
      throw new FigmaApiError(
        `Rate limited by Figma API. ${retryGuidance}${mutationGuidance}`,
        429,
        url,
      );
    }

    if (response.status === 403) {
      const text = await response.text();
      if (text.includes('enterprise') || text.includes('Enterprise')) {
        throw new FigmaApiError(
          'Variables API requires Figma Enterprise plan. This file\'s organization does not have Enterprise.',
          403,
          url,
        );
      }
      throw new FigmaApiError(
        `Token lacks required permission. Generate a new token with required scopes at figma.com/developers. Details: ${text}`,
        403,
        url,
      );
    }

    if (response.status === 404) {
      throw new FigmaApiError(
        `Resource not found. Use get_variables / list_dev_resources to find valid IDs.`,
        404,
        url,
      );
    }

    if (response.status === 400) {
      const text = await response.text();
      throw new FigmaApiError(
        `Invalid request: ${text}`,
        400,
        url,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new FigmaApiError(
        `Figma API error: ${response.status} ${response.statusText}. ${text}`,
        response.status,
        url,
      );
    }

    const text = await response.text();
    if (text.trim() === '') return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(
        `Figma API returned malformed JSON for ${method} ${url}.` +
          (safeToRetry ? '' : ' The mutation may have succeeded; verify remote state before retrying.'),
      );
    }
  }

  throw new Error('Unexpected: write request exhausted retries without error');
}

/**
 * GET /v1/files/{file_key}/variables/local
 * Retrieve all local variables and collections from a file.
 * Requires Enterprise plan + file_variables:read scope.
 */
export async function getLocalVariables(
  fileKey: string,
  token: string,
): Promise<GetLocalVariablesResponse> {
  const url = `${FIGMA_API_BASE}/files/${encodeURIComponent(fileKey)}/variables/local`;
  const result = await figmaWriteRequest(url, token, 'GET');
  assertVariablesResponse(result, `local variables for file ${fileKey}`);
  return result as unknown as GetLocalVariablesResponse;
}

/**
 * POST /v1/files/{file_key}/variables
 * Create, update, or delete variables and collections in batch.
 * Requires Enterprise plan + file_variables:write scope.
 */
export async function postVariables(
  fileKey: string,
  token: string,
  body: PostVariablesRequestBody,
): Promise<PostVariablesResponse> {
  const url = `${FIGMA_API_BASE}/files/${encodeURIComponent(fileKey)}/variables`;
  const result = await figmaWriteRequest(url, token, 'POST', body);
  assertStatusResponse(result, `variable mutation for file ${fileKey}`);
  return result as unknown as PostVariablesResponse;
}

/**
 * GET /v1/files/{file_key}/dev_resources
 * List dev resources for a file, optionally filtered by node_ids.
 */
export async function getDevResources(
  fileKey: string,
  token: string,
  nodeId?: string,
): Promise<GetDevResourcesResponse> {
  let url = `${FIGMA_API_BASE}/files/${encodeURIComponent(fileKey)}/dev_resources`;
  if (nodeId) {
    const params = new URLSearchParams({ node_ids: nodeId });
    url += `?${params.toString()}`;
  }
  const result = await figmaWriteRequest(url, token, 'GET');
  assertResourceList(result, 'dev resources');
  return result as GetDevResourcesResponse;
}

/**
 * POST /v1/dev_resources
 * Create dev resources (attach URLs to nodes).
 */
export async function postDevResources(
  token: string,
  resources: DevResourceCreateRequest[],
): Promise<PostDevResourcesResponse> {
  const url = `${FIGMA_API_BASE}/dev_resources`;
  const result = await figmaWriteRequest(url, token, 'POST', { dev_resources: resources });
  assertResourceArrayResponse(result, 'links_created', 'created dev resources');
  return result as PostDevResourcesResponse;
}

/**
 * PUT /v1/dev_resources
 * Update existing dev resources.
 */
export async function putDevResources(
  token: string,
  resources: DevResourceUpdateRequest[],
): Promise<PutDevResourcesResponse> {
  const url = `${FIGMA_API_BASE}/dev_resources`;
  const result = await figmaWriteRequest(url, token, 'PUT', { dev_resources: resources });
  assertPutDevResourcesResponse(result, 'updated dev resources');
  return result as PutDevResourcesResponse;
}

/**
 * DELETE /v1/files/{file_key}/dev_resources/{dev_resource_id}
 * Delete a single dev resource.
 */
export async function deleteDevResource(
  fileKey: string,
  token: string,
  resourceId: string,
): Promise<void> {
  const url = `${FIGMA_API_BASE}/files/${encodeURIComponent(fileKey)}/dev_resources/${encodeURIComponent(resourceId)}`;
  await figmaWriteRequest(url, token, 'DELETE');
}

/**
 * POST /v1/files/{file_key}/comments
 * Post a new comment or reply to an existing comment.
 */
export async function postComment(
  fileKey: string,
  token: string,
  body: PostCommentRequest,
): Promise<FigmaComment> {
  const url = `${FIGMA_API_BASE}/files/${encodeURIComponent(fileKey)}/comments`;
  const result = await figmaWriteRequest(url, token, 'POST', body);
  assertComment(result, 'created comment');
  return result as unknown as FigmaComment;
}

/**
 * GET /v1/files/{file_key}/comments
 * List all comments on a file.
 */
export async function getComments(
  fileKey: string,
  token: string,
): Promise<GetCommentsResponse> {
  const url = `${FIGMA_API_BASE}/files/${encodeURIComponent(fileKey)}/comments`;
  const result = await figmaWriteRequest(url, token, 'GET');
  if (!isObject(result) || !Array.isArray(result.comments)) {
    invalidResponse('comments', 'missing comments array');
  }
  for (const comment of result.comments) assertComment(comment, 'comments');
  return result as unknown as GetCommentsResponse;
}

function assertStatusResponse(value: unknown, context: string): asserts value is JsonObject {
  if (!isObject(value)) invalidResponse(context, 'expected an object');
  if (typeof value.status !== 'number' || typeof value.error !== 'boolean') {
    invalidResponse(context, 'missing numeric status or boolean error');
  }
}

function assertVariablesResponse(value: unknown, context: string): asserts value is JsonObject {
  assertStatusResponse(value, context);
  if (value.meta === undefined) return;
  if (!isObject(value.meta) || !isObject(value.meta.variableCollections) || !isObject(value.meta.variables)) {
    invalidResponse(context, 'meta must contain variableCollections and variables objects');
  }
}

function assertResourceList(value: unknown, context: string): asserts value is JsonObject {
  assertResourceArrayResponse(value, 'dev_resources', context);
}

function assertResourceArrayResponse(
  value: unknown,
  key: string,
  context: string,
): asserts value is JsonObject {
  if (!isObject(value) || !Array.isArray(value[key])) {
    invalidResponse(context, `missing ${key} array`);
  }
  for (const resource of value[key]) {
    if (
      !isObject(resource) ||
      typeof resource.id !== 'string' ||
      typeof resource.name !== 'string' ||
      typeof resource.url !== 'string'
    ) {
      invalidResponse(context, `${key} entries must contain string id, name, and url`);
    }
  }
}

function assertPutDevResourcesResponse(value: unknown, context: string): asserts value is JsonObject {
  if (!isObject(value)) invalidResponse(context, 'expected an object');
  if (value.links_updated === undefined && value.errors === undefined) {
    invalidResponse(context, 'missing links_updated or errors array');
  }
  if (value.links_updated !== undefined) {
    assertResourceArrayResponse(value, 'links_updated', context);
  }
  if (value.errors !== undefined) {
    if (!Array.isArray(value.errors)) invalidResponse(context, 'errors must be an array');
    for (const error of value.errors) {
      if (
        !isObject(error) ||
        (error.id !== undefined && typeof error.id !== 'string') ||
        typeof error.error !== 'string'
      ) {
        invalidResponse(context, 'errors entries must contain a string error and optional string id');
      }
    }
  }
}

function assertComment(value: unknown, context: string): asserts value is JsonObject {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.message !== 'string' ||
    !isObject(value.user)
  ) {
    invalidResponse(context, 'comment must contain string id, string message, and user object');
  }
}
