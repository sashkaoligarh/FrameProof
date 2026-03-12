/**
 * MCP Tool: delete_variable
 * Delete a variable from a Figma file.
 * Supports dry_run mode to preview deletion without making API calls.
 * Requires Enterprise plan + file_variables:write scope.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { getLocalVariables, postVariables } from '../../api/client.js';

export const deleteVariableSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  variable_id: z.string().describe('Variable ID to delete'),
  dry_run: z.boolean().optional().default(false).describe(
    'If true, returns preview of what would be deleted without making API calls',
  ),
};

export interface DeleteVariableParams {
  file_id: string;
  variable_id: string;
  dry_run?: boolean;
}

export async function handleDeleteVariable(
  params: DeleteVariableParams,
  token: string,
): Promise<
  | { deleted: true; variable_id: string }
  | { dry_run: true; would_delete: { variable_id: string; name?: string; resolved_type?: string } }
> {
  const { file_id: fileKey } = resolveParams(params.file_id);

  process.stderr.write(`[write] DELETE VARIABLE: "${params.variable_id}" in file ${fileKey}\n`);

  if (params.dry_run) {
    // Get variable info for dry run preview
    const response = await getLocalVariables(fileKey, token);
    const variables = response.meta?.variables ?? {};
    const variable = variables[params.variable_id];

    return {
      dry_run: true,
      would_delete: {
        variable_id: params.variable_id,
        name: variable?.name,
        resolved_type: variable?.resolvedType,
      },
    };
  }

  // Send DELETE action
  await postVariables(fileKey, token, {
    variables: [
      {
        action: 'DELETE',
        id: params.variable_id,
      },
    ],
  });

  return {
    deleted: true,
    variable_id: params.variable_id,
  };
}
