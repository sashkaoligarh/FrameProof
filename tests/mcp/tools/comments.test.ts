/**
 * T023 — Comments API tool tests.
 *
 * Coverage:
 * - post_comment: success with node_id + coordinates, success without coordinates,
 *   client_meta FrameOffset format, Figma URL extraction, stderr logging
 * - reply_to_comment: success (returns comment_id, parent_id, message, created_at),
 *   404 for non-existent parent
 * - get_comments: success with threading (groups replies under parent),
 *   empty result, multiple top-level comments
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FigmaApiError } from '../../../src/api/client.js';
import {
  MOCK_FILE_KEY,
  MOCK_TOKEN,
  MOCK_COMMENT,
  MOCK_REPLY,
  MOCK_COMMENTS_RESPONSE,
} from '../../fixtures/write-api/comments.js';

vi.mock('../../../src/api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/client.js')>();
  return {
    ...actual,
    postComment: vi.fn(),
    getComments: vi.fn(),
  };
});

import { postComment, getComments } from '../../../src/api/client.js';
import { handlePostComment } from '../../../src/mcp/tools/post-comment.js';
import { handleReplyToComment } from '../../../src/mcp/tools/reply-to-comment.js';
import { handleGetComments } from '../../../src/mcp/tools/get-comments.js';

const mockPostComment = vi.mocked(postComment);
const mockGetComments = vi.mocked(getComments);

// ─── post_comment ────────────────────────────────────────

describe('handlePostComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success with node_id + coordinates', () => {
    it('returns comment_id, message, user, created_at', async () => {
      mockPostComment.mockResolvedValue(MOCK_COMMENT);

      const result = await handlePostComment(
        {
          file_id: MOCK_FILE_KEY,
          message: MOCK_COMMENT.message,
          node_id: '42:100',
          x: 50,
          y: 20,
        },
        MOCK_TOKEN,
      );

      expect(result.comment_id).toBe(MOCK_COMMENT.id);
      expect(result.message).toBe(MOCK_COMMENT.message);
      expect(result.user).toEqual(MOCK_COMMENT.user);
      expect(result.created_at).toBe(MOCK_COMMENT.created_at);
    });

    it('builds client_meta as CommentFrameOffset when node_id is provided', async () => {
      mockPostComment.mockResolvedValue(MOCK_COMMENT);

      await handlePostComment(
        {
          file_id: MOCK_FILE_KEY,
          message: 'test',
          node_id: '42:100',
          x: 50,
          y: 20,
        },
        MOCK_TOKEN,
      );

      expect(mockPostComment).toHaveBeenCalledOnce();
      const [, , body] = mockPostComment.mock.calls[0];
      expect(body.client_meta).toEqual({
        node_id: '42:100',
        node_offset: { x: 50, y: 20 },
      });
    });

    it('defaults x and y to 0 if not provided when node_id is present', async () => {
      mockPostComment.mockResolvedValue(MOCK_COMMENT);

      await handlePostComment(
        {
          file_id: MOCK_FILE_KEY,
          message: 'test',
          node_id: '42:100',
        },
        MOCK_TOKEN,
      );

      const [, , body] = mockPostComment.mock.calls[0];
      expect(body.client_meta).toEqual({
        node_id: '42:100',
        node_offset: { x: 0, y: 0 },
      });
    });
  });

  describe('success without coordinates', () => {
    it('does not include client_meta when node_id is not provided', async () => {
      mockPostComment.mockResolvedValue(MOCK_COMMENT);

      await handlePostComment(
        {
          file_id: MOCK_FILE_KEY,
          message: 'General comment',
        },
        MOCK_TOKEN,
      );

      expect(mockPostComment).toHaveBeenCalledOnce();
      const [, , body] = mockPostComment.mock.calls[0];
      expect(body.client_meta).toBeUndefined();
    });

    it('calls postComment with correct file key and token', async () => {
      mockPostComment.mockResolvedValue(MOCK_COMMENT);

      await handlePostComment(
        { file_id: MOCK_FILE_KEY, message: 'Hello' },
        MOCK_TOKEN,
      );

      expect(mockPostComment).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, expect.any(Object));
    });
  });

  describe('Figma URL extraction', () => {
    it('extracts file key from full Figma URL', async () => {
      mockPostComment.mockResolvedValue(MOCK_COMMENT);

      const figmaUrl = `https://www.figma.com/design/${MOCK_FILE_KEY}/My-Design`;
      await handlePostComment(
        { file_id: figmaUrl, message: 'test' },
        MOCK_TOKEN,
      );

      expect(mockPostComment).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, expect.any(Object));
    });
  });

  describe('stderr logging', () => {
    it('logs the comment message, node_id, and file_id to stderr', async () => {
      mockPostComment.mockResolvedValue(MOCK_COMMENT);

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      await handlePostComment(
        {
          file_id: MOCK_FILE_KEY,
          message: 'Review needed',
          node_id: '42:100',
        },
        MOCK_TOKEN,
      );

      const logCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(logCalls.some((msg) => msg.includes('[write] POST comment:'))).toBe(true);
      expect(logCalls.some((msg) => msg.includes('Review needed'))).toBe(true);
      expect(logCalls.some((msg) => msg.includes('42:100'))).toBe(true);
      expect(logCalls.some((msg) => msg.includes(MOCK_FILE_KEY))).toBe(true);

      stderrSpy.mockRestore();
    });
  });
});

// ─── reply_to_comment ────────────────────────────────────

describe('handleReplyToComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success', () => {
    it('returns comment_id, parent_id, message, created_at', async () => {
      mockPostComment.mockResolvedValue(MOCK_REPLY);

      const result = await handleReplyToComment(
        {
          file_id: MOCK_FILE_KEY,
          comment_id: MOCK_COMMENT.id,
          message: MOCK_REPLY.message,
        },
        MOCK_TOKEN,
      );

      expect(result.comment_id).toBe(MOCK_REPLY.id);
      expect(result.parent_id).toBe(MOCK_REPLY.parent_id);
      expect(result.message).toBe(MOCK_REPLY.message);
      expect(result.created_at).toBe(MOCK_REPLY.created_at);
    });

    it('sends comment_id in the POST body for threading', async () => {
      mockPostComment.mockResolvedValue(MOCK_REPLY);

      await handleReplyToComment(
        {
          file_id: MOCK_FILE_KEY,
          comment_id: MOCK_COMMENT.id,
          message: 'Fixed',
        },
        MOCK_TOKEN,
      );

      expect(mockPostComment).toHaveBeenCalledOnce();
      const [, , body] = mockPostComment.mock.calls[0];
      expect(body.comment_id).toBe(MOCK_COMMENT.id);
      expect(body.message).toBe('Fixed');
    });

    it('calls postComment with correct file key and token', async () => {
      mockPostComment.mockResolvedValue(MOCK_REPLY);

      await handleReplyToComment(
        {
          file_id: MOCK_FILE_KEY,
          comment_id: MOCK_COMMENT.id,
          message: 'Acknowledged',
        },
        MOCK_TOKEN,
      );

      expect(mockPostComment).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN, expect.any(Object));
    });
  });

  describe('error handling', () => {
    it('throws FigmaApiError on 404 for non-existent parent comment', async () => {
      mockPostComment.mockRejectedValue(
        new FigmaApiError('Resource not found.', 404, MOCK_FILE_KEY),
      );

      await expect(
        handleReplyToComment(
          {
            file_id: MOCK_FILE_KEY,
            comment_id: 'comment_NONEXISTENT',
            message: 'Reply',
          },
          MOCK_TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});

// ─── get_comments ─────────────────────────────────────────

describe('handleGetComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success with threading', () => {
    it('groups replies under their parent comment', async () => {
      mockGetComments.mockResolvedValue(MOCK_COMMENTS_RESPONSE);

      const result = await handleGetComments({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(result.comments).toHaveLength(1);
      const thread = result.comments[0];
      expect(thread.id).toBe(MOCK_COMMENT.id);
      expect(thread.replies).toHaveLength(1);
      expect(thread.replies[0].id).toBe(MOCK_REPLY.id);
      expect(thread.replies[0].message).toBe(MOCK_REPLY.message);
    });

    it('returns comment fields: id, message, user, created_at, resolved_at', async () => {
      mockGetComments.mockResolvedValue(MOCK_COMMENTS_RESPONSE);

      const result = await handleGetComments({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      const thread = result.comments[0];
      expect(thread.id).toBe(MOCK_COMMENT.id);
      expect(thread.message).toBe(MOCK_COMMENT.message);
      expect(thread.user).toEqual(MOCK_COMMENT.user);
      expect(thread.created_at).toBe(MOCK_COMMENT.created_at);
      expect(thread.resolved_at).toBeNull();
    });

    it('includes node_id from client_meta when present', async () => {
      mockGetComments.mockResolvedValue(MOCK_COMMENTS_RESPONSE);

      const result = await handleGetComments({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      const thread = result.comments[0];
      expect(thread.node_id).toBe('42:100');
    });

    it('returns total equal to number of top-level comments', async () => {
      mockGetComments.mockResolvedValue(MOCK_COMMENTS_RESPONSE);

      const result = await handleGetComments({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(result.total).toBe(1);
    });
  });

  describe('empty result', () => {
    it('returns empty comments array and total=0 when no comments exist', async () => {
      mockGetComments.mockResolvedValue({ comments: [] });

      const result = await handleGetComments({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(result.comments).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('multiple top-level comments', () => {
    it('returns each top-level comment as a separate thread', async () => {
      const secondComment = {
        ...MOCK_COMMENT,
        id: 'comment_999',
        message: 'Another top-level comment',
        parent_id: '',
        client_meta: undefined,
      };

      mockGetComments.mockResolvedValue({
        comments: [MOCK_COMMENT, secondComment, MOCK_REPLY],
      });

      const result = await handleGetComments({ file_id: MOCK_FILE_KEY }, MOCK_TOKEN);

      expect(result.comments).toHaveLength(2);
      expect(result.total).toBe(2);

      const first = result.comments.find((c) => c.id === MOCK_COMMENT.id);
      const second = result.comments.find((c) => c.id === 'comment_999');

      expect(first).toBeDefined();
      expect(second).toBeDefined();

      // MOCK_REPLY (parent_id='comment_456') should be under first comment only
      expect(first!.replies).toHaveLength(1);
      expect(second!.replies).toHaveLength(0);
    });
  });

  describe('Figma URL extraction', () => {
    it('extracts file key from full Figma URL', async () => {
      mockGetComments.mockResolvedValue({ comments: [] });

      const figmaUrl = `https://www.figma.com/design/${MOCK_FILE_KEY}/My-Design`;
      await handleGetComments({ file_id: figmaUrl }, MOCK_TOKEN);

      expect(mockGetComments).toHaveBeenCalledWith(MOCK_FILE_KEY, MOCK_TOKEN);
    });
  });
});
