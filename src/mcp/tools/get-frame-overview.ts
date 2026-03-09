/**
 * MCP Tool: get_frame_overview
 * Lightweight overview of a frame's direct children for planning inspection.
 * Returns basic info about each child without deep traversal.
 */

import { z } from 'zod';
import type { Node } from '@figma/rest-api-spec';
import type { TokenCache, FetchCallback } from '../cache.js';
import { mapNodeToDetail } from '../mappers/css-mapper.js';
import { resolveParams } from '../utils/normalize-node-id.js';

export const getFrameOverviewSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  node_id: z.string().optional().describe('Parent frame node ID to inspect. Auto-extracted from URL if not provided.'),
};

export interface GetFrameOverviewParams {
  file_id: string;
  node_id?: string;
}

export interface ChildOverview {
  node_id: string;
  name: string;
  node_type: string;
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  child_count: number;
  has_auto_layout: boolean;
  layout_mode: string | null;
  has_fills: boolean;
  has_images: boolean;
  has_gradients: boolean;
  has_text: boolean;
  text_preview: string | null;
  is_component_instance: boolean;
  component_id: string | null;
  component_name: string | null;
  position: 'absolute' | 'relative';
  overflow: 'hidden' | 'visible';
  opacity: number;
  /** Computed vertical gap to next sibling (px). null for last child or absolute elements. */
  gap_to_next: number | null;
  /** Main component name (resolved from file.components). Present only for instances. */
  main_component_name: string | null;
}

export interface FrameOverviewResult {
  frame_node_id: string;
  frame_name: string;
  frame_type: string;
  frame_dimensions: string;
  has_auto_layout: boolean;
  layout_mode: string | null;
  layout_direction_css: string | null;
  total_children: number;
  children: ChildOverview[];
}

/**
 * Handle get_frame_overview request.
 * Returns a compact overview of a frame's direct children
 * so Claude can plan which sections to inspect deeply.
 */
export async function handleGetFrameOverview(
  params: GetFrameOverviewParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<FrameOverviewResult> {
  const { file_id: fileId, node_id: nodeId } = resolveParams(params.file_id, params.node_id);
  if (!nodeId) {
    throw new Error('node_id is required. Provide it explicitly or include node-id in the Figma URL.');
  }

  const entry = await cache.getOrFetch(fileId, fetchFn);

  const node = entry.nodes.find((n) => n.node_id === nodeId);
  if (!node) {
    throw new Error(
      `Node "${nodeId}" not found in file "${fileId}". ` +
        `Use get_document_structure to discover available node IDs.`,
    );
  }

  const raw = node.raw as Record<string, unknown>;
  const rawChildren = (raw.children ?? []) as Node[];

  // Map parent frame at depth=0 for its own properties
  const fileCtx = { styles: entry.file.styles, components: entry.file.components };
  const parentDetail = mapNodeToDetail(node.raw, entry.tokens, 0, fileCtx);

  const layoutModeMap: Record<string, string> = {
    HORIZONTAL: 'row',
    VERTICAL: 'column',
  };

  const children: ChildOverview[] = rawChildren.map((child) => {
    const childR = child as unknown as Record<string, unknown>;
    const childDetail = mapNodeToDetail(child, entry.tokens, 1, fileCtx);

    // Count grandchildren
    const grandchildren = (childR.children ?? []) as unknown[];

    // Check for images/gradients in fills
    let hasImages = false;
    let hasGradients = false;
    for (const fill of childDetail.fills) {
      if (fill.fill_type === 'image') hasImages = true;
      if (fill.fill_type === 'gradient') hasGradients = true;
    }

    // Also check first level children for images/gradients
    for (const grandchild of childDetail.children) {
      for (const fill of grandchild.fills) {
        if (fill.fill_type === 'image') hasImages = true;
        if (fill.fill_type === 'gradient') hasGradients = true;
      }
    }

    // Collect text preview from direct text children
    let textPreview: string | null = null;
    const textParts: string[] = [];
    if (childDetail.text_content) {
      textParts.push(childDetail.text_content);
    }
    for (const gc of childDetail.children) {
      if (gc.text_content) {
        textParts.push(gc.text_content);
      }
    }
    if (textParts.length > 0) {
      textPreview = textParts.join(' | ').slice(0, 150);
    }

    return {
      node_id: childDetail.node_id,
      name: childDetail.name,
      node_type: childDetail.node_type,
      width: Math.round(childDetail.width),
      height: Math.round(childDetail.height),
      x: Math.round(childDetail.x),
      y: Math.round(childDetail.y),
      visible: childDetail.visible,
      child_count: grandchildren.length,
      has_auto_layout: childDetail.layout !== null,
      layout_mode: childDetail.layout?.mode ?? null,
      has_fills: childDetail.fills.length > 0,
      has_images: hasImages,
      has_gradients: hasGradients,
      has_text: textParts.length > 0,
      text_preview: textPreview,
      is_component_instance: childDetail.component_info?.is_instance ?? false,
      component_id: childDetail.component_info?.component_id ?? null,
      component_name: childDetail.component_info?.component_name ?? null,
      main_component_name: childDetail.component_info?.main_component_name ?? null,
      position: childDetail.position,
      overflow: childDetail.overflow,
      opacity: childDetail.opacity ?? 1,
      gap_to_next: null, // computed below
    };
  });

  // Compute gaps between siblings (vertical spacing for non-absolute elements)
  const flowChildren = children.filter((c) => c.position !== 'absolute' && c.visible);
  for (let i = 0; i < flowChildren.length - 1; i++) {
    const current = flowChildren[i];
    const next = flowChildren[i + 1];
    const gap = next.y - (current.y + current.height);
    current.gap_to_next = Math.round(gap);
  }

  return {
    frame_node_id: parentDetail.node_id,
    frame_name: parentDetail.name,
    frame_type: parentDetail.node_type,
    frame_dimensions: `${Math.round(parentDetail.width)}x${Math.round(parentDetail.height)}`,
    has_auto_layout: parentDetail.layout !== null,
    layout_mode: parentDetail.layout?.mode ?? null,
    layout_direction_css: parentDetail.layout?.mode
      ? (layoutModeMap[parentDetail.layout.mode] ?? null)
      : null,
    total_children: children.length,
    children,
  };
}
