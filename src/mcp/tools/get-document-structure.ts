/**
 * MCP Tool: get_document_structure
 * Get an overview of a Figma file structure.
 */

import { z } from 'zod';
import type { Node } from '@figma/rest-api-spec';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { DocumentStructure, PageSummary, FrameSummary } from '../../types/mcp.js';

export const getDocumentStructureSchema = {
  file_id: z.string().describe('Figma file ID or URL'),
};

export interface GetDocumentStructureParams {
  file_id: string;
}

export async function handleGetDocumentStructure(
  params: GetDocumentStructureParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<DocumentStructure> {
  const entry = await cache.getOrFetch(params.file_id, fetchFn);
  const doc = entry.file.document as Record<string, unknown>;
  const children = (doc.children ?? []) as Array<Record<string, unknown>>;

  const pages: PageSummary[] = children
    .filter((c) => (c.type as string) === 'CANVAS')
    .map((page) => {
      const pageChildren = (page.children ?? []) as Array<Record<string, unknown>>;
      const topFrames: FrameSummary[] = pageChildren
        .filter((c) => {
          const type = c.type as string;
          return type === 'FRAME' || type === 'COMPONENT' || type === 'COMPONENT_SET';
        })
        .map((frame) => {
          const bbox = frame.absoluteBoundingBox as
            | { x: number; y: number; width: number; height: number }
            | undefined;
          return {
            node_id: (frame.id as string) ?? '',
            name: (frame.name as string) ?? '',
            width: bbox?.width ?? 0,
            height: bbox?.height ?? 0,
            node_type: frame.type as string,
          };
        });

      return {
        page_id: (page.id as string) ?? '',
        name: (page.name as string) ?? '',
        child_count: pageChildren.length,
        top_frames: topFrames,
      };
    });

  return {
    file_id: entry.file_id,
    file_name: entry.file.name,
    pages,
    component_count: Object.keys(entry.file.components).length,
    component_set_count: Object.keys(entry.file.component_sets).length,
  };
}
