/**
 * MCP Tool: create_dev_resource
 * Create a dev resource (attach a URL to a Figma node).
 * Returns an existing resource when the same URL is observed on the node before creation.
 * Validates max 10 dev resources per node.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { getDevResources, postDevResources } from '../../api/client.js';

export const createDevResourceSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  node_id: z.string().describe('Node ID to attach the dev resource to'),
  name: z.string().describe('Display name for the dev resource'),
  url: z.string().url().describe('URL to attach (e.g., GitHub link to component source)'),
};

export interface CreateDevResourceParams {
  file_id: string;
  node_id: string;
  name: string;
  url: string;
}

export async function handleCreateDevResource(
  params: CreateDevResourceParams,
  token: string,
): Promise<{
  resource_id: string;
  name: string;
  url: string;
  node_id: string;
  created: boolean;
}> {
  const { file_id: fileKey, node_id: resolvedNodeId } = resolveParams(params.file_id, params.node_id);

  process.stderr.write(`[write] CREATE DEV RESOURCE: "${params.name}" in file ${fileKey}\n`);

  // Check for existing resources on this node (idempotency + max 10 check)
  const existing = await getDevResources(fileKey, token, resolvedNodeId);
  const existingResources = existing.dev_resources ?? [];

  // Idempotency: if same URL already exists on this node, return it
  const duplicate = existingResources.find((r) => r.url === params.url);
  if (duplicate) {
    process.stderr.write('[write] Dev resource URL already exists on node, returning existing.\n');
    return {
      resource_id: duplicate.id,
      name: duplicate.name,
      url: duplicate.url,
      node_id: duplicate.node_id,
      created: false,
    };
  }

  // Max 10 per node validation
  if (existingResources.length >= 10) {
    throw new Error(
      `Node ${resolvedNodeId} already has ${existingResources.length} dev resources (max 10). Remove some before adding more.`,
    );
  }

  const response = await postDevResources(token, [
    {
      name: params.name,
      url: params.url,
      file_key: fileKey,
      node_id: resolvedNodeId ?? params.node_id,
    },
  ]);

  const created = response.links_created[0];
  if (!created) {
    const details = response.errors?.map((error) => error.error).join('; ');
    throw new Error(`Figma did not create the dev resource${details ? `: ${details}` : '.'}`);
  }

  return {
    resource_id: created.id,
    name: created.name,
    url: created.url,
    node_id: created.node_id,
    created: true,
  };
}
