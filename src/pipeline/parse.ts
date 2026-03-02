/**
 * Stage 2: Tree traversal — Figma document → ParsedNode[]
 * Uses iterative DFS with explicit stack (not recursion — Constitution Principle V).
 */

import type { Node } from '@figma/rest-api-spec';
import type { ParsedNode } from '../types/tokens.js';

export interface ParseOptions {
  includeHidden: boolean;
  pageFilter?: string;
  nodeFilter?: string;
}

interface StackEntry {
  node: Node;
  parentId: string | null;
  depth: number;
}

/**
 * Parse a Figma document tree into a flat array of ParsedNode.
 * Iterative DFS with explicit stack. Filters hidden nodes by default.
 */
export function parseDocumentTree(
  document: Node,
  options: ParseOptions = { includeHidden: false },
): ParsedNode[] {
  const result: ParsedNode[] = [];
  const root = resolveRoot(document, options);

  if (!root) {
    process.stderr.write('Warning: Document root is empty. No nodes to process.\n');
    return result;
  }

  // Check for empty document (no children)
  if (getChildren(root).length === 0 && root.type === 'DOCUMENT') {
    process.stderr.write('Warning: Document has no pages. Output will contain empty tokens.\n');
    return result;
  }

  const knownTypes = new Set([
    'DOCUMENT', 'CANVAS', 'FRAME', 'GROUP', 'VECTOR', 'BOOLEAN_OPERATION',
    'STAR', 'LINE', 'ELLIPSE', 'REGULAR_POLYGON', 'RECTANGLE', 'TEXT',
    'SLICE', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'STICKY', 'SHAPE_WITH_TEXT',
    'CONNECTOR', 'SECTION', 'TABLE', 'TABLE_CELL', 'WASHI_TAPE', 'WIDGET',
  ]);
  const warnedTypes = new Set<string>();

  const stack: StackEntry[] = [{ node: root, parentId: null, depth: 0 }];

  while (stack.length > 0) {
    const entry = stack.pop()!;
    const { node, parentId, depth } = entry;

    // Skip hidden nodes unless --include-hidden
    if (!options.includeHidden && isHidden(node)) {
      continue;
    }

    const nodeId = getNodeId(node);

    // Warn about unknown node types
    if (!knownTypes.has(node.type) && !warnedTypes.has(node.type)) {
      process.stderr.write(`Warning: Unknown node type "${node.type}" (node_id: ${nodeId}). Skipping extraction but traversing children.\n`);
      warnedTypes.add(node.type);
    }

    result.push({
      node_id: nodeId,
      node_type: node.type,
      name: getName(node),
      parent_id: parentId,
      depth,
      raw: node,
    });

    // Push children in reverse order so first child is processed first
    const children = getChildren(node);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({
        node: children[i],
        parentId: nodeId,
        depth: depth + 1,
      });
    }
  }

  return result;
}

/**
 * Resolve the root node based on filters.
 * - pageFilter: find CANVAS node by name
 * - nodeFilter: find node by ID anywhere in the tree
 * - Neither: use the document as-is
 */
function resolveRoot(document: Node, options: ParseOptions): Node | null {
  if (options.pageFilter) {
    const pages = getChildren(document);
    const page = pages.find(
      (child) => child.type === 'CANVAS' && getName(child) === options.pageFilter,
    );
    if (!page) {
      process.stderr.write(
        `Warning: Page "${options.pageFilter}" not found. Available pages: ${pages.filter((c) => c.type === 'CANVAS').map((c) => getName(c)).join(', ')}\n`,
      );
      return null;
    }
    return page;
  }

  if (options.nodeFilter) {
    const found = findNodeById(document, options.nodeFilter);
    if (!found) {
      process.stderr.write(
        `Warning: Node "${options.nodeFilter}" not found in the document.\n`,
      );
      return null;
    }
    return found;
  }

  return document;
}

/**
 * Find a node by ID using iterative DFS.
 */
function findNodeById(root: Node, targetId: string): Node | null {
  const stack: Node[] = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (getNodeId(node) === targetId) return node;

    const children = getChildren(root);
    // Re-search from root level children to find nested nodes
    if (node === root) {
      for (const child of getChildren(node)) {
        const found = findNodeByIdInSubtree(child, targetId);
        if (found) return found;
      }
    }
  }

  return null;
}

function findNodeByIdInSubtree(node: Node, targetId: string): Node | null {
  const stack: Node[] = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (getNodeId(current) === targetId) return current;

    for (const child of getChildren(current)) {
      stack.push(child);
    }
  }

  return null;
}

function isHidden(node: Node): boolean {
  return 'visible' in node && (node as Record<string, unknown>).visible === false;
}

function getNodeId(node: Node): string {
  return (node as Record<string, unknown>).id as string ?? '';
}

function getName(node: Node): string {
  return (node as Record<string, unknown>).name as string ?? '';
}

function getChildren(node: Node): Node[] {
  const raw = node as Record<string, unknown>;
  if (Array.isArray(raw.children)) {
    return raw.children as Node[];
  }
  return [];
}
