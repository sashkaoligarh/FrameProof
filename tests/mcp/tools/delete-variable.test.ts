/**
 * T010 — delete_variable tool tests.
 *
 * Coverage:
 * - Success deletion: sends DELETE action, returns { deleted: true, variable_id }
 * - dry_run=true: returns preview without calling postVariables
 * - dry_run=false: calls postVariables
 * - omitted dry_run defaults to a preview
 * - 404 not found error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FigmaApiError } from '../../../src/api/client.js';
import {
  MOCK_FILE_KEY,
  MOCK_TOKEN,
  MOCK_VARIABLE,
  MOCK_GET_VARIABLES_RESPONSE,
  MOCK_POST_VARIABLES_RESPONSE,
} from '../../fixtures/write-api/variables.js';
import { MOCK_404_NOT_FOUND } from '../../fixtures/write-api/errors.js';

vi.mock('../../../src/api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/client.js')>();
  return {
    ...actual,
    getLocalVariables: vi.fn(),
    postVariables: vi.fn(),
  };
});

import { getLocalVariables, postVariables } from '../../../src/api/client.js';
import { handleDeleteVariable } from '../../../src/mcp/tools/delete-variable.js';

const mockGetLocalVariables = vi.mocked(getLocalVariables);
const mockPostVariables = vi.mocked(postVariables);

describe('handleDeleteVariable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success deletion', () => {
    it('returns { deleted: true, variable_id } on success', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleDeleteVariable(
        { file_id: MOCK_FILE_KEY, variable_id: MOCK_VARIABLE.id, dry_run: false },
        MOCK_TOKEN,
      );

      expect(result.deleted).toBe(true);
      expect(result.variable_id).toBe(MOCK_VARIABLE.id);
    });

    it('sends DELETE action in variableChange payload', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleDeleteVariable(
        { file_id: MOCK_FILE_KEY, variable_id: MOCK_VARIABLE.id, dry_run: false },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledOnce();
      const [, , body] = mockPostVariables.mock.calls[0];

      expect(body.variables).toBeDefined();
      const deleteChange = body.variables!.find(
        (v: { action: string; id?: string }) => v.action === 'DELETE' && v.id === MOCK_VARIABLE.id,
      );
      expect(deleteChange).toBeDefined();
    });

    it('calls postVariables with correct file key and token', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleDeleteVariable(
        { file_id: MOCK_FILE_KEY, variable_id: MOCK_VARIABLE.id, dry_run: false },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, expect.any(Object));
    });

    it('extracts file_key from full Figma URL', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const figmaUrl = `https://www.figma.com/design/${MOCK_FILE_KEY}/My-File`;
      await handleDeleteVariable(
        { file_id: figmaUrl, variable_id: MOCK_VARIABLE.id, dry_run: false },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, expect.any(Object));
    });
  });

  describe('dry_run preview', () => {
    it('returns { dry_run: true, would_delete: {...} } without calling postVariables', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);

      const result = await handleDeleteVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          dry_run: true,
        },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).not.toHaveBeenCalled();
      expect(result.dry_run).toBe(true);
      expect(result.would_delete).toBeDefined();
      expect(result.would_delete.variable_id).toBe(MOCK_VARIABLE.id);
    });

    it('includes name and resolved_type in the would_delete preview when variable is found', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);

      const result = await handleDeleteVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          dry_run: true,
        },
        MOCK_TOKEN,
      );

      // MOCK_VARIABLE: name='primary-500', resolvedType='COLOR'
      expect(result.would_delete.name).toBe(MOCK_VARIABLE.name);
      expect(result.would_delete.resolved_type).toBe(MOCK_VARIABLE.resolvedType);
    });

    it('dry_run=false calls postVariables', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleDeleteVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          dry_run: false,
        },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledOnce();
    });

    it('omitting dry_run defaults to a preview', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);

      const result = await handleDeleteVariable(
        { file_id: MOCK_FILE_KEY, variable_id: MOCK_VARIABLE.id },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).not.toHaveBeenCalled();
      expect(result.dry_run).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws FigmaApiError on 404 not found', async () => {
      mockPostVariables.mockRejectedValue(
        new FigmaApiError(MOCK_404_NOT_FOUND.err, MOCK_404_NOT_FOUND.status, MOCK_FILE_KEY),
      );

      await expect(
        handleDeleteVariable(
          { file_id: MOCK_FILE_KEY, variable_id: 'VariableID:NONEXISTENT:0', dry_run: false },
          MOCK_TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws FigmaApiError — preserves the original error type', async () => {
      mockPostVariables.mockRejectedValue(
        new FigmaApiError('Not found', 404, MOCK_FILE_KEY),
      );

      await expect(
        handleDeleteVariable(
          { file_id: MOCK_FILE_KEY, variable_id: 'bad-id', dry_run: false },
          MOCK_TOKEN,
        ),
      ).rejects.toThrow(FigmaApiError);
    });
  });
});
