/**
 * T027 - Gradient token extractor.
 *
 * Extracts gradient fills (LINEAR, RADIAL, ANGULAR, DIAMOND) from Figma
 * nodes and returns GradientToken[].
 */

import type { ParsedNode, GradientToken, GradientStop } from '../types/tokens.js';
import { rgbaToHex, figmaRgbaToInt } from '../utils/color.js';
import type { FigmaRGBA } from '../utils/color.js';

const GRADIENT_TYPES = new Set([
  'GRADIENT_LINEAR',
  'GRADIENT_RADIAL',
  'GRADIENT_ANGULAR',
  'GRADIENT_DIAMOND',
]);

type FigmaGradientType = 'LINEAR' | 'RADIAL' | 'ANGULAR' | 'DIAMOND';

export function extractGradients(nodes: ParsedNode[]): GradientToken[] {
  const tokens: GradientToken[] = [];
  const counters: Record<string, number> = {
    LINEAR: 0,
    RADIAL: 0,
    ANGULAR: 0,
    DIAMOND: 0,
  };

  for (const node of nodes) {
    const raw = node.raw as Record<string, any>;
    const fills: any[] | undefined = raw.fills;

    if (!fills) continue;

    for (const fill of fills) {
      if (!GRADIENT_TYPES.has(fill.type)) continue;
      if (fill.visible === false) continue;

      const gradientType = fill.type.replace('GRADIENT_', '') as FigmaGradientType;
      counters[gradientType]++;
      const paintOpacity: number = fill.opacity ?? 1;

      const stops: GradientStop[] = (fill.gradientStops ?? []).map(
        (stop: { position: number; color: FigmaRGBA }) => {
          const color = { ...stop.color, a: stop.color.a * paintOpacity };
          return {
            position: stop.position,
            color_hex: rgbaToHex(color),
            color_rgba: figmaRgbaToInt(color),
          };
        },
      );

      const handlePositions: { x: number; y: number }[] = (
        fill.gradientHandlePositions ?? []
      ).map((hp: { x: number; y: number }) => ({
        x: hp.x,
        y: hp.y,
      }));

      tokens.push({
        name: `gradient-${gradientType.toLowerCase()}-${counters[gradientType]}`,
        node_id: node.node_id,
        gradient_type: gradientType,
        stops,
        handle_positions: handlePositions,
      });
    }
  }

  return tokens;
}
