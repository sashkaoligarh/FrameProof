/**
 * MCP Tool: sync_variables
 * Batch create/update/delete variables and collections in a single API call.
 * Supports dry_run mode, 4MB payload size check, and hex→RGBA conversion.
 * Requires Enterprise plan + file_variables:write scope.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { postVariables } from '../../api/client.js';
import { resolveColor, isHexColor } from '../utils/color-convert.js';
import type { VariableValue, VariableType } from '../../types/write-api.js';

// Figma's hard limit for POST /variables is 4MB per request.
// We count total operations × estimated-bytes-per-entry as a fast pre-flight guard.
const FIGMA_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4MB Figma API hard limit

/** Quick O(1) size estimate: count all operations and multiply by a conservative per-entry budget. */
function estimatePayloadBytes(p: SyncVariablesParams): number {
  // Each operation serializes to roughly 200–500 bytes on average (name strings + IDs).
  // We budget 500 bytes per operation as a conservative estimate that accounts for
  // large names, long IDs, and multi-mode value objects.
  const BYTES_PER_ENTRY = 500;
  const totalEntries =
    (p.variable_collections?.length ?? 0) +
    (p.variable_modes?.length ?? 0) +
    (p.variables?.length ?? 0) +
    (p.variable_mode_values?.length ?? 0);
  return totalEntries * BYTES_PER_ENTRY;
}

const variableCollectionChangeSchema = z.union([
  z.object({
    action: z.literal('CREATE'),
    id: z.string(),
    name: z.string(),
    hidden_from_publishing: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('UPDATE'),
    id: z.string(),
    name: z.string().optional(),
    hidden_from_publishing: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('DELETE'),
    id: z.string(),
  }),
]);

const variableModeChangeSchema = z.union([
  z.object({
    action: z.literal('CREATE'),
    id: z.string(),
    name: z.string(),
    variable_collection_id: z.string(),
  }),
  z.object({
    action: z.literal('UPDATE'),
    id: z.string(),
    name: z.string().optional(),
    variable_collection_id: z.string().optional(),
  }),
  z.object({
    action: z.literal('DELETE'),
    id: z.string(),
  }),
]);

const variableChangeSchema = z.union([
  z.object({
    action: z.literal('CREATE'),
    id: z.string(),
    name: z.string(),
    variable_collection_id: z.string(),
    resolved_type: z.enum(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']),
    scopes: z.array(z.string()).optional(),
    hidden_from_publishing: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('UPDATE'),
    id: z.string(),
    name: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    hidden_from_publishing: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('DELETE'),
    id: z.string(),
  }),
]);

const variableModeValueSchema = z.object({
  variable_id: z.string(),
  mode_id: z.string(),
  value: z.unknown(),
});

export const syncVariablesSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  variable_collections: z.array(variableCollectionChangeSchema).optional().describe(
    'Collection create/update/delete actions',
  ),
  variable_modes: z.array(variableModeChangeSchema).optional().describe(
    'Mode create/update/delete actions',
  ),
  variables: z.array(variableChangeSchema).optional().describe(
    'Variable create/update/delete actions',
  ),
  variable_mode_values: z.array(variableModeValueSchema).optional().describe(
    'Mode value assignments. COLOR values can be hex strings or RGBA objects.',
  ),
  dry_run: z.boolean().optional().default(false).describe(
    'If true, returns preview summary without making API calls',
  ),
};

type VariableCollectionChange = z.infer<typeof variableCollectionChangeSchema>;
type VariableModeChange = z.infer<typeof variableModeChangeSchema>;
type VariableChange = z.infer<typeof variableChangeSchema>;
type VariableModeValue = z.infer<typeof variableModeValueSchema>;

export interface SyncVariablesParams {
  file_id: string;
  variable_collections?: VariableCollectionChange[];
  variable_modes?: VariableModeChange[];
  variables?: VariableChange[];
  variable_mode_values?: VariableModeValue[];
  dry_run?: boolean;
}

interface SyncSummary {
  collections_created: number;
  collections_updated: number;
  collections_deleted: number;
  variables_created: number;
  variables_updated: number;
  variables_deleted: number;
  modes_created: number;
  modes_updated: number;
  modes_deleted: number;
  values_set: number;
}

function buildSummary(params: SyncVariablesParams): SyncSummary {
  const collections = params.variable_collections ?? [];
  const variables = params.variables ?? [];
  const modes = params.variable_modes ?? [];
  const values = params.variable_mode_values ?? [];

  return {
    collections_created: collections.filter((c) => c.action === 'CREATE').length,
    collections_updated: collections.filter((c) => c.action === 'UPDATE').length,
    collections_deleted: collections.filter((c) => c.action === 'DELETE').length,
    variables_created: variables.filter((v) => v.action === 'CREATE').length,
    variables_updated: variables.filter((v) => v.action === 'UPDATE').length,
    variables_deleted: variables.filter((v) => v.action === 'DELETE').length,
    modes_created: modes.filter((m) => m.action === 'CREATE').length,
    modes_updated: modes.filter((m) => m.action === 'UPDATE').length,
    modes_deleted: modes.filter((m) => m.action === 'DELETE').length,
    values_set: values.length,
  };
}

