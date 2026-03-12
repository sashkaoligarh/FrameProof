/**
 * MCP Tool: create_variable_collection
 * Create a new variable collection in a Figma file.
 * Idempotent: returns existing collection info if a collection with the same name already exists.
 * Requires Enterprise plan + file_variables:write scope.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { getLocalVariables, postVariables } from '../../api/client.js';

export const createVariableCollectionSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  name: z.string().describe('Name for the variable collection'),
  modes: z.array(z.string()).optional().describe('Mode names for the collection (e.g. ["Light", "Dark"])'),
};

export interface CreateVariableCollectionParams {
  file_id: string;
  name: string;
  modes?: string[];
}

export async function handleCreateVariableCollection(
  params: CreateVariableCollectionParams,
  token: string,
): Promise<{
  collection_id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  created: boolean;
}> {
  const { file_id: fileKey } = resolveParams(params.file_id);

  process.stderr.write(`[write] CREATE COLLECTION: "${params.name}" in file ${fileKey}\n`);

  // Check for existing collection with same name (idempotency)
  const existingResponse = await getLocalVariables(fileKey, token);
  const existingCollections = existingResponse.meta?.variableCollections ?? {};

  for (const col of Object.values(existingCollections)) {
    if (col.name === params.name) {
      process.stderr.write(`[write] Collection "${params.name}" already exists, returning existing.\n`);
      return {
        collection_id: col.id,
        name: col.name,
        modes: col.modes,
        created: false,
      };
    }
  }

  // Build CREATE request body
  const collectionTempId = `temp_collection_${Date.now()}`;

  const variableCollections: Array<{
    action: 'CREATE';
    id: string;
    name: string;
  }> = [
    {
      action: 'CREATE',
      id: collectionTempId,
      name: params.name,
    },
  ];

  const variableModes: Array<{
    action: 'CREATE';
    id: string;
    name: string;
    variableCollectionId: string;
  }> = [];

  // Add additional modes if specified (first mode is created automatically)
  if (params.modes && params.modes.length > 0) {
    // Rename the default mode to the first specified mode
    // Additional modes need CREATE actions
    params.modes.slice(1).forEach((modeName, idx) => {
      variableModes.push({
        action: 'CREATE',
        id: `temp_mode_${Date.now()}_${idx}`,
        name: modeName,
        variableCollectionId: collectionTempId,
      });
    });
  }

  const body: {
    variableCollections: typeof variableCollections;
    variableModes?: typeof variableModes;
  } = { variableCollections };

  if (variableModes.length > 0) {
    body.variableModes = variableModes;
  }

  const response = await postVariables(fileKey, token, body);

  // Get the real ID from tempIdToRealId mapping
  const tempIdToRealId = response.meta?.tempIdToRealId ?? {};
  const realCollectionId = tempIdToRealId[collectionTempId] ?? collectionTempId;

  // Get the created collection from response
  const createdCollection = response.meta?.variableCollections?.[realCollectionId];

  const modesResult = createdCollection?.modes ?? (params.modes
    ? params.modes.map((name, idx) => ({ modeId: `${Date.now()}:${idx}`, name }))
    : [{ modeId: `${Date.now()}:0`, name: 'Mode 1' }]);

  return {
    collection_id: realCollectionId,
    name: params.name,
    modes: modesResult,
    created: true,
  };
}
