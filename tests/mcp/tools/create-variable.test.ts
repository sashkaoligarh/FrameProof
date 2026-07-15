/**
 * T008 — create_variable tool tests.
 *
 * Coverage:
 * - COLOR variable: hex values auto-converted to RGBA in the API payload
 * - FLOAT variable: numeric values passed through
 * - STRING variable: string values passed through
 * - BOOLEAN variable: boolean values passed through
 * - Idempotency: existing variable with same name in same collection returns existing info
 * - 400 validation error (invalid type)
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
  MOCK_POST_VARIABLES_RESPONSE,
} from '../../fixtures/write-api/variables.js';
import { MOCK_400_VALIDATION } from '../../fixtures/write-api/errors.js';

vi.mock('../../../src/api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/client.js')>();
  return {
    ...actual,
    getLocalVariables: vi.fn(),
    postVariables: vi.fn(),
  };
});

import { getLocalVariables, postVariables } from '../../../src/api/client.js';
import { handleCreateVariable } from '../../../src/mcp/tools/create-variable.js';

const mockGetLocalVariables = vi.mocked(getLocalVariables);
const mockPostVariables = vi.mocked(postVariables);

const BASE_PARAMS = {
  file_id: MOCK_FILE_KEY,
  collection_id: MOCK_COLLECTION.id,
  name: 'new-token',
} as const;

describe('handleCreateVariable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('COLOR variable with hex values', () => {
    it('converts hex #RRGGBB to RGBA in API payload', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariable(
        {
          ...BASE_PARAMS,
          resolved_type: 'COLOR',
          values_by_mode: {
            '123:1': '#FF4136',
          },
        },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledOnce();
      const [, , body] = mockPostVariables.mock.calls[0];

      // variableModeValues should have the converted RGBA, not the raw hex string
      const modeValues = body.variableModeValues ?? [];
      expect(modeValues).toHaveLength(1);

      const colorValue = modeValues[0].value;
      expect(typeof colorValue).toBe('object');
      expect(colorValue).toHaveProperty('r');
      expect(colorValue).toHaveProperty('g');
      expect(colorValue).toHaveProperty('b');
      expect(colorValue).toHaveProperty('a');

      // #FF4136 → r≈1, g≈0.255, b≈0.212, a=1
      expect((colorValue as { r: number }).r).toBeCloseTo(1, 2);
      expect((colorValue as { g: number }).g).toBeCloseTo(0.255, 2);
      expect((colorValue as { b: number }).b).toBeCloseTo(0.212, 2);
      expect((colorValue as { a: number }).a).toBeCloseTo(1, 2);
    });

    it('converts hex #RRGGBBAA (8-digit) to RGBA with alpha', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariable(
        {
          ...BASE_PARAMS,
          resolved_type: 'COLOR',
          values_by_mode: { '123:1': '#FF413680' }, // 50% alpha
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      const colorValue = body.variableModeValues![0].value as { a: number };
      expect(colorValue.a).toBeCloseTo(0.502, 2); // 0x80 / 255 ≈ 0.502
    });

    it('passes RGBA object through without conversion', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const rgbaValue = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
      await handleCreateVariable(
        {
          ...BASE_PARAMS,
          resolved_type: 'COLOR',
          values_by_mode: { '123:1': rgbaValue },
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      expect(body.variableModeValues![0].value).toMatchObject(rgbaValue);
    });

    it('returns variable_id, name, resolved_type, collection_id', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      const result = await handleCreateVariable(
        {
          ...BASE_PARAMS,
          resolved_type: 'COLOR',
          values_by_mode: { '123:1': '#FF4136' },
        },
        MOCK_TOKEN,
      );

      expect(result).toHaveProperty('variable_id');
      expect(result).toHaveProperty('name', 'new-token');
      expect(result).toHaveProperty('resolved_type', 'COLOR');
      expect(result).toHaveProperty('collection_id', MOCK_COLLECTION.id);
    });
  });

  describe('FLOAT variable', () => {
    it('passes numeric values through without conversion', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariable(
        {
          ...BASE_PARAMS,
          resolved_type: 'FLOAT',
          values_by_mode: { '123:1': 8, '123:2': 12 },
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      const values = body.variableModeValues ?? [];
      const lightValue = values.find((v: { modeId: string }) => v.modeId === '123:1');
      expect(lightValue?.value).toBe(8);
    });

    it('sends FLOAT as resolvedType in the variables payload', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariable(
        { ...BASE_PARAMS, resolved_type: 'FLOAT' },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      const varChange = body.variables?.[0];
      expect(varChange?.resolvedType).toBe('FLOAT');
    });
  });

  describe('STRING variable', () => {
    it('passes string values through', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariable(
        {
          ...BASE_PARAMS,
          resolved_type: 'STRING',
          values_by_mode: { '123:1': 'Inter' },
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      expect(body.variableModeValues![0].value).toBe('Inter');
    });
  });

  describe('BOOLEAN variable', () => {
    it('passes boolean values through', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariable(
        {
          ...BASE_PARAMS,
          resolved_type: 'BOOLEAN',
          values_by_mode: { '123:1': true, '123:2': false },
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      const trueVal = body.variableModeValues!.find((v: { modeId: string }) => v.modeId === '123:1');
      const falseVal = body.variableModeValues!.find((v: { modeId: string }) => v.modeId === '123:2');
      expect(trueVal?.value).toBe(true);
      expect(falseVal?.value).toBe(false);
    });
  });

  describe('scopes', () => {
    it('includes scopes in the variable create payload', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariable(
        {
          ...BASE_PARAMS,
          resolved_type: 'COLOR',
          scopes: ['ALL_SCOPES'],
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostVariables.mock.calls[0];
      expect(body.variables?.[0]?.scopes).toEqual(['ALL_SCOPES']);
    });
  });

  describe('idempotency — existing variable', () => {
    it('returns existing variable info without calling postVariables', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);

      // MOCK_VARIABLE: name='primary-500', collection='VariableCollectionId:123:0'
      const result = await handleCreateVariable(
        {
          file_id: MOCK_FILE_KEY,
          collection_id: MOCK_VARIABLE.variableCollectionId,
          name: MOCK_VARIABLE.name,
          resolved_type: 'COLOR',
        },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).not.toHaveBeenCalled();
      expect(result.variable_id).toBe(MOCK_VARIABLE.id);
      expect(result.name).toBe(MOCK_VARIABLE.name);
    });

    it('same name in different collection is not idempotent match', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_GET_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue(MOCK_POST_VARIABLES_RESPONSE);

      await handleCreateVariable(
        {
          file_id: MOCK_FILE_KEY,
          collection_id: 'VariableCollectionId:OTHER:0', // different collection
          name: MOCK_VARIABLE.name, // same name
          resolved_type: 'COLOR',
        },
        MOCK_TOKEN,
      );

      expect(mockPostVariables).toHaveBeenCalledOnce();
    });
  });

  describe('error handling', () => {
    it('throws FigmaApiError on 400 validation error', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockRejectedValue(
        new FigmaApiError(MOCK_400_VALIDATION.err, MOCK_400_VALIDATION.status, MOCK_FILE_KEY),
      );

      await expect(
        handleCreateVariable(
          { ...BASE_PARAMS, resolved_type: 'COLOR' },
          MOCK_TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('never returns a temporary ID when Figma omits the server mapping', async () => {
      mockGetLocalVariables.mockResolvedValue(MOCK_EMPTY_VARIABLES_RESPONSE);
      mockPostVariables.mockResolvedValue({ status: 200, error: false, meta: { tempIdToRealId: {} } });

      await expect(
        handleCreateVariable(
          { ...BASE_PARAMS, resolved_type: 'COLOR' },
          MOCK_TOKEN,
        ),
      ).rejects.toThrow(/did not return its server ID/i);
    });
  });
});
