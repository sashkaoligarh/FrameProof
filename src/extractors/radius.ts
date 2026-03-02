/**
 * T030 - Border radius token extractor.
 *
 * Extracts corner radius values from nodes, supports both uniform
 * and per-corner radii. Returns deduplicated, sorted RadiusToken[].
 */

import type { ParsedNode, RadiusToken } from '../types/tokens.js';

interface RadiusAccumulator {
  value: number;
  is_per_corner: boolean;
  usage_count: number;
}

export function extractRadius(nodes: ParsedNode[]): RadiusToken[] {
  const accumulators = new Map<string, RadiusAccumulator>();

  function addValue(value: number, isPerCorner: boolean): void {
    if (value <= 0) return;

    const key = `${value}-${isPerCorner}`;
    const existing = accumulators.get(key);
    if (existing) {
      existing.usage_count++;
    } else {
      accumulators.set(key, { value, is_per_corner: isPerCorner, usage_count: 1 });
    }
  }

  for (const node of nodes) {
    const raw = node.raw as Record<string, any>;

    const cornerRadii: number[] | undefined = raw.rectangleCornerRadii;

    if (cornerRadii && cornerRadii.length === 4) {
      const allSame =
        cornerRadii[0] === cornerRadii[1] &&
        cornerRadii[1] === cornerRadii[2] &&
        cornerRadii[2] === cornerRadii[3];

      if (allSame) {
        // Uniform radius from rectangleCornerRadii
        addValue(cornerRadii[0], false);
      } else {
        // Per-corner tokens for each unique value
        for (const r of cornerRadii) {
          addValue(r, true);
        }
      }
    } else if (raw.cornerRadius != null && raw.cornerRadius > 0) {
      addValue(raw.cornerRadius as number, false);
    }
  }

  const tokens: RadiusToken[] = [];
  for (const acc of accumulators.values()) {
    tokens.push({
      value: acc.value,
      is_per_corner: acc.is_per_corner,
      usage_count: acc.usage_count,
    });
  }

  // Sort by value ascending
  tokens.sort((a, b) => a.value - b.value);

  return tokens;
}