export async function handleSyncVariables(
  params: SyncVariablesParams,
  token: string,
): Promise<{
  status: 'applied' | 'dry_run';
  summary: SyncSummary;
  temp_id_to_real_id: Record<string, string>;
}> {
  const { file_id: fileKey } = resolveParams(params.file_id);

  process.stderr.write(`[write] SYNC variables in file ${fileKey}\n`);

  const summary = buildSummary(params);

  if (params.dry_run) {
    return {
      status: 'dry_run',
      summary,
      temp_id_to_real_id: {},
    };
  }

  // Build variableCollections payload
  const variableCollections = (params.variable_collections ?? []).map((c) => {
    if (c.action === 'DELETE') {
      return { action: c.action as 'DELETE', id: c.id };
    }
    if (c.action === 'UPDATE') {
      return {
        action: c.action as 'UPDATE',
        id: c.id,
        ...(c.name !== undefined ? { name: c.name } : {}),
        ...(c.hidden_from_publishing !== undefined ? { hiddenFromPublishing: c.hidden_from_publishing } : {}),
      };
    }
    // CREATE
    return {
      action: c.action as 'CREATE',
      id: c.id,
      name: c.name,
      ...(c.hidden_from_publishing !== undefined ? { hiddenFromPublishing: c.hidden_from_publishing } : {}),
    };
  });

  // Build variableModes payload
  const variableModes = (params.variable_modes ?? []).map((m) => {
    if (m.action === 'DELETE') {
      return { action: m.action as 'DELETE', id: m.id };
    }
    if (m.action === 'UPDATE') {
      return {
        action: m.action as 'UPDATE',
        id: m.id,
        ...(m.name !== undefined ? { name: m.name } : {}),
        ...(m.variable_collection_id !== undefined ? { variableCollectionId: m.variable_collection_id } : {}),
      };
    }
    // CREATE
    return {
      action: m.action as 'CREATE',
      id: m.id,
      name: m.name,
      variableCollectionId: m.variable_collection_id,
    };
  });

  // Build variables payload
  const variables = (params.variables ?? []).map((v) => {
    if (v.action === 'DELETE') {
      return { action: v.action as 'DELETE', id: v.id };
    }
    if (v.action === 'UPDATE') {
      return {
        action: v.action as 'UPDATE',
        id: v.id,
        ...(v.name !== undefined ? { name: v.name } : {}),
        ...(v.scopes !== undefined ? { scopes: v.scopes } : {}),
        ...(v.hidden_from_publishing !== undefined ? { hiddenFromPublishing: v.hidden_from_publishing } : {}),
      };
    }
    // CREATE
    return {
      action: v.action as 'CREATE',
      id: v.id,
      name: v.name,
      variableCollectionId: v.variable_collection_id,
      resolvedType: v.resolved_type as VariableType,
      ...(v.scopes !== undefined ? { scopes: v.scopes } : {}),
      ...(v.hidden_from_publishing !== undefined ? { hiddenFromPublishing: v.hidden_from_publishing } : {}),
    };
  });

  // Build variableModeValues with hex conversion
  const variableModeValues = (params.variable_mode_values ?? []).map((mv) => {
    let value: VariableValue;

    if (isHexColor(mv.value)) {
      value = resolveColor(mv.value);
    } else if (mv.value && typeof mv.value === 'object' && 'r' in mv.value) {
      value = resolveColor(mv.value as { r: number; g: number; b: number; a: number });
    } else {
      value = mv.value as VariableValue;
    }

    return {
      variableId: mv.variable_id,
      modeId: mv.mode_id,
      value,
    };
  });

  // Build the full body
  const body: {
    variableCollections?: typeof variableCollections;
    variableModes?: typeof variableModes;
    variables?: typeof variables;
    variableModeValues?: typeof variableModeValues;
  } = {};

  if (variableCollections.length > 0) body.variableCollections = variableCollections;
  if (variableModes.length > 0) body.variableModes = variableModes;
  if (variables.length > 0) body.variables = variables;
  if (variableModeValues.length > 0) body.variableModeValues = variableModeValues;

  // Pre-flight size check: guard against exceeding Figma's 4MB API limit.
  // We use a conservative per-entry budget estimate for a fast O(1) check.
  const estimatedBytes = estimatePayloadBytes(params);
  if (estimatedBytes > FIGMA_MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Payload too large: estimated ${Math.round(estimatedBytes / 1024 / 1024 * 100) / 100}MB exceeds the 4MB Figma API limit per sync request. ` +
        `Split the sync operation into smaller batches.`,
    );
  }

  const response = await postVariables(fileKey, token, body);

  const tempIdToRealId = response.meta?.tempIdToRealId ?? {};

  return {
    status: 'applied',
    summary,
    temp_id_to_real_id: tempIdToRealId,
  };
}
