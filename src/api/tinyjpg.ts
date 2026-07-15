/**
 * TinyJPG API client.
 * Compresses JPG/PNG images via https://api.tinify.com/shrink.
 * Never throws - all errors are captured in CompressionResult.
 */

import type { CompressionResult } from '../types/tokens.js';

const TINYJPG_API_URL = 'https://api.tinify.com/shrink';
const TINYJPG_HOSTS = new Set(['api.tinify.com']);
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_INPUT_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_RETRIES = 2;
const MAX_CONFIGURED_RETRIES = 5;
const MAX_JSON_BYTES = 64 * 1024;
const RETRY_BASE_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 30_000;
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

export interface TinyJPGOptions {
  timeoutMs?: number;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  maxRetries?: number;
}

export interface CompressionResultWithMetadata extends CompressionResult {
  compression_count?: number;
}

export interface CompressedImageResult {
  compressed: Uint8Array;
  result: CompressionResultWithMetadata;
}

interface NormalizedOptions {
  timeoutMs: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxRetries: number;
}

/** Check if a format is supported by TinyJPG compression. */
export function isCompressibleFormat(format: string): boolean {
  return format === 'jpg' || format === 'png';
}

/**
 * Compress an image buffer via TinyJPG API.
 * Returns the compressed buffer (or original on failure) and metadata.
 * Never throws - all errors are captured in result.error.
 */
