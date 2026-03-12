/**
 * Shared fixtures for Variables API tests.
 */

import type {
  GetLocalVariablesResponse,
  PostVariablesResponse,
  FigmaVariableCollectionResponse,
  FigmaVariableResponse,
} from '../../../src/types/write-api.js';

export const MOCK_FILE_KEY = 'abc123';
export const MOCK_TOKEN = 'figd_test_token_123';

export const MOCK_COLLECTION: FigmaVariableCollectionResponse = {
  id: 'VariableCollectionId:123:0',
  name: 'Brand Colors',
  modes: [
    { modeId: '123:1', name: 'Light' },
    { modeId: '123:2', name: 'Dark' },
  ],
  defaultModeId: '123:1',
  hiddenFromPublishing: false,
  variableIds: ['VariableID:456:0'],
};

export const MOCK_VARIABLE: FigmaVariableResponse = {
  id: 'VariableID:456:0',
  name: 'primary-500',
  variableCollectionId: 'VariableCollectionId:123:0',
  resolvedType: 'COLOR',
  valuesByMode: {
    '123:1': { r: 1, g: 0.255, b: 0.212, a: 1 },
    '123:2': { r: 0.8, g: 0.2, b: 0.17, a: 1 },
  },
  scopes: ['ALL_SCOPES'],
  hiddenFromPublishing: false,
};

export const MOCK_FLOAT_VARIABLE: FigmaVariableResponse = {
  id: 'VariableID:789:0',
  name: 'spacing-sm',
  variableCollectionId: 'VariableCollectionId:123:0',
  resolvedType: 'FLOAT',
  valuesByMode: {
    '123:1': 8,
    '123:2': 12,
  },
  scopes: ['ALL_SCOPES'],
  hiddenFromPublishing: false,
};

export const MOCK_GET_VARIABLES_RESPONSE: GetLocalVariablesResponse = {
  status: 200,
  error: false,
  meta: {
    variableCollections: {
      'VariableCollectionId:123:0': MOCK_COLLECTION,
    },
    variables: {
      'VariableID:456:0': MOCK_VARIABLE,
    },
  },
};

export const MOCK_POST_VARIABLES_RESPONSE: PostVariablesResponse = {
  status: 200,
  error: false,
  meta: {
    tempIdToRealId: {
      'temp_collection_1': 'VariableCollectionId:789:0',
      'temp_var_1': 'VariableID:999:0',
    },
    variableCollections: {},
    variables: {},
  },
};

export const MOCK_EMPTY_VARIABLES_RESPONSE: GetLocalVariablesResponse = {
  status: 200,
  error: false,
  meta: {
    variableCollections: {},
    variables: {},
  },
};
