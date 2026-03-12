/**
 * T006 — get_variables tool tests.
 *
 * Coverage:
 * - Success: maps variableCollections + variables to snake_case response
 * - Empty file: returns empty collections/variables arrays
 * - Enterprise 403: throws FigmaApiError with status 403
 * - Insufficient scopes 403: throws FigmaApiError with status 403
 * - File key extracted from full Figma URL
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FigmaApiError } from '../../../src/api/client.js';
import {
  MOCK_FILE_KEY,
  MOCK_TOKEN,
  MOCK_COLLECTION,
  MOCK_VARIABLE,
  MOCK_FLOAT_VARIABLE,
  MOCK_GET_VARIABLES_RESPONSE,
  MOCK_EMPTY_VARIABLES_RESPONSE,
} from '../../fixtures/write-api/variables.js';
import {
  MOCK_403_ENTERPRISE,
  MOCK_403_SCOPES,
} from '../../fixtures/write-api/errors.js';

vi.mock('../../../src/api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/client.js')>();
  return {
    ...actual,
    getLocalVariables: vi.fn(),
  };
});

import { getLocalVariables } from '../../../src/api/client.js';
import { handleGetVariables } from '../../../src/mcp/tools/get-variables.js';

const mockGetLocalVariables = vi.mocked(getLocalVariables);

describe('handleGetVariables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success — response mapping', () => {
    it('maps collections and variables to snake_case response', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);

      const result = await handleGetVariables({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(result.collections).toHaveLength(1);
      expect(result.collections[0]).toMatchObject({
        id: MOCK_COLLECTION.id,
        name: MOCK_COLLECTION.name,
        modes: MOCK_COLLECTION.modes,
      });
      expect(typeof result.collections[0].variable_count).toBe('number');

      expect(result.variables).toHaveLength(1);
      expect(result.variables[0]).toMatchObject({
        id: MOCK_VARIABLE.id,
        name: MOCK_VARIABLE.name,
        collection_id: MOCK_VARIABLE.variableCollectionId,
        resolved_type: MOCK_VARIABLE.resolvedType,
        values_by_mode: MOCK_VARIABLE.valuesByMode,
        scopes: MOCK_VARIABLE.scopes,
      });

      expect(result.total_collections).toBe(1);
      expect(result.total_variables).toBe(1);
    });

    it('variable_count reflects the number of variable IDs in the collection', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);

      const result = await handleGetVariables({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      // MOCK_COLLECTION.variableIds has one entry
      expect(result.collections[0].variable_count).toBe(1);
    });

    it('returns empty arrays when file has no variables', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);

      const result = await handleGetVariables({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(result.collections).toHaveLength(0);
      expect(result.variables).toHaveLength(0);
      expect(result.total_collections).toBe(0);
      expect(result.total_variables).toBe(0);
    });

    it('maps multiple variables across a collection', async () => {
      mockGetLocalVariables.mockResolvedValue({
        status: 200,
        error: false,
        meta: {
          variableCollections: {
            [MOCK_COLLECTION.id]: {
              ...MOCK_COLLECTION,
              variableIds: [MOCK_VARIABLE.id, MOCK_FLOAT_VARIABLE.id],
            },
          },
          variables: {
            [MOCK_VARIABLE.id]: MOCK_VARIABLE,
            [MOCK_FLOAT_VARIABLE.id]: MOCK_FLOAT_VARIABLE,
          },
        },
      });

      const result = await handleGetVariables({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(result.collections[0].variable_count).toBe(2);
      expect(result.variables).toHaveLength(2);
      expect(result.total_variables).toBe(2);

      const floatVar = result.variables.find((v: { id: string }) => v.id === MOCK_FLOAT_VARIABLE.id);
      expect(floatVar).toBeDefined();
      expect(floatVar?.resolved_type).toBe('FLOAT');
    });

    it('extracts file_key from a full Figma URL', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);

      const figmaUrl = `https://www.figma.com/design/${MOCK_FILE_KEY}/My-File`;
      await handleGetVariables({ file_id: figmaUrl }, MOCK_TOKEN);

      expect(mockGetLocalVariables).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN);
    });

    it('calls getLocalVariables with correct file key and token', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);

      await handleGetVariables({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(mockGetLocalVariables).toHaveBeenCalledOnce();
      expect(mockGetLocalVariables).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN);
    });
  });

  describe('error handling', () => {
    it('throws FigmaApiError on Enterprise 403', async () => {
      mockGetLocalVariables.mockRejectedValue(
        new FigmaApiError(MOCK_403_ENTERPRISE.err, MOCK_403_ENTERPRISE.status, MOCK_FILE_KEY),
      );

      await expect(
        handleGetVariables({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN),
      ).rejects.toThrow(FigmaApiError);

      await expect(
        handleGetVariables({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('throws FigmaApiError on insufficient scopes 403', async () => {
      mockGetLocalVariables.mockRejectedValue(
        new FigmaApiError(MOCK_403_SCOPES.err, MOCK_403_SCOPES.status, MOCK_FILE_KEY),
      );

      await expect(
        handleGetVariables({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN),
      ).rejects.toThrow(FigmaApiError);

      await expect(
        handleGetVariables({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
