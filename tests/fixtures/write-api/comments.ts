/**
 * Shared fixtures for Comments API tests.
 */

import type { FigmaComment } from '../../../src/types/write-api.js';

export const MOCK_FILE_KEY = 'abc123';
export const MOCK_TOKEN = 'figd_test_token_123';

export const MOCK_COMMENT: FigmaComment = {
  id: 'comment_456',
  message: 'Review needed: spacing inconsistent with tokens',
  file_key: MOCK_FILE_KEY,
  parent_id: '',
  user: { handle: 'bot-user', img_url: 'https://example.com/avatar.png', id: 'user_1' },
  created_at: '2026-03-12T10:30:00Z',
  resolved_at: null,
  order_id: '1',
  client_meta: { node_id: '42:100', node_offset: { x: 50, y: 20 } },
};

export const MOCK_REPLY: FigmaComment = {
  id: 'comment_789',
  message: 'Fixed — updated to 8px',
  file_key: MOCK_FILE_KEY,
  parent_id: 'comment_456',
  user: { handle: 'bot-user', img_url: 'https://example.com/avatar.png', id: 'user_1' },
  created_at: '2026-03-12T11:00:00Z',
  resolved_at: null,
  order_id: null,
};

export const MOCK_COMMENTS_RESPONSE = {
  comments: [MOCK_COMMENT, MOCK_REPLY],
};
