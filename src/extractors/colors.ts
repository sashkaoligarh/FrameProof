/**
 * T026 - Color token extractor.
 *
 * Extracts solid fill and stroke colors from Figma nodes, deduplicates
 * by hex value, and returns sorted ColorToken[].
 */

import type { ParsedNode, ColorToken, StyleMeta, RGBA } from '../types/tokens.js';
import { rgbaToHex, figmaRgbaToInt } from '../utils/color.js';
import type { FigmaRGBA } from '../utils/color.js';
import { autoNameColor } from '../utils/naming.js';

interface ColorAccumulator {
  value_hex: string;
  value_rgba: RGBA;
  opacity: number;
  source_type: 'fill' | 'stroke';
  node_ids: Set<string>;
  used_in_types: Set<string>;
  name: string | undefined;
  figma_rgba: FigmaRGBA;
}

export function extractColors(
  nodes: ParsedNode[],
  styles: Record<string, StyleMeta>,
): ColorToken[] {
  const accumulators = new Map<string, ColorAccumulator>();

  for (const node of nodes) {
    const raw = node.raw as Record<string, any>;
    const nodeOpacity: number = raw.opacity ?? 1;

    if (nodeOpacity < 0.02) continue;

    const rawStyles: Record<string, string> | undefined = raw.styles;

    // Process fills
    const fills: any[] | undefined = raw.fills;
    if (fills) {
      for (const fill of fills) {
        if (fill.type !== 'SOLID') continue;
        if (fill.visible === false) continue;

        const figmaColor: FigmaRGBA = fill.color;
        const fillOpacity: number = fill.opacity ?? 1;
        const combined: FigmaRGBA = { ...figmaColor, a: figmaColor.a * fillOpacity };
        const hex = rgbaToHex(combined);
        const intRgba = figmaRgbaToInt(combined);

        // Try to resolve a style name
        let styleName: string | undefined;
        const fillStyleId = rawStyles?.fill;
        if (fillStyleId && styles[fillStyleId]) {
          styleName = styles[fillStyleId].name;
        }

        const existing = accumulators.get(hex);
        if (existing) {
          existing.node_ids.add(node.node_id);
          existing.used_in_types.add(node.node_type);
          if (!existing.name && styleName) {
            existing.name = styleName;
          }
        } else {
          accumulators.set(hex, {
            value_hex: hex,
            value_rgba: intRgba,
            opacity: combined.a,
            source_type: 'fill',
            node_ids: new Set([node.node_id]),
            used_in_types: new Set([node.node_type]),
            name: styleName,
            figma_rgba: combined,
          });
        }
      }
    }

    // Process strokes
    const strokes: any[] | undefined = raw.strokes;
    if (strokes) {
      for (const stroke of strokes) {
        if (stroke.type !== 'SOLID') continue;
        if (stroke.visible === false) continue;

        const figmaColor: FigmaRGBA = stroke.color;
        const strokeOpacity: number = stroke.opacity ?? 1;
        const combined: FigmaRGBA = { ...figmaColor, a: figmaColor.a * strokeOpacity };
        const hex = rgbaToHex(combined);
        const intRgba = figmaRgbaToInt(combined);

        // Try to resolve a style name
        let styleName: string | undefined;
        const strokeStyleId = rawStyles?.stroke;
        if (strokeStyleId && styles[strokeStyleId]) {
          styleName = styles[strokeStyleId].name;
        }

        const existing = accumulators.get(hex);
        if (existing) {
          existing.node_ids.add(node.node_id);
          existing.used_in_types.add(node.node_type);
          if (!existing.name && styleName) {
            existing.name = styleName;
          }
        } else {
          accumulators.set(hex, {
            value_hex: hex,
            value_rgba: intRgba,
            opacity: combined.a,
            source_type: 'stroke',
            node_ids: new Set([node.node_id]),
            used_in_types: new Set([node.node_type]),
            name: styleName,
            figma_rgba: combined,
          });
        }
      }
    }
  }

  // Build tokens, assign names, sort
  const tokens: ColorToken[] = [];
  for (const acc of accumulators.values()) {
    const name = acc.name ?? autoNameColor(acc.figma_rgba);
    tokens.push({
      name,
      node_id: [...acc.node_ids][0],
      source_type: acc.source_type,
      value_hex: acc.value_hex,
      value_rgba: acc.value_rgba,
      opacity: acc.opacity,
      usage_count: acc.node_ids.size,
      used_in_types: [...acc.used_in_types],
    });
  }

  // Sort by usage_count descending
  tokens.sort((a, b) => b.usage_count - a.usage_count);

  // Append counter suffix for duplicate auto-generated names
  const nameCount = new Map<string, number>();
  for (const token of tokens) {
    const count = nameCount.get(token.name) ?? 0;
    nameCount.set(token.name, count + 1);
  }

  // Only rename when there are duplicates
  const nameIndex = new Map<string, number>();
  for (const token of tokens) {
    const total = nameCount.get(token.name) ?? 1;
    if (total <= 1) continue;

    const idx = (nameIndex.get(token.name) ?? 0) + 1;
    nameIndex.set(token.name, idx);
    if (idx === 1) continue; // first occurrence keeps original name
    token.name = `${token.name}-${idx}`;
  }

  return tokens;
}
