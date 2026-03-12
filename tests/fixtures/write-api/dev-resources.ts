/**
 * Shared fixtures for Dev Resources API tests.
 */

import type { DevResourceResponse } from '../../../src/types/write-api.js';

export const MOCK_FILE_KEY = 'abc123';
export const MOCK_TOKEN = 'figd_test_token_123';
export const MOCK_NODE_ID = '42:100';

export const MOCK_DEV_RESOURCE: DevResourceResponse = {
  id: 'dev_resource_123',
  name: 'Button.tsx',
  url: 'https://github.com/org/repo/blob/main/src/Button.tsx',
  file_key: MOCK_FILE_KEY,
  node_id: MOCK_NODE_ID,
};

export const MOCK_DEV_RESOURCE_2: DevResourceResponse = {
  id: 'dev_resource_456',
  name: 'Button.stories.tsx',
  url: 'https://github.com/org/repo/blob/main/src/Button.stories.tsx',
  file_key: MOCK_FILE_KEY,
  node_id: MOCK_NODE_ID,
};

export const MOCK_LIST_RESPONSE = {
  dev_resources: [MOCK_DEV_RESOURCE, MOCK_DEV_RESOURCE_2],
};

export const MOCK_CREATE_RESPONSE = {
  dev_resources: [{ id: 'dev_resource_789', name: 'NewComponent.tsx', url: 'https://github.com/org/repo/blob/main/src/New.tsx' }],
};
