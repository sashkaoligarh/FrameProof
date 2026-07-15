/**
 * MCP Tool: delete_dev_resource
 * Delete a dev resource from a Figma node.
 */

import { z } from 'zod';
import { deleteDevResource } from '../../api/client.js';
import { resolveParams } from '../utils/normalize-node-id.js';

export const deleteDevResourceSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  resource_id: z.string().describe('Dev resource ID to delete'),
};

export interface DeleteDevResourceParams {
  file_id: string;
  resource_id: string;
}

export async function handleDeleteDevResource(
  params: DeleteDevResourceParams,
  token: string,
): Promise<{
  deleted: true;
  resource_id: string;
}> {
  process.stderr.write(`[write] DELETE DEV RESOURCE: "${params.resource_id}"\n`);

  const { file_id: fileKey } = resolveParams(params.file_id);
  await deleteDevResource(fileKey, token, params.resource_id);

  return {
    deleted: true,
    resource_id: params.resource_id,
  };
}
