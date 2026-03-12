/**
 * T007 — create_variable_collection tool tests.
 *
 * Coverage:
 * - Success: creates collection, returns collection_id + name + modes
 * - Idempotency: existing collection with same name returns existing info (no API write)
 * - 403 Enterprise error
 * - 403 Insufficient scopes error
 * - 429 Rate limit error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FigmaApiError } from '../../../src/api/client.js';
import {
  MOCK_FILE_KEY,
  MOCK_TOKEN,
  MOCK_COLLECTION,
  MOCK_GET_VARIABLES_RESPONSE,
  MOCK_EMPTY_VARIABLES_RESPONSE,
  MOCK_POST_VARIABLES_RESPONSE,
} from '../../fixtures/write-api/variables.js';
import {
  MOCK_403_ENTERPRISE,
  MOCK_403_SCOPES,
  MOCK_429_RATE_LIMIT,
} from '../../fixtures/write-api/errors.js';

vi.mock('../../../src/api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/client.js')>();
  return {
    ...actual,
    getLocalVariables: vi.fn(),
    postVariables: vi.fn(),
  };
});

import { getLocalVariables, postVariables } from '../../../src/api/client.js';
import { handleCreateVariableCollection } from '../../../src/mcp/tools/create-variable-collection.js';

const mockGetLocalVariables = vi.mocked(getLocalVariables);
const mockPostVariables = vi.mocked(postVariables);

describe('handleCreateVariableCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success — creates new collection', () => {
    it('returns collection_id, name, and modes on success', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleCreateVariableCollection(
        { file_id: MOCK_FILE_KEY, name: 'Brand Colors' },
        MOCK_TOKEN,
      );

      expect(result).toHaveProperty('collection_id');
      expect(result).toHaveProperty('name', 'Brand Colors');
      expect(result).toHaveProperty('modes');
      expect(Array.isArray(result.modes)).toBe(true);
    });

    it('creates collection with specified modes', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariableCollection(
        { file_id: MOCK_FILE_KEY, name: 'Brand Colors', modes: ['Light', 'Dark'] },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledOnce();
      const [, , body] = mockPostVariables.mock.calls[0];

      // Should include a collection CREATE action
      expect(body.variableCollections).toBeDefined();
      expect(body.variableCollections!.some((c: { action: string }) => c.action === 'CREATE')).toBe(true);
    });

    it('calls postVariables with correct file key and token', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariableCollection(
        { file_id: MOCK_FILE_KEY, name: 'New Collection' },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, expect.any(Object));
    });

    it('extracts file_key from full Figma URL', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const figmaUrl = `https://www.figma.com/design/${MOCK_FILE_KEY}/My-File`;
      await handleCreateVariableCollection(
        { file_id: figmaUrl, name: 'New Collection' },
        MOCK_TOKEN,
      );

      expect(mockGetLocalVariables).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN);
      expect(mockPostVariables).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, expect.any(Object));
    });
  });

  describe('idempotency — existing collection', () => {
    it('returns existing collection info without calling postVariables', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);

      // MOCK_COLLECTION.name = 'Brand Colors'
      const result = await handleCreateVariableCollection(
        { file_id: MOCK_FILE_KEY, name: MOCK_COLLECTION.name },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).not.toHaveBeenCalled();
      expect(result.collection_id).toBe(MOCK_COLLECTION.id);
      expect(result.name).toBe(MOCK_COLLECTION.name);
    });

    it('check is case-sensitive — different case creates new collection', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariableCollection(
        { file_id: MOCK_FILE_KEY, name: 'brand colors' }, // lowercase
        MOCK_TOKEN,
      );

      // Should attempt to create since names are different
      expect(mockPostVariables).toHaveBeenCalledOnce();
    });
  });

  describe('error handling', () => {
    it('throws FigmaApiError on Enterprise 403', async () => {
      mockGetLocalVariables.mockRejectedValue(
        new FigmaApiError(MOCK_403_ENTERPRISE.err, MOCK_403_ENTERPRISE.status, MOCK_FILE_KEY),
      );

      await expect(
        handleCreateVariableCollection(
          { file_id: MOCK_FILE_KEY, name: 'Brand Colors' },
          MOCK_TOKEN,
        ),
      ).rejects.toThrow(FigmaApiError);
    });

    it('throws FigmaApiError on insufficient scopes 403 from postVariables', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockRejectedValue(
        new FigmaApiError(MOCK_403_SCOPES.err, MOCK_403_SCOPES.status, MOCK_FILE_KEY),
      );

      await expect(
        handleCreateVariableCollection(
          { file_id: MOCK_FILE_KEY, name: 'New Collection' },
          MOCK_TOKEN,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('throws FigmaApiError on 429 rate limit', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockRejectedValue(
        new FigmaApiError(MOCK_429_RATE_LIMIT.err, MOCK_429_RATE_LIMIT.status, MOCK_FILE_KEY),
      );

      await expect(
        handleCreateVariableCollection(
          { file_id: MOCK_FILE_KEY, name: 'New Collection' },
          MOCK_TOKEN,
        ),
      ).rejects.toMatchObject({ status: 429 });
    });
  });
});
