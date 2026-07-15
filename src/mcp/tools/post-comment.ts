/**
 * MCP Tool: post_comment
 * Post a new top-level comment on a Figma file node.
 * Supports optional node_id + coordinates for anchored (FrameOffset) comments.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { postComment } from '../../api/client.js';
import type { PostCommentRequest, CommentClientMeta } from '../../types/write-api.js';

export const postCommentSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  message: z.string().describe('Comment text to post'),
  node_id: z.string().optional().describe('Node ID to anchor the comment to (e.g. "42:100")'),
  x: z.number().optional().describe('X offset within the node frame'),
  y: z.number().optional().describe('Y offset within the node frame'),
};

export interface PostCommentParams {
  file_id: string;
  message: string;
  node_id?: string;
  x?: number;
  y?: number;
}

export async function handlePostComment(
  params: PostCommentParams,
  token: string,
): Promise<{
  comment_id: string;
  message: string;
  user: { handle: string; img_url: string; id: string };
  created_at: string;
}> {
  const { file_id: fileKey } = resolveParams(params.file_id);

  process.stderr.write(
    `[write] POST comment on node ${params.node_id ?? 'none'} in file ${fileKey}\n`,
  );

  const body: PostCommentRequest = {
    message: params.message,
  };

  // Build client_meta as CommentFrameOffset when node_id is provided
  if (params.node_id !== undefined) {
    const client_meta: CommentClientMeta = {
      node_id: params.node_id,
      node_offset: {
        x: params.x ?? 0,
        y: params.y ?? 0,
      },
    };
    body.client_meta = client_meta;
  }

  const comment = await postComment(fileKey, token, body);

  return {
    comment_id: comment.id,
    message: comment.message,
    user: comment.user,
    created_at: comment.created_at,
  };
}
