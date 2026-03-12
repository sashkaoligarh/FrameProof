/**
 * MCP Tool: create_variable
 * Create a new variable in a Figma file.
 * Idempotent: returns existing variable info if variable with same name in same collection exists.
 * Supports hex color auto-conversion for COLOR type variables.
 * Requires Enterprise plan + file_variables:write scope.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { getLocalVariables, postVariables } from '../../api/client.js';
import { resolveColor, isHexColor } from '../utils/color-convert.js';
import type { VariableType, VariableValue } from '../../types/write-api.js';

export const createVariableSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  collection_id: z.string().describe('Variable collection ID to create the variable in'),
  name: z.string().describe('Name for the variable'),
  resolved_type: z.enum(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']).describe('Variable type'),
  values_by_mode: z.record(z.string(), z.unknown()).optional().describe(
    'Values keyed by mode ID. COLOR values can be hex strings (#RRGGBB or #RRGGBBAA) or RGBA objects.',
  ),
  scopes: z.array(z.string()).optional().describe('Variable scopes (e.g. ["ALL_SCOPES", "ALL_FILLS"])'),
};

export interface CreateVariableParams {
  file_id: string;
  collection_id: string;
  name: string;
  resolved_type: VariableType;
  values_by_mode?: Record<string, unknown>;
  scopes?: string[];
}

export async function handleCreateVariable(
  params: CreateVariableParams,
  token: string,
): Promise<{
  variable_id: string;
  name: string;
  resolved_type: string;
  collection_id: string;
  created: boolean;
}> {
  const { file_id: fileKey } = resolveParams(params.file_id);

  process.stderr.write(`[write] CREATE VARIABLE: "${params.name}" in file ${fileKey}\n`);

  // Check for existing variable with same name + collection (idempotency)
  const existingResponse = await getLocalVariables(fileKey, token);
  const existingVariables = existingResponse.meta?.variables ?? {};

  for (const v of Object.values(existingVariables)) {
    if (v.name === params.name && v.variableCollectionId === params.collection_id) {
      process.stderr.write(`[write] Variable "${params.name}" already exists in collection, returning existing.\n`);
      return {
        variable_id: v.id,
        name: v.name,
        resolved_type: v.resolvedType,
        collection_id: v.variableCollectionId,
        created: false,
      };
    }
  }

  const variableTempId = `temp_var_${Date.now()}`;

  // Build variable change
  const variableChange: {
    action: 'CREATE';
    id: string;
    name: string;
    variableCollectionId: string;
    resolvedType: VariableType;
    scopes?: string[];
  } = {
    action: 'CREATE',
    id: variableTempId,
    name: params.name,
    variableCollectionId: params.collection_id,
    resolvedType: params.resolved_type,
  };

  if (params.scopes) {
    variableChange.scopes = params.scopes;
  }

  // Build mode value changes
  const variableModeValues: Array<{
    variableId: string;
    modeId: string;
    value: VariableValue;
  }> = [];

  if (params.values_by_mode) {
    for (const [modeId, rawValue] of Object.entries(params.values_by_mode)) {
      let value: VariableValue;

      if (params.resolved_type === 'COLOR') {
        if (isHexColor(rawValue)) {
          value = resolveColor(rawValue);
        } else if (rawValue && typeof rawValue === 'object' && 'r' in rawValue) {
          value = resolveColor(rawValue as { r: number; g: number; b: number; a: number });
        } else {
          value = rawValue as VariableValue;
        }
      } else {
        value = rawValue as VariableValue;
      }

      variableModeValues.push({
        variableId: variableTempId,
        modeId,
        value,
      });
    }
  }

  const body: {
    variables: typeof variableChange[];
    variableModeValues?: typeof variableModeValues;
  } = {
    variables: [variableChange],
  };

  if (variableModeValues.length > 0) {
    body.variableModeValues = variableModeValues;
  }

  const response = await postVariables(fileKey, token, body);

  // Get the real ID from tempIdToRealId mapping
  const tempIdToRealId = response.meta?.tempIdToRealId ?? {};
  const realVariableId = tempIdToRealId[variableTempId] ?? variableTempId;

  return {
    variable_id: realVariableId,
    name: params.name,
    resolved_type: params.resolved_type,
    collection_id: params.collection_id,
    created: true,
  };
}
