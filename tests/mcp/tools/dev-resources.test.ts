/**
 * T018 — Dev Resources API tool tests.
 *
 * Coverage:
 * - list_dev_resources: success with resources, success with node_id filter, empty result, Figma URL extraction
 * - create_dev_resource: success, idempotency (existing URL on node returns existing), max 10 per node validation, stderr logging
 * - update_dev_resource: success, name-only update, url-only update
 * - delete_dev_resource: success (returns deleted: true, resource_id)
 * - Error handling: 404 not found
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FigmaApiError } from '../../../src/api/client.js';
import {
  MOCK_FILE_KEY,
  MOCK_TOKEN,
  MOCK_NODE_ID,
  MOCK_DEV_RESOURCE,
  MOCK_DEV_RESOURCE_2,
  MOCK_LIST_RESPONSE,
  MOCK_CREATE_RESPONSE,
  MOCK_UPDATE_RESPONSE,
} from '../../fixtures/write-api/dev-resources.js';
import { MOCK_404_NOT_FOUND } from '../../fixtures/write-api/errors.js';

vi.mock('../../../src/api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/client.js')>();
  return {
    ...actual,
    getDevResources: vi.fn(),
    postDevResources: vi.fn(),
    putDevResources: vi.fn(),
    deleteDevResource: vi.fn(),
  };
});

import { getDevResources, postDevResources, putDevResources, deleteDevResource } from '../../../src/api/client.js';
import { handleListDevResources } from '../../../src/mcp/tools/list-dev-resources.js';
import { handleCreateDevResource } from '../../../src/mcp/tools/create-dev-resource.js';
import { handleUpdateDevResource } from '../../../src/mcp/tools/update-dev-resource.js';
import { handleDeleteDevResource } from '../../../src/mcp/tools/delete-dev-resource.js';

const mockGetDevResources = vi.mocked(getDevResources);
const mockPostDevResources = vi.mocked(postDevResources);
const mockPutDevResources = vi.mocked(putDevResources);
const mockDeleteDevResource = vi.mocked(deleteDevResource);

// ─── list_dev_resources ───────────────────────────────────

describe('handleListDevResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success with resources', () => {
    it('returns dev_resources array and count', async () => {
      mockGetDevResources.mockResolvedValue(MOCK_LIST_RESPONSE);

      const result = await handleListDevResources({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(result.dev_resources).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.dev_resources[0]).toMatchObject(MOCK_DEV_RESOURCE);
      expect(result.dev_resources[1]).toMatchObject(MOCK_DEV_RESOURCE_2);
    });

    it('calls getDevResources with correct file key and token', async () => {
      mockGetDevResources.mockResolvedValue(MOCK_LIST_RESPONSE);

      await handleListDevResources({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(mockGetDevResources).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, undefined);
    });
  });

  describe('success with node_id filter', () => {
    it('passes node_id to getDevResources', async () => {
      mockGetDevResources.mockResolvedValue(MOCK_LIST_RESPONSE);

      await handleListDevResources({ file_id: MOCK_FILE_KEY, node_id: MOCK_NODE_ID }, MOCK_TOKEN);

      expect(mockGetDevResources).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, MOCK_NODE_ID);
    });

    it('normalizes dash-format node_id to colon format', async () => {
      mockGetDevResources.mockResolvedValue(MOCK_LIST_RESPONSE);

      await handleListDevResources({ file_id: MOCK_FILE_KEY, node_id: '42-100' }, MOCK_TOKEN);

      expect(mockGetDevResources).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, '42:100');
    });
  });

  describe('empty result', () => {
    it('returns empty array and count 0', async () => {
      mockGetDevResources.mockResolvedValue({ dev_resources: [] });

      const result = await handleListDevResources({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(result.dev_resources).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('Figma URL extraction', () => {
    it('extracts file_key from full Figma URL', async () => {
      mockGetDevResources.mockResolvedValue(MOCK_LIST_RESPONSE);

      const figmaUrl = `https://www.figma.com/design/${MOCK_FILE_KEY}/My-File`;
      await handleListDevResources({ file_id: figmaUrl }, MOCK_TOKEN);

      expect(mockGetDevResources).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, undefined);
    });

    it('extracts node_id from Figma URL query params', async () => {
      mockGetDevResources.mockResolvedValue(MOCK_LIST_RESPONSE);

      const figmaUrl = `https://www.figma.com/design/${MOCK_FILE_KEY}/My-File?node-id=42-100`;
      await handleListDevResources({ file_id: figmaUrl }, MOCK_TOKEN);

      expect(mockGetDevResources).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, '42:100');
    });
  });
});

// ─── create_dev_resource ──────────────────────────────────

describe('handleCreateDevResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success', () => {
    it('returns resource_id, name, url, node_id, created: true', async () => {
      mockGetDevResources.mockResolvedValue({ dev_resources: [] });
      mockPostDevResources.mockResolvedValue(MOCK_CREATE_RESPONSE);

      const result = await handleCreateDevResource(
        {
          file_id: MOCK_FILE_KEY,
          node_id: MOCK_NODE_ID,
          name: 'NewComponent.tsx',
          url: 'https://github.com/org/repo/blob/main/src/New.tsx',
        },
        MOCK_TOKEN,
      );

      expect(result).toHaveProperty('resource_id', MOCK_CREATE_RESPONSE.links_created[0].id);
      expect(result).toHaveProperty('name', MOCK_CREATE_RESPONSE.links_created[0].name);
      expect(result).toHaveProperty('url', MOCK_CREATE_RESPONSE.links_created[0].url);
      expect(result).toHaveProperty('node_id');
      expect(result).toHaveProperty('created', true);
    });

    it('calls postDevResources with correct payload', async () => {
      mockGetDevResources.mockResolvedValue({ dev_resources: [] });
      mockPostDevResources.mockResolvedValue(MOCK_CREATE_RESPONSE);

      await handleCreateDevResource(
        {
          file_id: MOCK_FILE_KEY,
          node_id: MOCK_NODE_ID,
          name: 'NewComponent.tsx',
          url: 'https://github.com/org/repo/blob/main/src/New.tsx',
        },
        MOCK_TOKEN,
      );

      expect(mockPostDevResources).toHaveBeenCalledOnce();
      const [calledToken, resources] = mockPostDevResources.mock.calls[0];
      expect(calledToken).toBe(MOCK_TOKEN);
      expect(resources).toHaveLength(1);
      expect(resources[0]).toMatchObject({
        name: 'NewComponent.tsx',
        url: 'https://github.com/org/repo/blob/main/src/New.tsx',
        file_key: MOCK_FILE_KEY,
        node_id: MOCK_NODE_ID,
      });
    });
  });

  describe('idempotency — existing URL on node returns existing', () => {
    it('returns existing resource without calling postDevResources', async () => {
      mockGetDevResources.mockResolvedValue(MOCK_LIST_RESPONSE);

      const result = await handleCreateDevResource(
        {
          file_id: MOCK_FILE_KEY,
          node_id: MOCK_NODE_ID,
          name: 'Button.tsx',
          url: MOCK_DEV_RESOURCE.url,
        },
        MOCK_TOKEN,
      );

      expect(mockPostDevResources).not.toHaveBeenCalled();
      expect(result.resource_id).toBe(MOCK_DEV_RESOURCE.id);
      expect(result.name).toBe(MOCK_DEV_RESOURCE.name);
      expect(result.url).toBe(MOCK_DEV_RESOURCE.url);
      expect(result.created).toBe(false);
    });

    it('does not log an existing sensitive URL', async () => {
      mockGetDevResources.mockResolvedValue(MOCK_LIST_RESPONSE);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      try {
        await handleCreateDevResource(
          {
            file_id: MOCK_FILE_KEY,
            node_id: MOCK_NODE_ID,
            name: 'Button.tsx',
            url: MOCK_DEV_RESOURCE.url,
          },
          MOCK_TOKEN,
        );

        const logged = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(logged).not.toContain(MOCK_DEV_RESOURCE.url);
      } finally {
        stderrSpy.mockRestore();
      }
    });
  });

  describe('max 10 per node validation error', () => {
    it('throws error when node already has 10 dev resources', async () => {
      const tenResources = Array.from({ length: 10 }, (_, i) => ({
        id: `dev_resource_${i}`,
        name: `Resource ${i}`,
        url: `https://example.com/${i}`,
        file_key: MOCK_FILE_KEY,
        node_id: MOCK_NODE_ID,
      }));
      mockGetDevResources.mockResolvedValue({ dev_resources: tenResources });

      await expect(
        handleCreateDevResource(
          {
            file_id: MOCK_FILE_KEY,
            node_id: MOCK_NODE_ID,
            name: 'NewResource.tsx',
            url: 'https://example.com/new',
          },
          MOCK_TOKEN,
        ),
      ).rejects.toThrow(/max 10/i);

      expect(mockPostDevResources).not.toHaveBeenCalled();
    });
  });

  describe('item-level API error', () => {
    it('throws instead of fabricating an ID when Figma creates no link', async () => {
      mockGetDevResources.mockResolvedValue({ dev_resources: [] });
      mockPostDevResources.mockResolvedValue({
        links_created: [],
        errors: [{ file_key: MOCK_FILE_KEY, node_id: MOCK_NODE_ID, error: 'Duplicate URL' }],
      });

      await expect(
        handleCreateDevResource(
          {
            file_id: MOCK_FILE_KEY,
            node_id: MOCK_NODE_ID,
            name: 'NewComponent.tsx',
            url: 'https://example.com/component',
          },
          MOCK_TOKEN,
        ),
      ).rejects.toThrow('Duplicate URL');
    });
  });

  describe('stderr logging', () => {
    it('logs [write] CREATE DEV RESOURCE to stderr', async () => {
      mockGetDevResources.mockResolvedValue({ dev_resources: [] });
      mockPostDevResources.mockResolvedValue(MOCK_CREATE_RESPONSE);

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      await handleCreateDevResource(
        {
          file_id: MOCK_FILE_KEY,
          node_id: MOCK_NODE_ID,
          name: 'NewComponent.tsx',
          url: 'https://github.com/org/repo/blob/main/src/New.tsx',
        },
        MOCK_TOKEN,
      );

      const logged = stderrSpy.mock.calls.map((c) => c[0]).join('');
      expect(logged).toContain('[write] CREATE DEV RESOURCE');
      expect(logged).toContain('NewComponent.tsx');

      stderrSpy.mockRestore();
    });
  });
});

// ─── update_dev_resource ──────────────────────────────────

describe('handleUpdateDevResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success', () => {
    it('returns resource_id and updated_fields', async () => {
      mockPutDevResources.mockResolvedValue(MOCK_UPDATE_RESPONSE);

      const result = await handleUpdateDevResource(
        {
          resource_id: MOCK_DEV_RESOURCE.id,
          name: 'UpdatedButton.tsx',
          url: 'https://github.com/org/repo/blob/main/src/UpdatedButton.tsx',
        },
        MOCK_TOKEN,
      );

      expect(result.resource_id).toBe(MOCK_DEV_RESOURCE.id);
      expect(result.updated_fields).toContain('name');
      expect(result.updated_fields).toContain('url');
    });

    it('calls putDevResources with correct payload', async () => {
      mockPutDevResources.mockResolvedValue(MOCK_UPDATE_RESPONSE);

      await handleUpdateDevResource(
        {
          resource_id: MOCK_DEV_RESOURCE.id,
          name: 'UpdatedButton.tsx',
          url: 'https://github.com/org/repo/blob/main/src/UpdatedButton.tsx',
        },
        MOCK_TOKEN,
      );

      expect(mockPutDevResources).toHaveBeenCalledOnce();
      const [calledToken, resources] = mockPutDevResources.mock.calls[0];
      expect(calledToken).toBe(MOCK_TOKEN);
      expect(resources[0]).toMatchObject({
        id: MOCK_DEV_RESOURCE.id,
        name: 'UpdatedButton.tsx',
        url: 'https://github.com/org/repo/blob/main/src/UpdatedButton.tsx',
      });
    });
  });

  describe('name-only update', () => {
    it('returns updated_fields with only "name"', async () => {
      mockPutDevResources.mockResolvedValue({
        links_updated: [{ ...MOCK_UPDATE_RESPONSE.links_updated![0], name: 'RenamedButton.tsx' }],
      });

      const result = await handleUpdateDevResource(
        { resource_id: MOCK_DEV_RESOURCE.id, name: 'RenamedButton.tsx' },
        MOCK_TOKEN,
      );

      expect(result.updated_fields).toEqual(['name']);
      expect(result.updated_fields).not.toContain('url');
    });
  });

  describe('url-only update', () => {
    it('returns updated_fields with only "url"', async () => {
      mockPutDevResources.mockResolvedValue({
        links_updated: [{
          ...MOCK_UPDATE_RESPONSE.links_updated![0],
          url: 'https://github.com/org/repo/blob/main/src/NewUrl.tsx',
        }],
      });

      const result = await handleUpdateDevResource(
        {
          resource_id: MOCK_DEV_RESOURCE.id,
          url: 'https://github.com/org/repo/blob/main/src/NewUrl.tsx',
        },
        MOCK_TOKEN,
      );

      expect(result.updated_fields).toEqual(['url']);
      expect(result.updated_fields).not.toContain('name');
    });
  });

  describe('item-level API error', () => {
    it('throws when Figma does not confirm the requested update', async () => {
      mockPutDevResources.mockResolvedValue({
        errors: [{ id: MOCK_DEV_RESOURCE.id, error: 'Resource is not editable' }],
      });

      await expect(
        handleUpdateDevResource(
          { resource_id: MOCK_DEV_RESOURCE.id, name: 'RenamedButton.tsx' },
          MOCK_TOKEN,
        ),
      ).rejects.toThrow('Resource is not editable');
    });
  });
});

// ─── delete_dev_resource ──────────────────────────────────

describe('handleDeleteDevResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success', () => {
    it('returns { deleted: true, resource_id }', async () => {
      mockDeleteDevResource.mockResolvedValue(undefined);

      const result = await handleDeleteDevResource(
        { file_id: MOCK_FILE_KEY, resource_id: MOCK_DEV_RESOURCE.id },
        MOCK_TOKEN,
      );

      expect(result.deleted).toBe(true);
      expect(result.resource_id).toBe(MOCK_DEV_RESOURCE.id);
    });

    it('calls deleteDevResource with correct token and resource_id', async () => {
      mockDeleteDevResource.mockResolvedValue(undefined);

      await handleDeleteDevResource(
        { file_id: MOCK_FILE_KEY, resource_id: MOCK_DEV_RESOURCE.id },
        MOCK_TOKEN,
      );

      expect(mockDeleteDevResource).toHaveBeenCalledOnce();
      expect(mockDeleteDevResource).toHaveBeenCalledWith(
        MOCK_FILE_KEY,
        MOCK_TOKEN,
        MOCK_DEV_RESOURCE.id,
      );
    });
  });

  describe('error handling — 404 not found', () => {
    it('throws FigmaApiError on 404 not found', async () => {
      mockDeleteDevResource.mockRejectedValue(
        new FigmaApiError(MOCK_404_NOT_FOUND.err, MOCK_404_NOT_FOUND.status, MOCK_DEV_RESOURCE.id),
      );

      await expect(
        handleDeleteDevResource(
          { file_id: MOCK_FILE_KEY, resource_id: MOCK_DEV_RESOURCE.id },
          MOCK_TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('preserves FigmaApiError type', async () => {
      mockDeleteDevResource.mockRejectedValue(
        new FigmaApiError('Not found', 404, MOCK_DEV_RESOURCE.id),
      );

      await expect(
        handleDeleteDevResource(
          { file_id: MOCK_FILE_KEY, resource_id: MOCK_DEV_RESOURCE.id },
          MOCK_TOKEN,
        ),
      ).rejects.toThrow(FigmaApiError);
    });
  });
});

// ─── HTTP contract ────────────────────────────────────────

describe('Dev Resources HTTP contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses node_ids for the GET filter', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(MOCK_LIST_RESPONSE), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await vi.importActual<typeof import('../../../src/api/client.js')>(
      '../../../src/api/client.js',
    );

    await client.getDevResources(MOCK_FILE_KEY, MOCK_TOKEN, MOCK_NODE_ID);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.figma.com/v1/files/${MOCK_FILE_KEY}/dev_resources?node_ids=42%3A100`,
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('sends the POST body and preserves links_created plus partial errors', async () => {
    const response = {
      ...MOCK_CREATE_RESPONSE,
      errors: [{ file_key: 'other-file', node_id: null, error: 'Node not found' }],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await vi.importActual<typeof import('../../../src/api/client.js')>(
      '../../../src/api/client.js',
    );
    const request = {
      name: 'NewComponent.tsx',
      url: 'https://github.com/org/repo/blob/main/src/New.tsx',
      file_key: MOCK_FILE_KEY,
      node_id: MOCK_NODE_ID,
    };

    const result = await client.postDevResources(MOCK_TOKEN, [request]);

    expect(result).toEqual(response);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.figma.com/v1/dev_resources');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ dev_resources: [request] }),
    });
  });

  it('returns links_updated and item-level PUT errors', async () => {
    const response = {
      ...MOCK_UPDATE_RESPONSE,
      errors: [{ id: 'other-resource', error: 'Resource not found' }],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await vi.importActual<typeof import('../../../src/api/client.js')>(
      '../../../src/api/client.js',
    );
    const request = { id: MOCK_DEV_RESOURCE.id, name: 'UpdatedButton.tsx' };

    const result = await client.putDevResources(MOCK_TOKEN, [request]);

    expect(result).toEqual(response);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ dev_resources: [request] }),
    });
  });

  it('uses the file-scoped DELETE endpoint and accepts an empty response body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = await vi.importActual<typeof import('../../../src/api/client.js')>(
      '../../../src/api/client.js',
    );

    await expect(
      client.deleteDevResource(MOCK_FILE_KEY, MOCK_TOKEN, MOCK_DEV_RESOURCE.id),
    ).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.figma.com/v1/files/${MOCK_FILE_KEY}/dev_resources/${MOCK_DEV_RESOURCE.id}`,
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });
});
