/**
 * T046 — Component extractor.
 *
 * Extracts COMPONENT and COMPONENT_SET nodes from the parsed tree,
 * capturing layout data, dimensions, corner radii, and children hierarchy.
 * For COMPONENT_SET nodes, parses child COMPONENT variants using variant-parser.
 */

import type {
  ParsedNode,
  ComponentInfo,
  ComponentChild,
  VariantInfo,
  ComponentMeta,
  ComponentSetMeta,
} from '../types/tokens.js';
import { parseVariantName } from '../utils/variant-parser.js';

/**
 * Extract component information from parsed nodes.
 *
 * @param nodes - Flat array of parsed Figma nodes.
 * @param componentsMeta - Figma file components metadata.
 * @param componentSetsMeta - Figma file component sets metadata.
 * @returns Array of ComponentInfo for all COMPONENT and COMPONENT_SET nodes.
 */
export function extractComponents(
  nodes: ParsedNode[],
  componentsMeta: Record<string, ComponentMeta> = {},
  componentSetsMeta: Record<string, ComponentSetMeta> = {},
): ComponentInfo[] {
  const results: ComponentInfo[] = [];

  // Build a map of node_id -> ParsedNode for child lookups
  const nodeMap = new Map<string, ParsedNode>();
  for (const node of nodes) {
    nodeMap.set(node.node_id, node);
  }

  for (const node of nodes) {
    if (node.node_type !== 'COMPONENT' && node.node_type !== 'COMPONENT_SET') {
      continue;
    }

    // Skip COMPONENT nodes that are direct children of a COMPONENT_SET.
    // They are handled as variants of the parent COMPONENT_SET.
    if (node.node_type === 'COMPONENT' && node.parent_id) {
      const parent = nodeMap.get(node.parent_id);
      if (parent && parent.node_type === 'COMPONENT_SET') {
        continue;
      }
    }

    const raw = node.raw as Record<string, unknown>;
    const bbox = raw.absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    const width = bbox?.width ?? 0;
    const height = bbox?.height ?? 0;

    // Layout properties
    const layoutMode = raw.layoutMode as string | undefined;
    const paddingTop = (raw.paddingTop as number) ?? 0;
    const paddingRight = (raw.paddingRight as number) ?? 0;
    const paddingBottom = (raw.paddingBottom as number) ?? 0;
    const paddingLeft = (raw.paddingLeft as number) ?? 0;
    const itemSpacing = raw.itemSpacing as number | undefined;
    const counterAxisSpacing = raw.counterAxisSpacing as number | undefined;
    const primaryAxisAlignItems = raw.primaryAxisAlignItems as string | undefined;
    const counterAxisAlignItems = raw.counterAxisAlignItems as string | undefined;
    const layoutWrap = raw.layoutWrap as string | undefined;
    const clipsContent = (raw.clipsContent as boolean) ?? false;

    // Corner radius
    const cornerRadius = raw.cornerRadius as number | undefined;
    const rectangleCornerRadii = raw.rectangleCornerRadii as number[] | undefined;

    // Description from metadata
    let description = '';
    if (node.node_type === 'COMPONENT_SET' && componentSetsMeta[node.node_id]) {
      description = componentSetsMeta[node.node_id].description;
    } else if (node.node_type === 'COMPONENT' && componentsMeta[node.node_id]) {
      description = componentsMeta[node.node_id].description;
    }

    // Build variants for COMPONENT_SET
    let variants: VariantInfo[] | undefined;
    if (node.node_type === 'COMPONENT_SET') {
      variants = buildVariants(node, nodes, nodeMap);
    }

    // Build children hierarchy
    const children = buildChildrenHierarchy(node, nodes);

    const info: ComponentInfo = {
      node_id: node.node_id,
      name: node.name,
      component_type: node.node_type as 'COMPONENT' | 'COMPONENT_SET',
      width,
      height,
      description,
      padding: { top: paddingTop, right: paddingRight, bottom: paddingBottom, left: paddingLeft },
      clips_content: clipsContent,
      children,
    };

    // Only include optional properties when they have values
    if (layoutMode !== undefined) info.layout_mode = layoutMode;
    if (itemSpacing !== undefined) info.item_spacing = itemSpacing;
    if (counterAxisSpacing !== undefined) info.counter_axis_spacing = counterAxisSpacing;
    if (primaryAxisAlignItems !== undefined) info.primary_axis_align = primaryAxisAlignItems;
    if (counterAxisAlignItems !== undefined) info.counter_axis_align = counterAxisAlignItems;
    if (layoutWrap !== undefined) info.layout_wrap = layoutWrap;
    if (cornerRadius !== undefined) info.corner_radius = cornerRadius;
    if (rectangleCornerRadii !== undefined) info.corner_radii = rectangleCornerRadii;
    if (variants !== undefined) info.variants = variants;

    results.push(info);
  }

  return results;
}

/**
 * Build variant info for children of a COMPONENT_SET.
 * Uses parseVariantName to extract properties from each variant's name.
 */
function buildVariants(
  setNode: ParsedNode,
  allNodes: ParsedNode[],
  nodeMap: Map<string, ParsedNode>,
): VariantInfo[] {
  const variants: VariantInfo[] = [];

  // Find direct child COMPONENT nodes of this COMPONENT_SET
  for (const node of allNodes) {
    if (node.node_type !== 'COMPONENT') continue;
    if (node.parent_id !== setNode.node_id) continue;

    const raw = node.raw as Record<string, unknown>;
    const bbox = raw.absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    variants.push({
      node_id: node.node_id,
      name: node.name,
      properties: parseVariantName(node.name),
      width: bbox?.width ?? 0,
      height: bbox?.height ?? 0,
    });
  }

  return variants;
}

/**
 * Build a ComponentChild[] tree from the raw children of a node.
 * Uses iterative DFS with an explicit stack (Constitution Principle V — no recursion).
 */
function buildChildrenHierarchy(
  parentNode: ParsedNode,
  allNodes: ParsedNode[],
): ComponentChild[] {
  const raw = parentNode.raw as Record<string, unknown>;
  const rawChildren = raw.children as Array<Record<string, unknown>> | undefined;

  if (!rawChildren || rawChildren.length === 0) {
    return [];
  }

  // We build the tree iteratively using an explicit stack.
  // Each stack entry stores the raw node data and a reference to where
  // its ComponentChild output should be placed.
  interface StackEntry {
    rawNode: Record<string, unknown>;
    target: ComponentChild[];
  }

  const rootChildren: ComponentChild[] = [];

  // Initialize stack with top-level children (in reverse for correct order)
  const stack: StackEntry[] = [];
  for (let i = rawChildren.length - 1; i >= 0; i--) {
    stack.push({ rawNode: rawChildren[i], target: rootChildren });
  }

  while (stack.length > 0) {
    const entry = stack.pop()!;
    const { rawNode, target } = entry;

    const child: ComponentChild = {
      node_id: (rawNode.id as string) ?? '',
      node_type: (rawNode.type as string) ?? '',
      name: (rawNode.name as string) ?? '',
    };

    target.push(child);

    // If this node has children, add them to the stack
    const nestedChildren = rawNode.children as Array<Record<string, unknown>> | undefined;
    if (nestedChildren && nestedChildren.length > 0) {
      child.children = [];
      // Push in reverse order so first child is processed first
      for (let i = nestedChildren.length - 1; i >= 0; i--) {
        stack.push({ rawNode: nestedChildren[i], target: child.children });
      }
    }
  }

  return rootChildren;
}
