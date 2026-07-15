import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  FIGMA_WRITE_ENABLEMENT_MESSAGE,
  figmaWritesEnabled,
  server,
} from '../../src/mcp/server.js';

function textContent(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content[0];
  if (!content || content.type !== 'text') throw new Error('Expected text tool response');
  return content.text;
}

describe('MCP write boundary', () => {
  const client = new Client({ name: 'security-test-client', version: '1.0.0' });

  beforeAll(async () => {
    delete process.env.FIGMA_SCALER_ENABLE_WRITES;
    delete process.env.FIGMA_TOKEN;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    delete process.env.FIGMA_SCALER_ENABLE_WRITES;
    delete process.env.FIGMA_TOKEN;
    await client.close();
  });

  it('blocks a remote mutation before token or API handling', async () => {
    const result = await client.callTool({
      name: 'post_comment',
      arguments: { file_id: 'test-file', message: 'sensitive body' },
    });

    expect(result.isError).toBe(true);
    expect(textContent(result)).toContain(FIGMA_WRITE_ENABLEMENT_MESSAGE);
    expect(textContent(result)).not.toContain('sensitive body');
  });

  it.each([
    ['create_variable_collection', { file_id: 'test-file', name: 'Tokens' }],
    ['create_variable', {
      file_id: 'test-file',
      collection_id: 'VariableCollectionId:1:1',
      name: 'color/primary',
      resolved_type: 'COLOR',
    }],
    ['update_variable', { file_id: 'test-file', variable_id: 'VariableID:1:1', name: 'renamed' }],
    ['delete_variable', { file_id: 'test-file', variable_id: 'VariableID:1:1', dry_run: false }],
    ['sync_variables', { file_id: 'test-file', variables: [], dry_run: false }],
    ['create_dev_resource', {
      file_id: 'test-file',
      node_id: '1:1',
      name: 'source',
      url: 'https://example.com/private/source',
    }],
    ['update_dev_resource', { resource_id: 'resource-1', name: 'renamed' }],
    ['delete_dev_resource', { file_id: 'test-file', resource_id: 'resource-1' }],
    ['post_comment', { file_id: 'test-file', message: 'private comment' }],
    ['reply_to_comment', { file_id: 'test-file', comment_id: 'comment-1', message: 'private reply' }],
  ])('blocks %s when writes are disabled', async (name, args) => {
    const result = await client.callTool({ name, arguments: args });

    expect(result.isError).toBe(true);
    expect(textContent(result)).toContain('FIGMA_SCALER_ENABLE_WRITES=1');
  });

  it('allows the default sync_variables dry-run while writes are disabled', async () => {
    const result = await client.callTool({
      name: 'sync_variables',
      arguments: {
        file_id: 'test-file',
        variables: [{ action: 'DELETE', id: 'VariableID:1:1' }],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(JSON.parse(textContent(result))).toMatchObject({
      status: 'dry_run',
      summary: { variables_deleted: 1 },
    });
  });

  it('blocks sync_variables when dry_run is explicitly disabled', async () => {
    const result = await client.callTool({
      name: 'sync_variables',
      arguments: {
        file_id: 'test-file',
        variables: [{ action: 'DELETE', id: 'VariableID:1:1' }],
        dry_run: false,
      },
    });

    expect(result.isError).toBe(true);
    expect(textContent(result)).toContain('FIGMA_SCALER_ENABLE_WRITES=1');
  });

  it('keeps read tools enabled and publishes write-risk annotations', async () => {
    const tools = (await client.listTools()).tools;
    const getComments = tools.find((tool) => tool.name === 'get_comments');
    const postComment = tools.find((tool) => tool.name === 'post_comment');
    const deleteVariable = tools.find((tool) => tool.name === 'delete_variable');
    const workflowPlanner = tools.find((tool) => tool.name === 'plan_pixel_perfect_workflow');

    expect(getComments?.annotations?.readOnlyHint).toBe(true);
    expect(postComment?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(deleteVariable?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(workflowPlanner?.description).toContain('plan-only');
    expect(tools.some((tool) => tool.name === 'pixel_perfect_orchestrator')).toBe(false);
  });

  it('requires the exact enablement value', () => {
    process.env.FIGMA_SCALER_ENABLE_WRITES = 'true';
    expect(figmaWritesEnabled()).toBe(false);
    process.env.FIGMA_SCALER_ENABLE_WRITES = '1';
    expect(figmaWritesEnabled()).toBe(true);
    delete process.env.FIGMA_SCALER_ENABLE_WRITES;
  });
});
