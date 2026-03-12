/**
 * MCP Tool: reply_to_comment
 * Post a reply to an existing comment thread in a Figma file.
 */

import { z } from 'zod';
import { resolveParams } from '../utils/normalize-node-id.js';
import { postComment } from '../../api/client.js';
import type { PostCommentRequest } from '../../types/write-api.js';

export const replyToCommentSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL'),
  comment_id: z.string().describe('ID of the parent comment to reply to'),
  message: z.string().describe('Reply text to post'),
};

export interface ReplyToCommentParams {
  file_id: string;
  comment_id: string;
  message: string;
}

export async function handleReplyToComment(
  params: ReplyToCommentParams,
  token: string,
): Promise<{
  comment_id: string;
  parent_id: string;
  message: string;
  created_at: string;
}> {
  const { file_id: fileKey } = resolveParams(params.file_id);

  process.stderr.write(
    `[write] POST reply to comment ${params.comment_id} in file ${fileKey}\n`,
  );

  const body: PostCommentRequest = {
    message: params.message,
    comment_id: params.comment_id,
  };

  const comment = await postComment(fileKey, token, body);

  return {
    comment_id: comment.id,
    parent_id: comment.parent_id,
    message: comment.message,
    created_at: comment.created_at,
  };
}
