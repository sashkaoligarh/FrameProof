/**
 * T029 - Spacing token extractor.
 *
 * Extracts spacing values (padding, item spacing, counter axis spacing)
 * from auto-layout nodes and returns deduplicated, sorted SpacingToken[].
 */

import type { ParsedNode, SpacingToken } from '../types/tokens.js';

type SpacingSource = 'padding' | 'item_spacing' | 'counter_axis';

interface SpacingAccumulator {
  value: number;
  source: SpacingSource;
  usage_count: number;
}

export function extractSpacing(nodes: ParsedNode[]): SpacingToken[] {
  const accumulators = new Map<string, SpacingAccumulator>();

  function addValue(value: number, source: SpacingSource): void {
    if (value <= 0) return;

    const key = `${value}`;
    const existing = accumulators.get(key);
    if (existing) {
      existing.usage_count++;
    } else {
      accumulators.set(key, { value, source, usage_count: 1 });
    }
  }

  for (const node of nodes) {
    const raw = node.raw as Record<string, any>;

    // Only process auto-layout nodes
    if (!raw.layoutMode) continue;

    const paddingTop: number = raw.paddingTop ?? 0;
    const paddingRight: number = raw.paddingRight ?? 0;
    const paddingBottom: number = raw.paddingBottom ?? 0;
    const paddingLeft: number = raw.paddingLeft ?? 0;
    const itemSpacing: number = raw.itemSpacing ?? 0;
    const counterAxisSpacing: number = raw.counterAxisSpacing ?? 0;

    addValue(paddingTop, 'padding');
    addValue(paddingRight, 'padding');
    addValue(paddingBottom, 'padding');
    addValue(paddingLeft, 'padding');
    addValue(itemSpacing, 'item_spacing');
    addValue(counterAxisSpacing, 'counter_axis');
  }

  const tokens: SpacingToken[] = [];
  for (const acc of accumulators.values()) {
    tokens.push({
      value: acc.value,
      source: acc.source,
      usage_count: acc.usage_count,
    });
  }

  // Sort by value ascending
  tokens.sort((a, b) => a.value - b.value);

  return tokens;
}
