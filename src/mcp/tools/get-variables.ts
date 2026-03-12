/**
 * MCP Tool: get_variables
 * Retrieve all local variables and collections from a Figma file.
 * Requires Enterprise plan + file_variables:read scope.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { getLocalVariables } from '../../api/client.js';

export const getVariablesSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
};

export interface GetVariablesParams {
  file_id: string;
}

export async function handleGetVariables(
  params: GetVariablesParams,
  token: string,
): Promise<{
  collections: Array<{
    id: string;
    name: string;
    modes: Array<{ modeId: string; name: string }>;
    default_mode_id: string;
    variable_count: number;
    hidden_from_publishing: boolean;
  }>;
  variables: Array<{
    id: string;
    name: string;
    collection_id: string;
    resolved_type: string;
    values_by_mode: Record<string, unknown>;
    scopes: string[];
    hidden_from_publishing: boolean;
  }>;
  total_collections: number;
  total_variables: number;
}> {
  const { file_id: fileKey } = resolveParams(params.file_id);

  process.stderr.write(`[write] GET variables in file ${fileKey}\n`);

  const response = await getLocalVariables(fileKey, token);

  const variableCollections = response.meta?.variableCollections ?? {};
  const variables = response.meta?.variables ?? {};

  const collections = Object.values(variableCollections).map((col) => ({
    id: col.id,
    name: col.name,
    modes: col.modes,
    default_mode_id: col.defaultModeId,
    variable_count: col.variableIds.length,
    hidden_from_publishing: col.hiddenFromPublishing,
  }));

  const variableList = Object.values(variables).map((v) => ({
    id: v.id,
    name: v.name,
    collection_id: v.variableCollectionId,
    resolved_type: v.resolvedType,
    values_by_mode: v.valuesByMode,
    scopes: v.scopes,
    hidden_from_publishing: v.hiddenFromPublishing,
  }));

  return {
    collections,
    variables: variableList,
    total_collections: collections.length,
    total_variables: variableList.length,
  };
}
