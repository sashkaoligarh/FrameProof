/**
 * T011 — sync_variables tool tests.
 *
 * Coverage:
 * - Batch create: collections + variables sent in a single postVariables call
 * - Batch update: UPDATE actions in the payload
 * - Batch delete: DELETE actions in the payload
 * - tempId mapping: response includes temp_id_to_real_id from API response
 * - dry_run: returns preview summary without calling postVariables
 * - 4MB payload error: throws when serialized payload exceeds size limit
 * - Summary stats: response counts operations by category
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FigmaApiError } from '../../../src/api/client.js';
import {
  MOCK_FILE_KEY,
  MOCK_TOKEN,
  MOCK_COLLECTION,
  MOCK_VARIABLE,
  MOCK_POST_VARIABLES_RESPONSE,
} from '../../fixtures/write-api/variables.js';

vi.mock('../../../src/api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/client.js')>();
  return {
    ...actual,
    postVariables: vi.fn(),
  };
});

import { postVariables } from '../../../src/api/client.js';
import { handleSyncVariables } from '../../../src/mcp/tools/sync-variables.js';

const mockPostVariables = vi.mocked(postVariables);

describe('handleSyncVariables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('batch create', () => {
    it('sends collection CREATE and variable CREATE in a single postVariables call', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_collections: [
            { action: 'CREATE', id: 'temp_collection_1', name: 'Brand Colors' },
          ],
          variables: [
            {
              action: 'CREATE',
              id: 'temp_var_1',
              name: 'primary-500',
              variable_collection_id: 'temp_collection_1',
              resolved_type: 'COLOR',
            },
          ],
        },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledOnce();
      const [fileKey, token, body] = mockPostVariables.mock.calls[0];
      expect(fileKey).toBe(MOCK_FILE_KEY);
      expect(token).toBe(MOCK_TOKEN);

      const collCreate = body.variableCollections?.find(
        (c: { action: string }) => c.action === 'CREATE',
      );
      expect(collCreate).toBeDefined();

      const varCreate = body.variables?.find(
        (v: { action: string }) => v.action === 'CREATE',
      );
      expect(varCreate).toBeDefined();
    });

    it('returns status "applied" after successful batch create', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_collections: [
            { action: 'CREATE', id: 'temp_collection_1', name: 'Brand Colors' },
          ],
        },
        MOCK_TOKEN,
      );

      expect(result.status).toBe('applied');
    });

    it('includes summary with collections_created count', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_collections: [
            { action: 'CREATE', id: 'temp_1', name: 'Coll A' },
            { action: 'CREATE', id: 'temp_2', name: 'Coll B' },
          ],
        },
        MOCK_TOKEN,
      );

      expect(result.summary.collections_created).toBe(2);
    });

    it('includes summary with variables_created count', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variables: [
            { action: 'CREATE', id: 'temp_1', name: 'var-a', variable_collection_id: MOCK_COLLECTION.id, resolved_type: 'FLOAT' },
            { action: 'CREATE', id: 'temp_2', name: 'var-b', variable_collection_id: MOCK_COLLECTION.id, resolved_type: 'STRING' },
          ],
        },
        MOCK_TOKEN,
      );

      expect(result.summary.variables_created).toBe(2);
    });
  });

  describe('batch update', () => {
    it('sends UPDATE actions for variables', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variables: [
            { action: 'UPDATE', id: MOCK_VARIABLE.id, name: 'primary-600' },
          ],
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      const varUpdate = body.variables?.find(
        (v: { action: string; id?: string }) => v.action === 'UPDATE' && v.id === MOCK_VARIABLE.id,
      );
      expect(varUpdate).toBeDefined();
    });

    it('includes summary with variables_updated count', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variables: [
            { action: 'UPDATE', id: MOCK_VARIABLE.id, name: 'renamed' },
          ],
        },
        MOCK_TOKEN,
      );

      expect(result.summary.variables_updated).toBe(1);
    });
  });

  describe('batch delete', () => {
    it('sends DELETE actions for variables', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variables: [
            { action: 'DELETE', id: MOCK_VARIABLE.id },
          ],
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      const varDelete = body.variables?.find(
        (v: { action: string; id?: string }) => v.action === 'DELETE' && v.id === MOCK_VARIABLE.id,
      );
      expect(varDelete).toBeDefined();
    });

    it('includes summary with variables_deleted and collections_deleted counts', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_collections: [
            { action: 'DELETE', id: MOCK_COLLECTION.id },
          ],
          variables: [
            { action: 'DELETE', id: MOCK_VARIABLE.id },
          ],
        },
        MOCK_TOKEN,
      );

      expect(result.summary.collections_deleted).toBe(1);
      expect(result.summary.variables_deleted).toBe(1);
    });
  });

  describe('tempId mapping', () => {
    it('returns temp_id_to_real_id from API response', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_collections: [
            { action: 'CREATE', id: 'temp_collection_1', name: 'Brand Colors' },
          ],
          variables: [
            { action: 'CREATE', id: 'temp_var_1', name: 'primary-500', variable_collection_id: 'temp_collection_1', resolved_type: 'COLOR' },
          ],
        },
        MOCK_TOKEN,
      );

      // MOCK_POST_VARIABLES_RESPONSE.meta.tempIdToRealId maps temp_collection_1 → real ID
      expect(result.temp_id_to_real_id).toBeDefined();
      expect(result.temp_id_to_real_id['temp_collection_1']).toBe('VariableCollectionId:789:0');
      expect(result.temp_id_to_real_id['temp_var_1']).toBe('VariableID:999:0');
    });

    it('returns empty temp_id_to_real_id when API returns no mapping', async () => {
      mockPostVariables.mockResolvedValue({
        status: 200,
        error: false,
        meta: {
          tempIdToRealId: {},
          variableCollections: {},
          variables: {},
        },
      });

      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variables: [
            { action: 'UPDATE', id: MOCK_VARIABLE.id, name: 'renamed' },
          ],
        },
        MOCK_TOKEN,
      );

      expect(result.temp_id_to_real_id).toEqual({});
    });
  });

  describe('dry_run preview', () => {
    it('does NOT call postVariables when dry_run=true', async () => {
      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_collections: [
            { action: 'CREATE', id: 'temp_1', name: 'New Collection' },
          ],
          variables: [
            { action: 'CREATE', id: 'temp_2', name: 'new-var', variable_collection_id: 'temp_1', resolved_type: 'FLOAT' },
          ],
          dry_run: true,
        },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).not.toHaveBeenCalled();
      expect(result.status).toBe('dry_run');
    });

    it('returns a summary with correct counts in dry_run mode', async () => {
      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_collections: [
            { action: 'CREATE', id: 'temp_1', name: 'New Collection' },
          ],
          variables: [
            { action: 'CREATE', id: 'temp_2', name: 'var-a', variable_collection_id: 'temp_1', resolved_type: 'FLOAT' },
            { action: 'UPDATE', id: MOCK_VARIABLE.id, name: 'renamed' },
            { action: 'DELETE', id: 'some-var-id' },
          ],
          dry_run: true,
        },
        MOCK_TOKEN,
      );

      expect(result.summary.collections_created).toBe(1);
      expect(result.summary.variables_created).toBe(1);
      expect(result.summary.variables_updated).toBe(1);
      expect(result.summary.variables_deleted).toBe(1);
    });
  });

  describe('summary structure', () => {
    it('response summary contains all required keys', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_collections: [{ action: 'CREATE', id: 'temp_1', name: 'C' }],
          variables: [{ action: 'CREATE', id: 'temp_2', name: 'v', variable_collection_id: 'temp_1', resolved_type: 'STRING' }],
          variable_mode_values: [{ variable_id: 'temp_2', mode_id: '123:1', value: 'hello' }],
        },
        MOCK_TOKEN,
      );

      const summary = result.summary;
      expect(summary).toHaveProperty('collections_created');
      expect(summary).toHaveProperty('collections_updated');
      expect(summary).toHaveProperty('collections_deleted');
      expect(summary).toHaveProperty('variables_created');
      expect(summary).toHaveProperty('variables_updated');
      expect(summary).toHaveProperty('variables_deleted');
      expect(summary).toHaveProperty('modes_created');
      expect(summary).toHaveProperty('modes_updated');
      expect(summary).toHaveProperty('modes_deleted');
      expect(summary).toHaveProperty('values_set');
    });

    it('counts values_set from variable_mode_values length', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_mode_values: [
            { variable_id: MOCK_VARIABLE.id, mode_id: '123:1', value: 8 },
            { variable_id: MOCK_VARIABLE.id, mode_id: '123:2', value: 12 },
          ],
        },
        MOCK_TOKEN,
      );

      expect(result.summary.values_set).toBe(2);
    });
  });

  describe('4MB payload size limit', () => {
    it('throws an error when payload exceeds 4MB', async () => {
      // Generate a payload that will serialize to > 4MB
      const largeVariables = Array.from({ length: 10_000 }, (_, i) => ({
        action: 'CREATE' as const,
        id: `temp_var_${i}`,
        name: `variable-with-a-very-long-name-to-inflate-size-${i}`,
        variable_collection_id: MOCK_COLLECTION.id,
        resolved_type: 'STRING' as const,
      }));

      await expect(
        handleSyncVariables(
          {
            file_id: MOCK_FILE_KEY,
            variables: largeVariables,
          },
          MOCK_TOKEN,
        ),
      ).rejects.toThrow(/4MB|payload|too large/i);

      // postVariables should not be called if validation fails before the request
      expect(mockPostVariables).not.toHaveBeenCalled();
    });
  });

  describe('hex color conversion in variable_mode_values', () => {
    it('converts hex colors in variable_mode_values to RGBA', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleSyncVariables(
        {
          file_id: MOCK_FILE_KEY,
          variable_mode_values: [
            { variable_id: MOCK_VARIABLE.id, mode_id: '123:1', value: '#FF0000' },
          ],
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      const modeValue = body.variableModeValues![0];
      const color = modeValue.value as { r: number; g: number; b: number; a: number };
      expect(color.r).toBeCloseTo(1, 5);
      expect(color.g).toBeCloseTo(0, 5);
      expect(color.b).toBeCloseTo(0, 5);
      expect(color.a).toBeCloseTo(1, 5);
    });
  });
});
