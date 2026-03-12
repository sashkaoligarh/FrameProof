/**
 * TinyJPG API client.
 * Compresses JPG/PNG images via https://api.tinify.com/shrink.
 * Never throws — all errors are captured in CompressionResult.
 */

import type { CompressionResult, TinyJPGResponse } from '../types/tokens.js';

const TINYJPG_API_URL = 'https://api.tinify.com/shrink';
const TINYJPG_TIMEOUT_MS = 30_000;

/** Check if a format is supported by TinyJPG compression. */
export function isCompressibleFormat(format: string): boolean {
  return format === 'jpg' || format === 'png';
}

/**
 * Compress an image buffer via TinyJPG API.
 * Returns the compressed buffer (or original on failure) and metadata.
 * Never throws — all errors are captured in result.error.
 */
export async function compressImageBuffer(
  buffer: Uint8Array,
): Promise<{ compressed: Uint8Array; result: CompressionResult }> {
  const originalSize = buffer.byteLength;

  const token = process.env.TINYJPG_TOKEN;
  if (!token) {
    return {
      compressed: buffer,
      result: {
        success: false,
        original_size: originalSize,
        compressed_size: originalSize,
        savings_percent: 0,
        error: 'TINYJPG_TOKEN not set',
      },
    };
  }

  try {
    const auth = btoa(`api:${token}`);

    // Step 1: Upload image to TinyJPG
    const uploadResponse = await fetch(TINYJPG_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(TINYJPG_TIMEOUT_MS),
    });

    // Log monthly compression count from headers
    const compressionCount = uploadResponse.headers.get('Compression-Count');
    if (compressionCount) {
      process.stderr.write(`  TinyJPG monthly usage: ${compressionCount} compressions\n`);
    }

    if (!uploadResponse.ok) {
      const errorMessage = getErrorMessage(uploadResponse.status);
      return {
        compressed: buffer,
        result: {
          success: false,
          original_size: originalSize,
          compressed_size: originalSize,
          savings_percent: 0,
          error: errorMessage,
        },
      };
    }

    const responseBody = (await uploadResponse.json()) as TinyJPGResponse;

    // Step 2: Download compressed image from output.url
    const downloadResponse = await fetch(responseBody.output.url, {
      headers: {
        'Authorization': `Basic ${auth}`,
      },
      signal: AbortSignal.timeout(TINYJPG_TIMEOUT_MS),
    });

    if (!downloadResponse.ok) {
      return {
        compressed: buffer,
        result: {
          success: false,
          original_size: originalSize,
          compressed_size: originalSize,
          savings_percent: 0,
          error: `Failed to download compressed image: HTTP ${downloadResponse.status}`,
        },
      };
    }

    const compressedBuffer = new Uint8Array(await downloadResponse.arrayBuffer());
    const compressedSize = compressedBuffer.byteLength;
    const savingsPercent = Math.round(((originalSize - compressedSize) / originalSize) * 1000) / 10;

    return {
      compressed: compressedBuffer,
      result: {
        success: true,
        original_size: originalSize,
        compressed_size: compressedSize,
        savings_percent: savingsPercent,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout = msg.includes('timed out') || msg.includes('AbortError') || msg.includes('TimeoutError');

    return {
      compressed: buffer,
      result: {
        success: false,
        original_size: originalSize,
        compressed_size: originalSize,
        savings_percent: 0,
        error: isTimeout
          ? 'TinyJPG API request timed out — network may be unreachable'
          : `TinyJPG API error: ${msg}`,
      },
    };
  }
}

function getErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return 'TinyJPG API: invalid credentials — check TINYJPG_TOKEN';
    case 415:
      return 'TinyJPG API: unsupported media type';
    case 429:
      return 'TinyJPG API: rate limit exceeded — monthly quota may be exhausted';
    case 400:
    case 413:
      return `TinyJPG API: file too large or invalid request (HTTP ${status})`;
    default:
      if (status >= 500) {
        return `TinyJPG API: server error (HTTP ${status})`;
      }
      return `TinyJPG API: unexpected error (HTTP ${status})`;
  }
}