export async function compressImageBuffer(
  buffer: Uint8Array,
  options: TinyJPGOptions = {},
): Promise<CompressedImageResult> {
  const originalSize = buffer.byteLength;
  const normalized = normalizeOptions(options);
  if (typeof normalized === 'string') {
    return failure(buffer, normalized);
  }
  if (originalSize > normalized.maxInputBytes) {
    return failure(
      buffer,
      `TinyJPG input is ${originalSize} bytes, exceeding the ${normalized.maxInputBytes}-byte limit.`,
    );
  }

  const token = process.env.TINYJPG_TOKEN;
  if (!token) {
    return failure(buffer, 'TINYJPG_TOKEN not set');
  }

  const auth = Buffer.from(`api:${token}`, 'utf8').toString('base64');
  let compressionCount: number | undefined;
  try {
    const uploadUrl = new URL(TINYJPG_API_URL);
    if (!isExpectedTinifyUrl(uploadUrl)) {
      return failure(buffer, 'TinyJPG API URL is not an expected HTTPS Tinify host.');
    }

    const uploadResponse = await requestTinify(
      uploadUrl,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}` },
        body: new Uint8Array(buffer),
      },
      normalized,
    );
    compressionCount = parseCompressionCount(uploadResponse);

    if (!uploadResponse.ok) {
      return failure(buffer, getErrorMessage(uploadResponse.status), compressionCount);
    }

    const responseBody = await parseUploadResponse(uploadResponse);
    const outputUrl = new URL(responseBody.outputUrl, uploadUrl);
    if (!isExpectedTinifyUrl(outputUrl)) {
      return failure(
        buffer,
        'TinyJPG returned an untrusted output URL; credentials were not forwarded.',
        compressionCount,
      );
    }

    const downloadResponse = await requestTinify(
      outputUrl,
      {
        method: 'GET',
        headers: { Authorization: `Basic ${auth}` },
      },
      normalized,
    );
    compressionCount = parseCompressionCount(downloadResponse) ?? compressionCount;

    if (!downloadResponse.ok) {
      return failure(
        buffer,
        `Failed to download compressed image: HTTP ${downloadResponse.status}`,
        compressionCount,
      );
    }

    const compressedBuffer = await readBodyWithLimit(downloadResponse, normalized.maxOutputBytes);
    if (compressedBuffer.byteLength === 0) {
      return failure(buffer, 'TinyJPG returned an empty compressed image.', compressionCount);
    }

    const compressedSize = compressedBuffer.byteLength;
    const savingsPercent = originalSize === 0
      ? 0
      : Math.round(((originalSize - compressedSize) / originalSize) * 1000) / 10;

    return {
      compressed: compressedBuffer,
      result: {
        success: true,
        original_size: originalSize,
        compressed_size: compressedSize,
        savings_percent: savingsPercent,
        compression_count: compressionCount,
      },
    };
  } catch (error) {
    const message = sanitizeError(error, token, auth);
    const timeout = isTimeoutError(error);
    return failure(
      buffer,
      timeout
        ? 'TinyJPG API request timed out; the original image was preserved.'
        : `TinyJPG API error: ${message}`,
      compressionCount,
    );
  }
}

function normalizeOptions(options: TinyJPGOptions): NormalizedOptions | string {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return 'TinyJPG timeoutMs must be a positive finite number.';
  }
  if (!Number.isInteger(maxInputBytes) || maxInputBytes <= 0) {
    return 'TinyJPG maxInputBytes must be a positive integer.';
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    return 'TinyJPG maxOutputBytes must be a positive integer.';
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_CONFIGURED_RETRIES) {
    return `TinyJPG maxRetries must be an integer from 0 to ${MAX_CONFIGURED_RETRIES}.`;
  }

  return { timeoutMs, maxInputBytes, maxOutputBytes, maxRetries };
}

async function requestTinify(
  url: URL,
  init: RequestInit,
  options: NormalizedOptions,
): Promise<Response> {
  const safeToRetry = init.method === 'GET';
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      if (!safeToRetry) {
        const detail = isTimeoutError(error)
          ? 'timed out before a response was received'
          : 'failed before a response was received';
        throw new Error(
          `TinyJPG upload ${detail}; it was not retried to avoid ` +
            `duplicate compression usage. Cause: ${errorMessage(error)}`,
        );
      }
      if (attempt >= options.maxRetries) throw error;
      await sleep(retryDelayMs(attempt));
      continue;
    }

    const retryableStatus = safeToRetry && (
      TRANSIENT_STATUSES.has(response.status) || response.status === 429
    );
    if (retryableStatus && attempt < options.maxRetries) {
      const delayMs = retryDelayMs(attempt, response.headers.get('Retry-After'));
      await discardResponse(response);
      await sleep(delayMs);
      continue;
    }

    return response;
  }

  throw new Error('Unexpected: TinyJPG request exhausted retries without a response.');
}

async function parseUploadResponse(response: Response): Promise<{ outputUrl: string }> {
  const bytes = await readBodyWithLimit(response, MAX_JSON_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new Error('TinyJPG returned malformed JSON.');
  }

  if (!isObject(value) || !isObject(value.input)) {
    throw new Error('TinyJPG response is missing input metadata.');
  }
  if (
    typeof value.input.size !== 'number' ||
    !Number.isFinite(value.input.size) ||
    value.input.size < 0 ||
    typeof value.input.type !== 'string'
  ) {
    throw new Error('TinyJPG response contains invalid input metadata.');
  }

  let bodyOutputUrl: string | undefined;
  if (value.output !== undefined) {
    if (!isObject(value.output) || typeof value.output.url !== 'string') {
      throw new Error('TinyJPG response contains invalid output metadata.');
    }
    bodyOutputUrl = value.output.url;
  }

  const outputUrl = response.headers.get('Location') ?? bodyOutputUrl;
  if (!outputUrl) {
    throw new Error('TinyJPG response is missing an output URL.');
  }
  return { outputUrl };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExpectedTinifyUrl(url: URL): boolean {
  return url.protocol === 'https:' &&
    TINYJPG_HOSTS.has(url.hostname.toLowerCase()) &&
    (url.port === '' || url.port === '443') &&
    url.username === '' &&
    url.password === '';
}

async function readBodyWithLimit(response: Response, limit: number): Promise<Uint8Array> {
  const contentLength = response.headers.get('Content-Length');
  if (contentLength !== null && /^\d+$/.test(contentLength.trim())) {
    const declaredLength = Number(contentLength);
    if (declaredLength > limit) {
      throw new Error(`TinyJPG response exceeds the ${limit}-byte output limit.`);
    }
  }

  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error(`TinyJPG response exceeds the ${limit}-byte output limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function parseCompressionCount(response: Response): number | undefined {
  const value = response.headers.get('Compression-Count');
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : undefined;
}

function retryDelayMs(attempt: number, retryAfter: string | null = null): number {
  const parsedRetryAfter = parseRetryAfterMs(retryAfter);
  if (parsedRetryAfter !== null) return Math.min(parsedRetryAfter, MAX_RETRY_DELAY_MS);
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

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    error.message.toLowerCase().includes('timed out')
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeError(error: unknown, token: string, encodedCredentials: string): string {
  return errorMessage(error)
    .replaceAll(token, '[redacted]')
    .replaceAll(encodedCredentials, '[redacted]');
}

async function discardResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The body may already be closed by the fetch implementation.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failure(
  buffer: Uint8Array,
  error: string,
  compressionCount?: number,
): CompressedImageResult {
  return {
    compressed: buffer,
    result: {
      success: false,
      original_size: buffer.byteLength,
      compressed_size: buffer.byteLength,
      savings_percent: 0,
      error,
      compression_count: compressionCount,
    },
  };
}

function getErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return 'TinyJPG API: invalid credentials; check TINYJPG_TOKEN';
    case 415:
      return 'TinyJPG API: unsupported media type';
    case 429:
      return 'TinyJPG API: rate limit exceeded; monthly quota may be exhausted';
    case 400:
    case 413:
      return `TinyJPG API: file too large or invalid request (HTTP ${status})`;
    default:
      if (status >= 500) return `TinyJPG API: server error (HTTP ${status})`;
      return `TinyJPG API: unexpected error (HTTP ${status})`;
  }
}
