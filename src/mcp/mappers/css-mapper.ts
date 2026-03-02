/**
 * CSS mapper — converts raw Figma nodes to NodeDetail with inline CSS variable mappings.
 * Matches node property values against cached tokens per research.md Decision 7.
 */

import type { Node } from '@figma/rest-api-spec';
import type { AllTokens, ColorToken, ShadowToken } from '../../types/tokens.js';
import type {
  NodeDetail,
  CSSMappedFill,
  CSSMappedStroke,
  CSSMappedEffect,
  CSSMappedValue,
  CSSMappedTypography,
  TextSegment,
  LayoutInfo,
  ComponentRef,
} from '../../types/mcp.js';

const DEFAULT_DEPTH = 5;

/**
 * Map a raw Figma node to a NodeDetail with CSS variable mappings.
 * Recursively processes children up to `maxDepth`.
 */
export function mapNodeToDetail(
  rawNode: Node,
  tokens: AllTokens,
  maxDepth: number = DEFAULT_DEPTH,
): NodeDetail {
  return buildNodeDetail(rawNode, tokens, 0, maxDepth);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function buildNodeDetail(
  raw: Node,
  tokens: AllTokens,
  currentDepth: number,
  maxDepth: number,
): NodeDetail {
  const r = raw as Record<string, unknown>;
  const bbox = r.absoluteBoundingBox as
    | { x: number; y: number; width: number; height: number }
    | undefined;

  return {
    node_id: (r.id as string) ?? '',
    name: (r.name as string) ?? '',
    node_type: raw.type,
    width: bbox?.width ?? 0,
    height: bbox?.height ?? 0,
    x: bbox?.x ?? 0,
    y: bbox?.y ?? 0,
    visible: r.visible !== false,
    fills: mapFills(r, tokens),
    strokes: mapStrokes(r, tokens),
    effects: mapEffects(r, tokens),
    corner_radius: mapCornerRadius(r, tokens),
    layout: mapLayout(r, tokens),
    typography: mapTypography(r, tokens),
    text_content: raw.type === 'TEXT' ? ((r.characters as string) ?? null) : null,
    text_segments: mapTextSegments(r, tokens),
    children: mapChildren(r, tokens, currentDepth, maxDepth),
    component_info: mapComponentInfo(r),
  };
}

// ─── Fills ──────────────────────────────────────────────

function mapFills(r: Record<string, unknown>, tokens: AllTokens): CSSMappedFill[] {
  const fills = r.fills as Array<Record<string, unknown>> | undefined;
  if (!fills || !Array.isArray(fills)) return [];

  return fills
    .filter((f) => f.type === 'SOLID' && f.visible !== false)
    .map((f) => {
      const color = f.color as { r: number; g: number; b: number; a: number };
      const hex = rgbaToHex(color.r, color.g, color.b);
      const matched = matchColor(hex, tokens.colors);

      return {
        value_hex: hex,
        opacity: color.a ?? 1,
        css_variable: matched ? `var(--color-${matched.name})` : null,
        css_property: 'background-color',
      };
    });
}

// ─── Strokes ────────────────────────────────────────────

function mapStrokes(r: Record<string, unknown>, tokens: AllTokens): CSSMappedStroke[] {
  const strokes = r.strokes as Array<Record<string, unknown>> | undefined;
  if (!strokes || !Array.isArray(strokes)) return [];

  const strokeWeight = (r.strokeWeight as number) ?? 1;

  return strokes
    .filter((s) => s.type === 'SOLID' && s.visible !== false)
    .map((s) => {
      const color = s.color as { r: number; g: number; b: number; a: number };
      const hex = rgbaToHex(color.r, color.g, color.b);
      const matched = matchColor(hex, tokens.colors);

      return {
        value_hex: hex,
        weight: strokeWeight,
        css_variable: matched ? `var(--color-${matched.name})` : null,
        css_property: 'border-color',
      };
    });
}

// ─── Effects ────────────────────────────────────────────

function mapEffects(r: Record<string, unknown>, tokens: AllTokens): CSSMappedEffect[] {
  const effects = r.effects as Array<Record<string, unknown>> | undefined;
  if (!effects || !Array.isArray(effects)) return [];

  return effects
    .filter((e) => e.visible !== false)
    .map((e) => {
      const effectType = e.type as string;
      const cssValue = buildEffectCSS(e);
      const matched = matchShadow(e, tokens.shadows);

      let cssProperty: string;
      if (effectType === 'LAYER_BLUR' || effectType === 'BACKGROUND_BLUR') {
        cssProperty = 'filter';
      } else if (effectType === 'INNER_SHADOW') {
        cssProperty = 'box-shadow';
      } else {
        cssProperty = 'box-shadow';
      }

      return {
        effect_type: effectType,
        css_value: cssValue,
        css_variable: matched ? `var(--${matched.name})` : null,
        css_property: cssProperty,
      };
    });
}

function buildEffectCSS(e: Record<string, unknown>): string {
  const type = e.type as string;

  if (type === 'LAYER_BLUR' || type === 'BACKGROUND_BLUR') {
    const radius = (e.radius as number) ?? 0;
    return `blur(${radius}px)`;
  }

  // Shadow types
  const offset = e.offset as { x: number; y: number } | undefined;
  const radius = (e.radius as number) ?? 0;
  const spread = (e.spread as number) ?? 0;
  const color = e.color as { r: number; g: number; b: number; a: number } | undefined;

  const x = offset?.x ?? 0;
  const y = offset?.y ?? 0;
  const rgba = color
    ? `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`
    : 'rgba(0, 0, 0, 0)';

  const prefix = type === 'INNER_SHADOW' ? 'inset ' : '';
  return `${prefix}${x}px ${y}px ${radius}px ${spread}px ${rgba}`;
}

// ─── Corner Radius ──────────────────────────────────────

function mapCornerRadius(
  r: Record<string, unknown>,
  tokens: AllTokens,
): CSSMappedValue | null {
  const radius = r.cornerRadius as number | undefined;
  if (radius === undefined || radius === 0) return null;

  const matched = tokens.radii.find((t) => t.value === radius);

  return {
    value: radius,
    css_variable: matched ? `var(--radius-${matched.value})` : null,
    css_property: 'border-radius',
  };
}

// ─── Layout ─────────────────────────────────────────────

function mapLayout(r: Record<string, unknown>, tokens: AllTokens): LayoutInfo | null {
  const layoutMode = r.layoutMode as string | undefined;
  if (!layoutMode || layoutMode === 'NONE') return null;

  const paddingTop = (r.paddingTop as number) ?? 0;
  const paddingRight = (r.paddingRight as number) ?? 0;
  const paddingBottom = (r.paddingBottom as number) ?? 0;
  const paddingLeft = (r.paddingLeft as number) ?? 0;
  const itemSpacing = (r.itemSpacing as number) ?? 0;
  const counterAxisSpacing = r.counterAxisSpacing as number | undefined;

  return {
    mode: layoutMode,
    padding: {
      top: paddingTop,
      right: paddingRight,
      bottom: paddingBottom,
      left: paddingLeft,
    },
    padding_css: [
      mapSpacingValue(paddingTop, 'padding-top', tokens),
      mapSpacingValue(paddingRight, 'padding-right', tokens),
      mapSpacingValue(paddingBottom, 'padding-bottom', tokens),
      mapSpacingValue(paddingLeft, 'padding-left', tokens),
    ],
    item_spacing: itemSpacing,
    item_spacing_css: matchSpacingCSS(itemSpacing, tokens),
    counter_axis_spacing: counterAxisSpacing ?? null,
    primary_axis_align: (r.primaryAxisAlignItems as string) ?? 'MIN',
    counter_axis_align: (r.counterAxisAlignItems as string) ?? 'MIN',
    layout_wrap: (r.layoutWrap as string) ?? 'NO_WRAP',
  };
}

function mapSpacingValue(
  value: number,
  cssProperty: string,
  tokens: AllTokens,
): CSSMappedValue {
  const matched = tokens.spacing.find((s) => s.value === value);
  return {
    value,
    css_variable: matched ? `var(--spacing-${matched.value})` : null,
    css_property: cssProperty,
  };
}

function matchSpacingCSS(value: number, tokens: AllTokens): string | null {
  const matched = tokens.spacing.find((s) => s.value === value);
  return matched ? `var(--spacing-${matched.value})` : null;
}

// ─── Typography ─────────────────────────────────────────

function mapTypography(
  r: Record<string, unknown>,
  tokens: AllTokens,
): CSSMappedTypography | null {
  if ((r.type as string) !== 'TEXT') return null;

  const style = r.style as Record<string, unknown> | undefined;
  if (!style) return null;

  const fontFamily = (style.fontFamily as string) ?? '';
  const fontSize = (style.fontSize as number) ?? 0;
  const fontWeight = (style.fontWeight as number) ?? 400;
  const lineHeightPx = style.lineHeightPx as number | undefined;
  const letterSpacing = (style.letterSpacing as number) ?? 0;
  const textAlign = (style.textAlignHorizontal as string) ?? 'LEFT';
  const textCase = (style.textCase as string) ?? 'ORIGINAL';
  const textDecoration = (style.textDecoration as string) ?? 'NONE';

  // Match font family against typography tokens
  const familySlug = fontFamily.toLowerCase().replace(/\s+/g, '-');
  const hasFamily = tokens.typography.some(
    (t) => t.font_family.toLowerCase() === fontFamily.toLowerCase(),
  );

  // Match font size against typography tokens
  const hasSize = tokens.typography.some((t) => t.font_size === fontSize);

  // Match font weight against typography tokens
  const hasWeight = tokens.typography.some((t) => t.font_weight === fontWeight);

  // Get text color from fills
  const fills = r.fills as Array<Record<string, unknown>> | undefined;
  let colorHex = '#000000';
  let colorCss: string | null = null;
  if (fills && fills.length > 0) {
    const firstFill = fills[0];
    if (firstFill.type === 'SOLID' && firstFill.visible !== false) {
      const c = firstFill.color as { r: number; g: number; b: number; a: number };
      colorHex = rgbaToHex(c.r, c.g, c.b);
      const matched = matchColor(colorHex, tokens.colors);
      colorCss = matched ? `var(--color-${matched.name})` : null;
    }
  }

  return {
    font_family: fontFamily,
    font_family_css: hasFamily ? `var(--font-family-${familySlug})` : null,
    font_size: fontSize,
    font_size_css: hasSize ? `var(--font-size-${fontSize})` : null,
    font_weight: fontWeight,
    font_weight_css: hasWeight ? `var(--font-weight-${fontWeight})` : null,
    line_height: lineHeightPx ? `${lineHeightPx}px` : 'normal',
    letter_spacing: letterSpacing,
    text_align: textAlign,
    text_case: textCase,
    text_decoration: textDecoration,
    color_hex: colorHex,
    color_css: colorCss,
  };
}

// ─── Text Segments ─────────────────────────────────────

/**
 * Parse characterStyleOverrides + styleOverrideTable into TextSegment[].
 * Returns null for non-TEXT nodes or TEXT nodes without mixed styling.
 * Groups consecutive characters sharing the same override ID into segments.
 */
function mapTextSegments(
  r: Record<string, unknown>,
  tokens: AllTokens,
): TextSegment[] | null {
  if ((r.type as string) !== 'TEXT') return null;

  const characters = r.characters as string | undefined;
  if (!characters) return null;

  const overrides = r.characterStyleOverrides as number[] | undefined;
  if (!overrides || overrides.length === 0) return null;

  // Check if there's any actual variation — if all overrides are 0, skip
  const hasVariation = overrides.some((id) => id !== 0);
  if (!hasVariation) return null;

  const overrideTable = (r.styleOverrideTable as Record<string, Record<string, unknown>>) ?? {};

  // Get default style info from node-level properties
  const defaultFills = r.fills as Array<Record<string, unknown>> | undefined;
  const defaultStyle = r.style as Record<string, unknown> | undefined;
  const defaultColor = getColorFromFills(defaultFills);
  const defaultFontFamily = (defaultStyle?.fontFamily as string) ?? null;
  const defaultFontSize = (defaultStyle?.fontSize as number) ?? null;
  const defaultFontWeight = (defaultStyle?.fontWeight as number) ?? null;

  // Group consecutive characters by override ID
  const segments: TextSegment[] = [];
  let segStart = 0;
  let prevId = overrides[0] ?? 0;

  for (let i = 1; i <= characters.length; i++) {
    const curId = i < overrides.length ? overrides[i] : (overrides[overrides.length - 1] ?? 0);

    if (curId !== prevId || i === characters.length) {
      // Emit segment for prevId from segStart to i
      const segText = characters.slice(segStart, i);
      const override = prevId !== 0 ? overrideTable[String(prevId)] : undefined;

      const overrideFills = override?.fills as Array<Record<string, unknown>> | undefined;
      const segColor = overrideFills ? getColorFromFills(overrideFills) : defaultColor;
      const hex = segColor ? rgbaToHex(segColor.r, segColor.g, segColor.b) : '#000000';
      const matched = matchColor(hex, tokens.colors);

      const segFontFamily = (override?.fontFamily as string) ?? defaultFontFamily;
      const segFontSize = (override?.fontSize as number) ?? defaultFontSize;
      const segFontWeight = (override?.fontWeight as number) ?? defaultFontWeight;

      segments.push({
        text: segText,
        start: segStart,
        end: i,
        color_hex: hex,
        color_css: matched ? `var(--color-${matched.name})` : null,
        font_family: segFontFamily,
        font_size: segFontSize,
        font_weight: segFontWeight,
      });

      segStart = i;
      prevId = curId;
    }
  }

  return segments.length > 1 ? segments : null;
}

/** Extract the first SOLID fill color as {r,g,b,a} in Figma 0-1 float format. */
function getColorFromFills(
  fills: Array<Record<string, unknown>> | undefined,
): { r: number; g: number; b: number; a: number } | null {
  if (!fills || fills.length === 0) return null;
  const first = fills.find((f) => f.type === 'SOLID' && f.visible !== false);
  if (!first) return null;
  return first.color as { r: number; g: number; b: number; a: number };
}

// ─── Children ───────────────────────────────────────────

function mapChildren(
  r: Record<string, unknown>,
  tokens: AllTokens,
  currentDepth: number,
  maxDepth: number,
): NodeDetail[] {
  if (currentDepth >= maxDepth) return [];

  const children = r.children as Node[] | undefined;
  if (!children || !Array.isArray(children)) return [];

  return children.map((child) =>
    buildNodeDetail(child, tokens, currentDepth + 1, maxDepth),
  );
}

// ─── Component Info ─────────────────────────────────────

function mapComponentInfo(r: Record<string, unknown>): ComponentRef | null {
  const type = r.type as string;

  if (type === 'INSTANCE') {
    return {
      component_id: (r.componentId as string) ?? '',
      component_name: (r.name as string) ?? '',
      is_instance: true,
      variant_properties: (r.componentProperties as Record<string, string>) ?? null,
    };
  }

  if (type === 'COMPONENT') {
    return {
      component_id: (r.id as string) ?? '',
      component_name: (r.name as string) ?? '',
      is_instance: false,
      variant_properties: null,
    };
  }

  return null;
}

// ─── Color Matching ─────────────────────────────────────

function matchColor(hex: string, colors: ColorToken[]): ColorToken | null {
  const normalized = hex.toLowerCase();
  return colors.find((c) => c.value_hex.toLowerCase() === normalized) ?? null;
}

function matchShadow(
  effect: Record<string, unknown>,
  shadows: ShadowToken[],
): ShadowToken | null {
  const type = effect.type as string;
  if (type !== 'DROP_SHADOW' && type !== 'INNER_SHADOW') return null;

  const offset = effect.offset as { x: number; y: number } | undefined;
  const radius = (effect.radius as number) ?? 0;
  const spread = (effect.spread as number) ?? 0;

  const x = offset?.x ?? 0;
  const y = offset?.y ?? 0;

  return (
    shadows.find(
      (s) =>
        s.shadow_type === type &&
        s.offset_x === x &&
        s.offset_y === y &&
        s.blur === radius &&
        s.spread === spread,
    ) ?? null
  );
}

/**
 * Convert Figma's 0-1 float RGBA to hex string.
 * Figma API returns r,g,b as 0-1 floats.
 */
function rgbaToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
