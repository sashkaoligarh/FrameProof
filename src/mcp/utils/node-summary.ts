/**
 * Build a compact summary of a NodeDetail tree.
 * Used when save_to is specified to return a minimal response.
 */

import type { NodeDetail } from '../../types/mcp.js';

export interface NodeSummary {
  node_id: string;
  node_name: string;
  node_type: string;
  dimensions: string;
  children_count: number;
  has_auto_layout: boolean;
  layout_mode: string | null;
  dominant_colors: string[];
  has_images: boolean;
  has_gradients: boolean;
  has_text_segments: boolean;
  text_content_preview: string | null;
  component_refs: string[];
  hidden_elements_count: number;
  absolute_positioned_count: number;
}

/**
 * Build a compact summary from a NodeDetail tree.
 * Traverses the tree to collect aggregate statistics.
 */
export function buildNodeSummary(node: NodeDetail): NodeSummary {
  const colors = new Set<string>();
  let hasImages = false;
  let hasGradients = false;
  let hasTextSegments = false;
  const componentRefs: string[] = [];
  let hiddenCount = 0;
  let absoluteCount = 0;
  const textParts: string[] = [];

  function walk(n: NodeDetail): void {
    // Collect colors
    for (const fill of n.fills) {
      if (fill.fill_type === 'solid' && fill.value_hex) {
        colors.add(fill.value_hex);
      }
      if (fill.fill_type === 'image') hasImages = true;
      if (fill.fill_type === 'gradient') hasGradients = true;
    }

    // Text segments
    if (n.text_segments && n.text_segments.length > 1) {
      hasTextSegments = true;
    }

    // Text content
    if (n.text_content) {
      textParts.push(n.text_content);
    }

    // Component references
    if (n.component_info) {
      const ref = n.component_info.is_instance
        ? `instance:${n.component_info.component_id}(${n.component_info.component_name})`
        : `component:${n.component_info.component_id}(${n.component_info.component_name})`;
      if (!componentRefs.includes(ref)) {
        componentRefs.push(ref);
      }
    }

    // Hidden elements
    if (!n.visible) hiddenCount++;

    // Absolute positioned
    if (n.position === 'absolute') absoluteCount++;

    // Recurse
    for (const child of n.children) {
      walk(child);
    }
  }

  walk(node);

  const textPreview = textParts.join(' ').slice(0, 200) || null;

  return {
    node_id: node.node_id,
    node_name: node.name,
    node_type: node.node_type,
    dimensions: `${Math.round(node.width)}x${Math.round(node.height)}`,
    children_count: countAllChildren(node),
    has_auto_layout: node.layout !== null,
    layout_mode: node.layout?.mode ?? null,
    dominant_colors: [...colors].slice(0, 8),
    has_images: hasImages,
    has_gradients: hasGradients,
    has_text_segments: hasTextSegments,
    text_content_preview: textPreview,
    component_refs: componentRefs.slice(0, 20),
    hidden_elements_count: hiddenCount,
    absolute_positioned_count: absoluteCount,
  };
}

function countAllChildren(node: NodeDetail): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countAllChildren(child);
  }
  return count;
}
