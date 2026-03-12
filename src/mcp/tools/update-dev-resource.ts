/**
 * MCP Tool: update_dev_resource
 * Update an existing dev resource (name and/or URL).
 */

import { z } from 'zod';
import { putDevResources } from '../../api/client.js';

export const updateDevResourceSchema = {
  resource_id: z.string().describe('Dev resource ID to update'),
  name: z.string().optional().describe('New display name for the dev resource'),
  url: z.string().url().optional().describe('New URL for the dev resource'),
};

export interface UpdateDevResourceParams {
  resource_id: string;
  name?: string;
  url?: string;
}

export async function handleUpdateDevResource(
  params: UpdateDevResourceParams,
  token: string,
): Promise<{
  resource_id: string;
  updated_fields: string[];
}> {
  process.stderr.write(`[write] UPDATE DEV RESOURCE: "${params.resource_id}"\n`);

  const updatedFields: string[] = [];

  const resourceUpdate: { id: string; name?: string; url?: string } = {
    id: params.resource_id,
  };

  if (params.name !== undefined) {
    resourceUpdate.name = params.name;
    updatedFields.push('name');
  }

  if (params.url !== undefined) {
    resourceUpdate.url = params.url;
    updatedFields.push('url');
  }

  await putDevResources(token, [resourceUpdate]);

  return {
    resource_id: params.resource_id,
    updated_fields: updatedFields,
  };
}
