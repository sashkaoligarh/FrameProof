import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadImage,
  fetchFigmaFile,
  maskToken,
  postComment,
  putDevResources,
} from '../src/api/client.js';

const validFileResponse = {
  name: 'Test file',
  lastModified: '2026-01-01T00:00:00Z',
  version: '1',
  document: { id: '0:0', name: 'Document', type: 'DOCUMENT' },
  components: {},
  componentSets: {},
  styles: {},
};

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

describe('Figma API networking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retries selected transient GET responses', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(validFileResponse));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchFigmaFile('file-1', 'token');
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ name: 'Test file' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fully redacts tokens without leaking a prefix', () => {
    const token = 'figd_highly-sensitive-token';

    expect(maskToken(token)).toBe('***');
    expect(maskToken(token)).not.toContain(token.slice(0, 5));
  });

  it('retries GET network failures with bounded backoff', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('socket closed'))
      .mockResolvedValueOnce(jsonResponse(validFileResponse));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchFigmaFile('file-1', 'token');
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ version: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries GET timeouts because reads are idempotent', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException('request timed out', 'TimeoutError'))
      .mockResolvedValueOnce(jsonResponse(validFileResponse));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchFigmaFile('file-1', 'token');
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ name: 'Test file' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('parses an HTTP-date Retry-After value', async () => {
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    const retryAt = new Date(Date.now() + 1_000).toUTCString();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', {
        status: 429,
        headers: { 'Retry-After': retryAt },
      }))
      .mockResolvedValueOnce(jsonResponse(validFileResponse));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchFigmaFile('file-1', 'token');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ name: 'Test file' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry malformed successful JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{broken', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchFigmaFile('file-1', 'token')).rejects.toThrow('malformed JSON');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed Figma file shape at the boundary', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ name: 'Incomplete' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchFigmaFile('file-1', 'token')).rejects.toThrow(
      'Invalid Figma API response',
    );
  });

  it('does not retry an ambiguous mutation network failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('connection reset'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postComment('file-1', 'token', { message: 'Hello' })).rejects.toThrow(
      'outcome is unknown',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not automatically retry a rate-limited mutation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', { status: 429, headers: { 'Retry-After': '1' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(postComment('file-1', 'token', { message: 'Hello' })).rejects.toThrow(
      'Automatic retry was skipped',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts an errors-only Dev Resources PUT response', async () => {
    const response = {
      errors: [{ id: 'resource-1', error: 'Resource is not editable' }],
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      putDevResources('token', [{ id: 'resource-1', name: 'Updated' }]),
    ).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT' });
  });

  it('retries safe image downloads after network failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);

    const pending = downloadImage('https://example.test/image.png');
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toHaveProperty('byteLength', 3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
