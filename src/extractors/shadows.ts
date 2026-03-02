/**
 * T031 - Shadow token extractor.
 *
 * Extracts DROP_SHADOW and INNER_SHADOW effects from Figma nodes,
 * deduplicates by CSS string, and returns ShadowToken[].
 */

import type { ParsedNode, ShadowToken } from '../types/tokens.js';
import { rgbaToHex, figmaRgbaToInt } from '../utils/color.js';
import type { FigmaRGBA } from '../utils/color.js';

const SHADOW_TYPES = new Set(['DROP_SHADOW', 'INNER_SHADOW']);

function buildCss(
  type: string,
  x: number,
  y: number,
  blur: number,
  spread: number,
  rgba: { r: number; g: number; b: number; a: number },
): string {
  const parts: string[] = [];
  if (type === 'INNER_SHADOW') {
    parts.push('inset');
  }
  parts.push(`${x}px`);
  parts.push(`${y}px`);
  parts.push(`${blur}px`);
  parts.push(`${spread}px`);
  parts.push(`rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`);
  return parts.join(' ');
}

export function extractShadows(nodes: ParsedNode[]): ShadowToken[] {
  const seen = new Map<string, ShadowToken>();
  const counters = { DROP_SHADOW: 0, INNER_SHADOW: 0 };

  for (const node of nodes) {
    const raw = node.raw as Record<string, any>;
    const effects: any[] | undefined = raw.effects;

    if (!effects) continue;

    for (const effect of effects) {
      if (!SHADOW_TYPES.has(effect.type)) continue;
      if (effect.visible === false) continue;

      const shadowType = effect.type as 'DROP_SHADOW' | 'INNER_SHADOW';
      const offsetX: number = effect.offset?.x ?? 0;
      const offsetY: number = effect.offset?.y ?? 0;
      const blur: number = effect.radius ?? 0;
      const spread: number = effect.spread ?? 0;
      const figmaColor: FigmaRGBA = effect.color ?? { r: 0, g: 0, b: 0, a: 1 };

      const hex = rgbaToHex(figmaColor);
      const intRgba = figmaRgbaToInt(figmaColor);
      const css = buildCss(shadowType, offsetX, offsetY, blur, spread, intRgba);

      if (seen.has(css)) continue;

      counters[shadowType]++;
      const prefix = shadowType === 'DROP_SHADOW' ? 'shadow-drop' : 'shadow-inner';

      seen.set(css, {
        name: `${prefix}-${counters[shadowType]}`,
        node_id: node.node_id,
        shadow_type: shadowType,
        offset_x: offsetX,
        offset_y: offsetY,
        blur,
        spread,
        color_hex: hex,
        color_rgba: intRgba,
        css,
      });
    }
  }

  return [...seen.values()];
}
