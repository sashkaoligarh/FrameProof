/**
 * Style deduplication — replaces repeated fill/stroke/effect objects with
 * content-hash references, reducing response size for AI context windows.
 *
 * Hash: SHA-256 truncated to 8 hex chars.
 * Prefixes: f_ (fills), s_ (strokes), e_ (effects).
 */

import { createHash } from 'node:crypto';
import type {
  NodeDetail,
  NodeDetailDeduped,
  SharedStylesMap,
  CSSMappedFill,
  CSSMappedStroke,
  CSSMappedEffect,
  SharedStyleRef,
} from '../../types/mcp.js';

/**
 * Deduplicate a NodeDetail tree, replacing repeated style objects with string refs.
 * Returns a NodeDetailDeduped with a top-level `_shared_styles` map.
 */
export function deduplicateStyles(node: NodeDetail): NodeDetailDeduped {
  const styles: SharedStylesMap = {};

  const deduped = deduplicateNode(node, styles);
  deduped._shared_styles = styles;

  return deduped;
}

/**
 * Deduplicate an array of NodeDetail trees, sharing styles across all nodes.
 * The `_shared_styles` map is attached to the first node only.
 */
export function deduplicateStylesArray(nodes: NodeDetail[]): NodeDetailDeduped[] {
  if (nodes.length === 0) return [];

  const styles: SharedStylesMap = {};
  const result = nodes.map((n) => deduplicateNode(n, styles));

  if (result.length > 0) {
    result[0]._shared_styles = styles;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function deduplicateNode(node: NodeDetail, styles: SharedStylesMap): NodeDetailDeduped {
  const fills: (CSSMappedFill | SharedStyleRef)[] = node.fills.map((f) => {
    const ref = hashStyle('f', f);
    if (!styles[ref]) styles[ref] = f;
    return ref;
  });

  const strokes: (CSSMappedStroke | SharedStyleRef)[] = node.strokes.map((s) => {
    const ref = hashStyle('s', s);
    if (!styles[ref]) styles[ref] = s;
    return ref;
  });

  const effects: (CSSMappedEffect | SharedStyleRef)[] = node.effects.map((e) => {
    const ref = hashStyle('e', e);
    if (!styles[ref]) styles[ref] = e;
    return ref;
  });

  const children = node.children.map((child) => deduplicateNode(child, styles));

  // Spread all NodeDetail fields except fills/strokes/effects/children
  const { fills: _f, strokes: _s, effects: _e, children: _c, ...rest } = node;

  return {
    ...rest,
    fills,
    strokes,
    effects,
    children,
  };
}

/**
 * Content-hash a style object: SHA-256 truncated to 8 hex chars with prefix.
 */
function hashStyle(prefix: string, style: CSSMappedFill | CSSMappedStroke | CSSMappedEffect): string {
  const canonical = JSON.stringify(style, Object.keys(style).sort());
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 8);
  return `${prefix}_${hash}`;
}
