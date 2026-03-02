/**
 * SVG collapsing — groups where ALL children are vector types get collapsed
 * to a single IMAGE_SVG node with empty children array.
 *
 * Non-recursive: each group is evaluated independently (nested groups
 * that are all-vector will also be collapsed in a single pass).
 */

import type { NodeDetail } from '../../types/mcp.js';

const VECTOR_TYPES = new Set([
  'VECTOR',
  'BOOLEAN_OPERATION',
  'LINE',
  'STAR',
  'ELLIPSE',
  'REGULAR_POLYGON',
]);

/**
 * Collapse all-vector groups into IMAGE_SVG nodes.
 * Mutates the tree in place for efficiency and returns it.
 */
export function collapseSvgGroups(node: NodeDetail): NodeDetail {
  return collapseNode(node);
}

function collapseNode(node: NodeDetail): NodeDetail {
  // First, recursively process all children
  if (node.children.length > 0) {
    node.children = node.children.map(collapseNode);
  }

  // Then check if this node qualifies for SVG collapse
  if (shouldCollapse(node)) {
    const childCount = node.children.length;
    node.node_type = 'IMAGE_SVG';
    node.collapsed_children_count = childCount;
    node.children = [];
  }

  return node;
}

function shouldCollapse(node: NodeDetail): boolean {
  // Only collapse GROUP or FRAME-like containers
  const containerTypes = ['GROUP', 'FRAME', 'COMPONENT', 'INSTANCE'];
  if (!containerTypes.includes(node.node_type)) return false;

  // Must have children
  if (node.children.length === 0) return false;

  // ALL children must be vector types
  return node.children.every((child) => VECTOR_TYPES.has(child.node_type));
}
