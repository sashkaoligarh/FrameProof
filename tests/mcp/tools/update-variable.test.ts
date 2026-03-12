/**
 * T009 — update_variable tool tests.
 *
 * Coverage:
 * - Name update: sends UPDATE action with new name
 * - values_by_mode update: hex colors are converted to RGBA in mode values
 * - Scopes update: updated scopes are sent in the payload
 * - Updated fields list: response lists what was changed
 * - 404 not found error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FigmaApiError } from '../../../src/api/client.js';
import {
  MOCK_FILE_KEY,
  MOCK_TOKEN,
  MOCK_VARIABLE,
  MOCK_POST_VARIABLES_RESPONSE,
} from '../../fixtures/write-api/variables.js';
import { MOCK_404_NOT_FOUND } from '../../fixtures/write-api/errors.js';

vi.mock('../../../src/api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/client.js')>();
  return {
    ...actual,
    postVariables: vi.fn(),
  };
});

import { postVariables } from '../../../src/api/client.js';
import { handleUpdateVariable } from '../../../src/mcp/tools/update-variable.js';

const mockPostVariables = vi.mocked(postVariables);

describe('handleUpdateVariable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('name update', () => {
    it('sends UPDATE action with new name for the variable', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleUpdateVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          name: 'primary-600',
        },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledOnce();
      const [, , body] = mockPostVariables.mock.calls[0];

      expect(body.variables).toBeDefined();
      const updateChange = body.variables!.find(
        (v: { action: string; id?: string }) => v.action === 'UPDATE' && v.id === MOCK_VARIABLE.id,
      );
      expect(updateChange).toBeDefined();
      expect(updateChange?.name).toBe('primary-600');
    });

    it('returns variable_id and updated_fields containing "name"', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleUpdateVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          name: 'primary-600',
        },
        MOCK_TOKEN,
      );

      expect(result.variable_id).toBe(MOCK_VARIABLE.id);
      expect(result.updated_fields).toContain('name');
    });
  });

  describe('values_by_mode update', () => {
    it('converts hex colors in values_by_mode to RGBA', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleUpdateVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          values_by_mode: { '123:1': '#0000FF' },
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      const modeValues = body.variableModeValues ?? [];
      expect(modeValues).toHaveLength(1);

      const colorValue = modeValues[0].value as { r: number; g: number; b: number; a: number };
      // #0000FF → r=0, g=0, b=1, a=1
      expect(colorValue.r).toBeCloseTo(0, 5);
      expect(colorValue.g).toBeCloseTo(0, 5);
      expect(colorValue.b).toBeCloseTo(1, 5);
      expect(colorValue.a).toBeCloseTo(1, 5);
    });

    it('passes numeric FLOAT values through without modification', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleUpdateVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          values_by_mode: { '123:1': 16 },
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      expect(body.variableModeValues![0].value).toBe(16);
    });

    it('sends correct variable_id and mode_id in variableModeValues', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleUpdateVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          values_by_mode: { '123:1': 8 },
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      expect(body.variableModeValues![0].variableId).toBe(MOCK_VARIABLE.id);
      expect(body.variableModeValues![0].modeId).toBe('123:1');
    });

    it('returns updated_fields containing "values_by_mode"', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleUpdateVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          values_by_mode: { '123:1': '#FF0000' },
        },
        MOCK_TOKEN,
      );

      expect(result.updated_fields).toContain('values_by_mode');
    });
  });

  describe('scopes update', () => {
    it('sends updated scopes in the variables UPDATE change', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleUpdateVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          scopes: ['ALL_FILLS'],
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      const updateChange = body.variables!.find(
        (v: { action: string; id?: string }) => v.action === 'UPDATE' && v.id === MOCK_VARIABLE.id,
      );
      expect(updateChange?.scopes).toEqual(['ALL_FILLS']);
    });

    it('returns updated_fields containing "scopes"', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleUpdateVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          scopes: ['ALL_FILLS'],
        },
        MOCK_TOKEN,
      );

      expect(result.updated_fields).toContain('scopes');
    });
  });

  describe('multiple fields updated simultaneously', () => {
    it('lists all updated fields in the response', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleUpdateVariable(
        {
          file_id: MOCK_FILE_KEY,
          variable_id: MOCK_VARIABLE.id,
          name: 'renamed-token',
          values_by_mode: { '123:1': '#FFFFFF' },
          scopes: ['ALL_SCOPES'],
        },
        MOCK_TOKEN,
      );

      expect(result.updated_fields).toContain('name');
      expect(result.updated_fields).toContain('values_by_mode');
      expect(result.updated_fields).toContain('scopes');
    });
  });

  describe('error handling', () => {
    it('throws FigmaApiError on 404 not found', async () => {
      mockPostVariables.mockRejectedValue(
        new FigmaApiError(MOCK_404_NOT_FOUND.err, MOCK_404_NOT_FOUND.status, MOCK_FILE_KEY),
      );

      await expect(
        handleUpdateVariable(
          {
            file_id: MOCK_FILE_KEY,
            variable_id: 'VariableID:NONEXISTENT:0',
            name: 'new-name',
          },
          MOCK_TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws FigmaApiError — preserves the original error instance', async () => {
      const err = new FigmaApiError(MOCK_404_NOT_FOUND.err, 404, MOCK_FILE_KEY);
      mockPostVariables.mockRejectedValue(err);

      await expect(
        handleUpdateVariable(
          { file_id: MOCK_FILE_KEY, variable_id: 'bad-id', name: 'x' },
          MOCK_TOKEN,
        ),
      ).rejects.toThrow(FigmaApiError);
    });

    it('extracts file_key from full Figma URL', async () => {
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const figmaUrl = `https://www.figma.com/design/${MOCK_FILE_KEY}/My-File`;
      await handleUpdateVariable(
        { file_id: figmaUrl, variable_id: MOCK_VARIABLE.id, name: 'new-name' },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, expect.any(Object));
    });
  });
});
