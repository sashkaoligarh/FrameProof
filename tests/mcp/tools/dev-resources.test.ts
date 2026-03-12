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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FigmaApiError } from '../../../src/api/client.js';
import {
  MOCK_FILE_KEY,
  MOCK_TOKEN,
  MOCK_NODE_ID,
  MOCK_DEV_RESOURCE,
  MOCK_DEV_RESOURCE_2,
  MOCK_LIST_RESPONSE,
  MOCK_CREATE_RESPONSE,
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

      expect(result).toHaveProperty('resource_id', MOCK_CREATE_RESPONSE.dev_resources[0].id);
      expect(result).toHaveProperty('name', MOCK_CREATE_RESPONSE.dev_resources[0].name);
      expect(result).toHaveProperty('url', MOCK_CREATE_RESPONSE.dev_resources[0].url);
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
      mockPutDevResources.mockResolvedValue(undefined);

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
      mockPutDevResources.mockResolvedValue(undefined);

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
      mockPutDevResources.mockResolvedValue(undefined);

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
      mockPutDevResources.mockResolvedValue(undefined);

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
        { resource_id: MOCK_DEV_RESOURCE.id },
        MOCK_TOKEN,
      );

      expect(result.deleted).toBe(true);
      expect(result.resource_id).toBe(MOCK_DEV_RESOURCE.id);
    });

    it('calls deleteDevResource with correct token and resource_id', async () => {
      mockDeleteDevResource.mockResolvedValue(undefined);

      await handleDeleteDevResource({ resource_id: MOCK_DEV_RESOURCE.id }, MOCK_TOKEN);

      expect(mockDeleteDevResource).toHaveBeenCalledOnce();
      expect(mockDeleteDevResource).toHaveBeenCalledWith(MOCK_TOKEN, MOCK_DEV_RESOURCE.id);
    });
  });

  describe('error handling — 404 not found', () => {
    it('throws FigmaApiError on 404 not found', async () => {
      mockDeleteDevResource.mockRejectedValue(
        new FigmaApiError(MOCK_404_NOT_FOUND.err, MOCK_404_NOT_FOUND.status, MOCK_DEV_RESOURCE.id),
      );

      await expect(
        handleDeleteDevResource({ resource_id: MOCK_DEV_RESOURCE.id }, MOCK_TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('preserves FigmaApiError type', async () => {
      mockDeleteDevResource.mockRejectedValue(
        new FigmaApiError('Not found', 404, MOCK_DEV_RESOURCE.id),
      );

      await expect(
        handleDeleteDevResource({ resource_id: MOCK_DEV_RESOURCE.id }, MOCK_TOKEN),
      ).rejects.toThrow(FigmaApiError);
    });
  });
});
