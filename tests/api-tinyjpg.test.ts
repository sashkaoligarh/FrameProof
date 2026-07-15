import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImageBuffer } from '../src/api/tinyjpg.js';

const token = 'tiny-secret-token';
const input = new Uint8Array([1, 2, 3, 4]);

function uploadResponse(
  outputUrl = 'https://api.tinify.com/output/result',
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({
    input: { size: input.byteLength, type: 'image/png' },
    output: { url: outputUrl },
  }), {
    status: 201,
    headers: { 'Compression-Count': '12', ...headers },
  });
}

describe('TinyJPG API client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('TINYJPG_TOKEN', token);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns compression-count metadata on success', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        input: { size: input.byteLength, type: 'image/png' },
      }), {
        status: 201,
        headers: {
          Location: '/output/result',
          'Compression-Count': '12',
        },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([8, 9]), {
        headers: { 'Compression-Count': '13' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await compressImageBuffer(input);

    expect(result.compressed).toEqual(new Uint8Array([8, 9]));
    expect(result.result).toMatchObject({
      success: true,
      compressed_size: 2,
      compression_count: 13,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not forward Basic credentials to a hostile output URL', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      uploadResponse('https://api.tinify.com.attacker.test/output/result'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await compressImageBuffer(input);

    expect(result.result.error).toContain('untrusted output URL');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const uploadInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(uploadInit.headers).toHaveProperty('Authorization');
  });

  it('rejects malformed upload JSON without attempting a download', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{broken', {
        status: 201,
        headers: {
          Location: 'https://api.tinify.com/output/result',
          'Compression-Count': '12',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await compressImageBuffer(input);

    expect(result.result.error).toContain('malformed JSON');
    expect(result.result.compression_count).toBe(12);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports quota errors and their compression count', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', {
        status: 429,
        headers: { 'Compression-Count': '500' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await compressImageBuffer(input);

    expect(result.result.error).toContain('monthly quota');
    expect(result.result.compression_count).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a transient upload response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', { status: 503 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await compressImageBuffer(input, { maxRetries: 1 });

    expect(result.result.error).toContain('server error (HTTP 503)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient compressed-image download response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(uploadResponse())
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([7])));
    vi.stubGlobal('fetch', fetchMock);

    const pending = compressImageBuffer(input, { maxRetries: 1 });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ result: { success: true } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(['POST', 'GET', 'GET']);
  });

  it('does not retry an ambiguous upload network failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('socket closed'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await compressImageBuffer(input);

    expect(result.result.error).toContain('not retried');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a download timeout but not an upload timeout', async () => {
    const timeout = new DOMException('request timed out', 'TimeoutError');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(uploadResponse())
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(new Response(new Uint8Array([7])));
    vi.stubGlobal('fetch', fetchMock);

    const pendingDownload = compressImageBuffer(input, { maxRetries: 1 });
    await vi.runAllTimersAsync();
    await expect(pendingDownload).resolves.toMatchObject({ result: { success: true } });

    fetchMock.mockReset().mockRejectedValue(timeout);
    const failedUpload = await compressImageBuffer(input, { maxRetries: 1 });
    expect(failedUpload.result.error).toContain('timed out');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enforces configurable input and output limits', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(uploadResponse())
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4])));
    vi.stubGlobal('fetch', fetchMock);

    const oversizedInput = await compressImageBuffer(input, { maxInputBytes: 3 });
    expect(oversizedInput.result.error).toContain('input is 4 bytes');
    expect(fetchMock).not.toHaveBeenCalled();

    const oversizedOutput = await compressImageBuffer(input, { maxOutputBytes: 3 });
    expect(oversizedOutput.result.error).toContain('3-byte output limit');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never writes the token to stderr', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await compressImageBuffer(input);

    const output = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).not.toContain(token);
  });
});
