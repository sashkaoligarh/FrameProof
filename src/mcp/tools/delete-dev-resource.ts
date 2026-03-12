/**
 * MCP Tool: delete_dev_resource
 * Delete a dev resource from a Figma node.
 */

import { z } from 'zod';
import { deleteDevResource } from '../../api/client.js';

export const deleteDevResourceSchema = {
  resource_id: z.string().describe('Dev resource ID to delete'),
};

export interface DeleteDevResourceParams {
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

  await deleteDevResource(token, params.resource_id);

  return {
    deleted: true,
    resource_id: params.resource_id,
  };
}
