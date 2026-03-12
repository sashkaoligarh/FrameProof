/**
 * MCP Tool: get_comments
 * Retrieve all comments from a Figma file, grouped into threads.
 * Top-level comments include a `replies` array of their child comments.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { getComments } from '../../api/client.js';
import type { FigmaComment } from '../../types/write-api.js';

export const getCommentsSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
};

export interface GetCommentsParams {
  file_id: string;
}

interface CommentThread {
  id: string;
  message: string;
  user: { handle: string; img_url: string; id: string };
  created_at: string;
  resolved_at: string | null;
  node_id?: string;
  replies: Array<{
    id: string;
    message: string;
    created_at: string;
  }>;
}

export async function handleGetComments(
  params: GetCommentsParams,
  token: string,
): Promise<{
  comments: CommentThread[];
  total: number;
}> {
  const { file_id: fileKey } = resolveParams(params.file_id);

  process.stderr.write(`[write] GET comments for file ${fileKey}\n`);

  const response = await getComments(fileKey, token);
  const allComments: FigmaComment[] = response.comments;

  // Separate top-level comments from replies
  const topLevel = allComments.filter((c) => !c.parent_id);
  const replies = allComments.filter((c) => Boolean(c.parent_id));

  // Group replies under their parent
  const threads: CommentThread[] = topLevel.map((comment) => {
    const commentReplies = replies
      .filter((r) => r.parent_id === comment.id)
      .map((r) => ({
        id: r.id,
        message: r.message,
        created_at: r.created_at,
      }));

    const thread: CommentThread = {
      id: comment.id,
      message: comment.message,
      user: comment.user,
      created_at: comment.created_at,
      resolved_at: comment.resolved_at,
      replies: commentReplies,
    };

    // Include node_id from client_meta if present
    if (comment.client_meta && 'node_id' in comment.client_meta) {
      thread.node_id = comment.client_meta.node_id;
    }

    return thread;
  });

  return {
    comments: threads,
    total: threads.length,
  };
}
