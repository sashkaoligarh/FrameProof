/**
 * MCP Tool: create_variable_collection
 * Create a new variable collection in a Figma file.
 * Returns existing collection info when a collection with the same name is observed before creation.
 * Requires Enterprise plan + file_variables:write scope.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { getLocalVariables, postVariables } from '../../api/client.js';

export const createVariableCollectionSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  name: z.string().describe('Name for the variable collection'),
  modes: z.array(z.string().trim().min(1).max(255)).min(1).max(40).optional().describe('Mode names for the collection (e.g. ["Light", "Dark"])'),
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
  const collectionTempId = `temp_collection_${randomUUID()}`;
  const modeNames = params.modes ?? ['Mode 1'];
  const modeTempIds = modeNames.map(() => `temp_mode_${randomUUID()}`);

  const variableCollections: Array<{
    action: 'CREATE';
    id: string;
    name: string;
    initialModeId: string;
  }> = [
    {
      action: 'CREATE',
      id: collectionTempId,
      name: params.name,
      initialModeId: modeTempIds[0],
    },
  ];

  const variableModes: Array<{
    action: 'CREATE' | 'UPDATE';
    id: string;
    name: string;
    variableCollectionId?: string;
  }> = [];

  modeNames.forEach((modeName, index) => {
    variableModes.push(index === 0
      ? {
          action: 'UPDATE',
          id: modeTempIds[index],
          name: modeName,
          variableCollectionId: collectionTempId,
        }
      : {
          action: 'CREATE',
          id: modeTempIds[index],
          name: modeName,
          variableCollectionId: collectionTempId,
        });
  });

  const body = { variableCollections, variableModes };

  const response = await postVariables(fileKey, token, body);

  // Get the real ID from tempIdToRealId mapping
  const tempIdToRealId = response.meta?.tempIdToRealId ?? {};
  const realCollectionId = tempIdToRealId[collectionTempId];
  if (!realCollectionId) {
    throw new Error('Figma created the variable collection but did not return its server ID. Refresh variables before retrying.');
  }

  // The write response only guarantees ID mappings, so refetch authoritative modes.
  const refreshed = await getLocalVariables(fileKey, token);
  const createdCollection = refreshed.meta?.variableCollections?.[realCollectionId];
  if (!createdCollection) {
    throw new Error(
      `Figma created variable collection "${params.name}" as "${realCollectionId}", but it was not available during verification. Refresh variables before retrying.`,
    );
  }

  return {
    collection_id: realCollectionId,
    name: createdCollection.name,
    modes: createdCollection.modes,
    created: true,
  };
}
