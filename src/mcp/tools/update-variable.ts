/**
 * MCP Tool: update_variable
 * Update an existing variable in a Figma file.
 * Supports updating name, mode values (with hex→RGBA conversion), and scopes.
 * Requires Enterprise plan + file_variables:write scope.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { postVariables } from '../../api/client.js';
import { resolveColor, isHexColor } from '../utils/color-convert.js';
import type { VariableValue } from '../../types/write-api.js';

export const updateVariableSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  variable_id: z.string().describe('Variable ID to update'),
  name: z.string().optional().describe('New name for the variable'),
  values_by_mode: z.record(z.string(), z.unknown()).optional().describe(
    'Mode values to update. COLOR values can be hex strings (#RRGGBB) or RGBA objects.',
  ),
  scopes: z.array(z.string()).optional().describe('Updated variable scopes'),
};

export interface UpdateVariableParams {
  file_id: string;
  variable_id: string;
  name?: string;
  values_by_mode?: Record<string, unknown>;
  scopes?: string[];
}

export async function handleUpdateVariable(
  params: UpdateVariableParams,
  token: string,
): Promise<{
  variable_id: string;
  updated_fields: string[];
}> {
  const { file_id: fileKey } = resolveParams(params.file_id);

  process.stderr.write(`[write] UPDATE VARIABLE: "${params.variable_id}" in file ${fileKey}\n`);

  const updatedFields: string[] = [];

  // Build variable UPDATE change
  const variableChange: {
    action: 'UPDATE';
    id: string;
    name?: string;
    scopes?: string[];
  } = {
    action: 'UPDATE',
    id: params.variable_id,
  };

  if (params.name !== undefined) {
    variableChange.name = params.name;
    updatedFields.push('name');
  }

  if (params.scopes !== undefined) {
    variableChange.scopes = params.scopes;
    updatedFields.push('scopes');
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

      if (isHexColor(rawValue)) {
        value = resolveColor(rawValue);
      } else if (rawValue && typeof rawValue === 'object' && 'r' in rawValue) {
        value = resolveColor(rawValue as { r: number; g: number; b: number; a: number });
      } else {
        value = rawValue as VariableValue;
      }

      variableModeValues.push({
        variableId: params.variable_id,
        modeId,
        value,
      });
    }
    updatedFields.push('values_by_mode');
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

  await postVariables(fileKey, token, body);

  return {
    variable_id: params.variable_id,
    updated_fields: updatedFields,
  };
}
