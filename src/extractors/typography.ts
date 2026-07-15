/**
 * T028 - Typography token extractor.
 *
 * Extracts typography tokens from TEXT nodes, deduplicates by
 * font signature, and returns sorted TypographyToken[].
 */

import type { ParsedNode, TypographyToken } from '../types/tokens.js';
import { toKebabCase } from '../utils/naming.js';

interface TypoAccumulator {
  font_family: string;
  font_size: number;
  font_weight: number;
  font_style: 'normal' | 'italic';
  line_height: string;
  line_height_px?: number;
  letter_spacing: number;
  text_align_horizontal: string;
  text_case: string;
  text_decoration: string;
  sample_text: string;
  node_ids: string[];
}

function resolveLineHeight(style: Record<string, any>): string {
  const unit: string | undefined = style.lineHeightUnit;
  if (!unit || unit === 'INTRINSIC_%') return 'auto';
  if (unit === 'PIXELS') return `${style.lineHeightPx}px`;
  if (unit === 'FONT_SIZE_%') return `${style.lineHeightPercentFontSize}%`;
  return 'auto';
}

export function extractTypography(nodes: ParsedNode[]): TypographyToken[] {
  const accumulators = new Map<string, TypoAccumulator>();

  for (const node of nodes) {
    const raw = node.raw as Record<string, any>;
    if (raw.type !== 'TEXT') continue;

    const style: Record<string, any> | undefined = raw.style;
    if (!style) continue;

    const fontFamily: string = style.fontFamily ?? 'Unknown';
    const fontSize: number = style.fontSize ?? 16;
    const fontWeight: number = style.fontWeight ?? 400;

    const fontPostScriptName: string = style.fontPostScriptName ?? '';
    const fontStyle: 'normal' | 'italic' = fontPostScriptName.includes('Italic')
      ? 'italic'
      : 'normal';

    const lineHeight = resolveLineHeight(style);
    const lineHeightPx: number | undefined = style.lineHeightPx;
    const letterSpacing: number = style.letterSpacing ?? 0;
    const textAlignHorizontal: string = style.textAlignHorizontal ?? 'LEFT';
    const textCase: string = style.textCase ?? 'ORIGINAL';
    const textDecoration: string = style.textDecoration ?? 'NONE';
    const characters: string = raw.characters ?? '';
    const sampleText = characters.slice(0, 50);

    const key = JSON.stringify([
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      lineHeight,
      letterSpacing,
      textAlignHorizontal,
      textCase,
      textDecoration,
    ]);

    const existing = accumulators.get(key);
    if (existing) {
      existing.node_ids.push(node.node_id);
    } else {
      accumulators.set(key, {
        font_family: fontFamily,
        font_size: fontSize,
        font_weight: fontWeight,
        font_style: fontStyle,
        line_height: lineHeight,
        line_height_px: lineHeightPx,
        letter_spacing: letterSpacing,
        text_align_horizontal: textAlignHorizontal,
        text_case: textCase,
        text_decoration: textDecoration,
        sample_text: sampleText,
        node_ids: [node.node_id],
      });
    }
  }

  const tokens: TypographyToken[] = [];
  for (const acc of accumulators.values()) {
    tokens.push({
      name: toKebabCase(`${acc.font_family}-${acc.font_size}-${acc.font_weight}`),
      node_id: acc.node_ids[0],
      font_family: acc.font_family,
      font_size: acc.font_size,
      font_weight: acc.font_weight,
      font_style: acc.font_style,
      line_height: acc.line_height,
      line_height_px: acc.line_height_px,
      letter_spacing: acc.letter_spacing,
      text_align_horizontal: acc.text_align_horizontal,
      text_case: acc.text_case,
      text_decoration: acc.text_decoration,
      sample_text: acc.sample_text,
      usage_count: acc.node_ids.length,
    });
  }

  // Sort by usage_count descending
  tokens.sort((a, b) => b.usage_count - a.usage_count);

  return tokens;
}
