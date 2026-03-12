/**
 * MCP Tool: list_dev_resources
 * List dev resources for a Figma file, optionally filtered by node_id.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { getDevResources } from '../../api/client.js';
import type { DevResourceResponse } from '../../types/write-api.js';

export const listDevResourcesSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  node_id: z.string().optional().describe('Optional node ID to filter dev resources'),
};

export interface ListDevResourcesParams {
  file_id: string;
  node_id?: string;
}

export async function handleListDevResources(
  params: ListDevResourcesParams,
  token: string,
): Promise<{
  dev_resources: DevResourceResponse[];
  count: number;
}> {
  const { file_id: fileKey, node_id: resolvedNodeId } = resolveParams(params.file_id, params.node_id);

  process.stderr.write(`[write] LIST DEV RESOURCES in file ${fileKey}${resolvedNodeId ? ` (node: ${resolvedNodeId})` : ''}\n`);

  const response = await getDevResources(fileKey, token, resolvedNodeId);
  const resources = response.dev_resources ?? [];

  return {
    dev_resources: resources,
    count: resources.length,
  };
}
