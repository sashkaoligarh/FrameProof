/**
 * CSS mapper — converts raw Figma nodes to NodeDetail with generated CSS mappings.
 * Matches node property values against cached observed values per research.md Decision 7.
 */

import type { Node } from '@figma/rest-api-spec';
import type { AllTokens, StyleMeta, ComponentMeta } from '../../types/tokens.js';
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
  ConstraintsInfo,
  AppliedStyles,
  TokenHint,
} from '../../types/mcp.js';
import {
  linearGradientCSS,
  radialGradientCSS,
  conicGradientCSS,
  diamondGradientCSS,
} from './gradient-css.js';
import type { GradientHandlePositions, FigmaGradientStop } from './gradient-css.js';
import {
  allocateCssTokenNames,
  cssVariableReference,
  type CssTokenNames,
} from '../../utils/css-token-names.js';

const DEFAULT_DEPTH = 5;

interface ParentGeometry {
  canvas_x: number;
  canvas_y: number;
  has_canvas_position: boolean;
  uses_auto_layout: boolean;
}

/** Optional file-level context for resolving shared styles and component names. */
export interface FileContext {
  styles: Record<string, StyleMeta>;
  components: Record<string, ComponentMeta>;
}

/**
 * Map a raw Figma node to a NodeDetail with CSS variable mappings.
 * Recursively processes children up to `maxDepth`.
 * Pass `fileCtx` to resolve shared style names and main component names.
 */
export function mapNodeToDetail(
  rawNode: Node,
  tokens: AllTokens,
  maxDepth: number = DEFAULT_DEPTH,
  fileCtx?: FileContext,
): NodeDetail {
  return buildNodeDetail(
    rawNode,
    allocateCssTokenNames(tokens),
    0,
    maxDepth,
    fileCtx,
    undefined,
  );
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function buildNodeDetail(
  raw: Node,
  cssTokens: CssTokenNames,
  currentDepth: number,
  maxDepth: number,
  fileCtx?: FileContext,
  parentGeometry?: ParentGeometry,
): NodeDetail {
  const r = raw as Record<string, unknown>;
  const bbox = r.absoluteBoundingBox as
    | { x: number; y: number; width: number; height: number }
    | undefined;

  // --- Opacity (T012) ---
  const rawOpacity = r.opacity as number | undefined;
  const opacityVal = rawOpacity !== undefined ? clampUnit(rawOpacity) : undefined;

  // --- Per-corner radii (T015) ---
  const rectCornerRadii = r.rectangleCornerRadii as [number, number, number, number] | undefined;
  let cornerRadii: [number, number, number, number] | null = null;
  if (rectCornerRadii && Array.isArray(rectCornerRadii)) {
    const allZero = rectCornerRadii.every((v) => v === 0);
    const allSame = rectCornerRadii.every((v) => v === rectCornerRadii[0]);
    if (!allZero && !allSame) {
      cornerRadii = rectCornerRadii;
    }
  }

  // --- Rotation (T016) ---
  const rawRotation = r.rotation as number | undefined;
  const rotation = rawRotation && rawRotation !== 0 ? rawRotation : null;

  // --- Blend mode (T017) ---
  const rawBlendMode = r.blendMode as string | undefined;
  const { blend_mode, blend_mode_css } = mapBlendMode(rawBlendMode);

  // --- Overflow (T018) ---
  const clipsContent = r.clipsContent as boolean | undefined;
  const overflow: 'hidden' | 'visible' = clipsContent === true ? 'hidden' : 'visible';

  // --- Absolute positioning (T020) ---
  const layoutPositioning = r.layoutPositioning as string | undefined;
  const position: 'absolute' | 'relative' =
    layoutPositioning === 'ABSOLUTE' || (parentGeometry && !parentGeometry.uses_auto_layout)
      ? 'absolute'
      : 'relative';

  // absoluteBoundingBox is canvas/global geometry. relativeTransform translation is
  // the node origin in its immediate parent's coordinate space.
  const canvasX = bbox?.x ?? 0;
  const canvasY = bbox?.y ?? 0;
  const parentRelative = mapParentRelativePosition(
    r,
    canvasX,
    canvasY,
    bbox !== undefined,
    parentGeometry,
  );
  const usesAutoLayout = isAutoLayout(r);

  // --- Constraints ---
  const constraints = mapConstraints(r);

  // --- Min/Max sizes ---
  const minWidth = r.minWidth as number | undefined;
  const maxWidth = r.maxWidth as number | undefined;
  const minHeight = r.minHeight as number | undefined;
  const maxHeight = r.maxHeight as number | undefined;

  // --- Applied styles (Figma shared styles) ---
  const appliedStyles = mapAppliedStyles(r, fileCtx);

  const detail: NodeDetail = {
    node_id: (r.id as string) ?? '',
    name: (r.name as string) ?? '',
    node_type: raw.type,
    width: bbox?.width ?? 0,
    height: bbox?.height ?? 0,
    canvas_x: canvasX,
    canvas_y: canvasY,
    parent_relative_x: parentRelative?.x ?? null,
    parent_relative_y: parentRelative?.y ?? null,
    // Deprecated compatibility aliases. These remain canvas coordinates.
    x: canvasX,
    y: canvasY,
    visible: r.visible !== false,
    fills: mapFills(r, cssTokens),
    strokes: mapStrokes(r, cssTokens),
    effects: mapEffects(r, cssTokens),
    corner_radius: mapCornerRadius(r, cssTokens),
    corner_radii: cornerRadii,
    rotation,
    blend_mode,
    blend_mode_css,
    overflow,
    position,
    layout: mapLayout(r, cssTokens),
    typography: mapTypography(r, cssTokens),
    text_content: raw.type === 'TEXT' ? ((r.characters as string) ?? null) : null,
    text_segments: mapTextSegments(r, cssTokens),
    children: mapChildren(r, cssTokens, currentDepth, maxDepth, fileCtx, {
      canvas_x: canvasX,
      canvas_y: canvasY,
      has_canvas_position: bbox !== undefined,
      uses_auto_layout: usesAutoLayout,
    }),
    component_info: mapComponentInfo(r, fileCtx),
  };

  // Omit opacity when 1.0 or absent (T012)
  if (opacityVal !== undefined && opacityVal < 1) {
    detail.opacity = opacityVal;
  }

  // Constraints (only when meaningful)
  if (constraints) {
    detail.constraints = constraints;
  }

  // Min/max sizes (only when set)
  if (minWidth !== undefined && minWidth > 0) detail.min_width = minWidth;
  if (maxWidth !== undefined && maxWidth < Infinity) detail.max_width = maxWidth;
  if (minHeight !== undefined && minHeight > 0) detail.min_height = minHeight;
  if (maxHeight !== undefined && maxHeight < Infinity) detail.max_height = maxHeight;

  // Applied styles (only when present)
  if (appliedStyles) {
    detail.applied_styles = appliedStyles;
  }

  // Token hints (non-standard values)
  const hints = collectTokenHints(detail, cssTokens);
  if (hints.length > 0) {
    detail.token_hints = hints;
  }

  return detail;
}

// ─── Fills ──────────────────────────────────────────────

function mapFills(r: Record<string, unknown>, cssTokens: CssTokenNames): CSSMappedFill[] {
  const fills = r.fills as Array<Record<string, unknown>> | undefined;
  if (!fills || !Array.isArray(fills)) return [];

  return fills
    .filter((f) => f.visible !== false)
    .map((f): CSSMappedFill | null => {
      const type = f.type as string;

      // --- SOLID fills ---
      if (type === 'SOLID') {
        const color = f.color as { r: number; g: number; b: number; a: number };
        const alpha = combinedPaintAlpha(color.a, f.opacity);
        const hex = rgbaToHex(color.r, color.g, color.b, alpha);
        const matched = matchColor(hex, cssTokens.colors);

        return {
          fill_type: 'solid',
          value_hex: hex,
          opacity: alpha,
          css_variable: matched ? cssVariableReference(matched.name) : null,
          css_property: 'background-color',
          css_value: rgbaToCSS(color.r, color.g, color.b, alpha),
          gradient_type: null,
          image_ref: null,
          scale_mode: null,
          scale_mode_css: null,
        };
      }

      // --- GRADIENT fills (T010) ---
      if (type.startsWith('GRADIENT_')) {
        const handles = parseGradientHandles(f);
        const paintOpacity = clampUnit(f.opacity);
        const stops = parseGradientStops(f, paintOpacity);
        const gradientSubtype = type.replace('GRADIENT_', '') as 'LINEAR' | 'RADIAL' | 'ANGULAR' | 'DIAMOND';

        let cssValue: string;
        switch (gradientSubtype) {
          case 'LINEAR':
            cssValue = linearGradientCSS(handles, stops);
            break;
          case 'RADIAL':
            cssValue = radialGradientCSS(handles, stops);
            break;
          case 'ANGULAR':
            cssValue = conicGradientCSS(handles, stops);
            break;
          case 'DIAMOND':
            cssValue = diamondGradientCSS(handles, stops);
            break;
        }

        return {
          fill_type: 'gradient',
          value_hex: null,
          opacity: paintOpacity,
          css_variable: null,
          css_property: 'background',
          css_value: cssValue,
          gradient_type: gradientSubtype,
          image_ref: null,
          scale_mode: null,
          scale_mode_css: null,
        };
      }

      // --- IMAGE fills (T011) ---
      if (type === 'IMAGE') {
        const imageRef = (f.imageRef as string) || null;
        const scaleMode = (f.scaleMode as string) ?? 'FILL';
        const paintOpacity = clampUnit(f.opacity);

        const scaleModeMap: Record<string, string> = {
          FILL: 'cover',
          FIT: 'contain',
          TILE: 'repeat',
          STRETCH: '100% 100%',
        };

        return {
          fill_type: 'image',
          value_hex: null,
          opacity: paintOpacity,
          css_variable: null,
          css_property: 'background-image',
          css_value: imageRef ? `url(${imageRef})` : null,
          gradient_type: null,
          image_ref: imageRef,
          scale_mode: scaleMode,
          scale_mode_css: scaleModeMap[scaleMode] ?? 'cover',
        };
      }

      return null;
    })
    .filter((f): f is CSSMappedFill => f !== null);
}

/** Parse Figma gradientHandlePositions into our typed struct. */
function parseGradientHandles(f: Record<string, unknown>): GradientHandlePositions {
  const positions = f.gradientHandlePositions as Array<{ x: number; y: number }> | undefined;
  return {
    p0: positions?.[0] ?? { x: 0, y: 0 },
    p1: positions?.[1] ?? { x: 1, y: 0 },
    p2: positions?.[2] ?? { x: 0, y: 1 },
  };
}

/** Parse Figma gradientStops into our typed struct. */
function parseGradientStops(
  f: Record<string, unknown>,
  paintOpacity: number,
): FigmaGradientStop[] {
  const stops = f.gradientStops as Array<{ position: number; color: { r: number; g: number; b: number; a: number } }> | undefined;
  return (stops ?? []).map((stop) => ({
    ...stop,
    color: {
      ...stop.color,
      a: combinedPaintAlpha(stop.color.a, paintOpacity),
    },
  }));
}

// ─── Strokes ────────────────────────────────────────────

function mapStrokes(r: Record<string, unknown>, cssTokens: CssTokenNames): CSSMappedStroke[] {
  const strokes = r.strokes as Array<Record<string, unknown>> | undefined;
  if (!strokes || !Array.isArray(strokes)) return [];

  const strokeWeight = (r.strokeWeight as number) ?? 1;
  const strokeAlign = (r.strokeAlign as string) ?? 'CENTER';
  const dashPattern = r.strokeDashPattern as number[] | undefined;

  return strokes
    .filter((s) => s.type === 'SOLID' && s.visible !== false)
    .map((s) => {
      const color = s.color as { r: number; g: number; b: number; a: number };
      const alpha = combinedPaintAlpha(color.a, s.opacity);
      const hex = rgbaToHex(color.r, color.g, color.b, alpha);
      const matched = matchColor(hex, cssTokens.colors);

      const alignment = strokeAlign as 'INSIDE' | 'OUTSIDE' | 'CENTER';
      let alignmentCss = 'border';
      if (alignment === 'INSIDE') alignmentCss = 'box-shadow-inset';
      else if (alignment === 'OUTSIDE') alignmentCss = 'outline';

      return {
        value_hex: hex,
        opacity: alpha,
        weight: strokeWeight,
        css_variable: matched ? cssVariableReference(matched.name) : null,
        css_property: 'border-color',
        css_value: rgbaToCSS(color.r, color.g, color.b, alpha),
        alignment,
        alignment_css: alignmentCss,
        dash_pattern: dashPattern && dashPattern.length > 0 ? dashPattern : null,
      };
    });
}

// ─── Effects ────────────────────────────────────────────

function mapEffects(r: Record<string, unknown>, cssTokens: CssTokenNames): CSSMappedEffect[] {
  const effects = r.effects as Array<Record<string, unknown>> | undefined;
  if (!effects || !Array.isArray(effects)) return [];

  return effects
    .filter((e) => e.visible !== false)
    .map((e) => {
      const effectType = e.type as string;
      const cssValue = buildEffectCSS(e);
      const matched = matchShadow(e, cssTokens.shadows);

      let cssProperty: string;
      if (effectType === 'BACKGROUND_BLUR') {
        cssProperty = 'backdrop-filter';
      } else if (effectType === 'LAYER_BLUR') {
        cssProperty = 'filter';
      } else if (effectType === 'INNER_SHADOW') {
        cssProperty = 'box-shadow';
      } else {
        cssProperty = 'box-shadow';
      }

      return {
        effect_type: effectType,
        css_value: cssValue,
        css_variable: matched ? cssVariableReference(matched.name) : null,
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
  cssTokens: CssTokenNames,
): CSSMappedValue | null {
  const radius = r.cornerRadius as number | undefined;
  if (radius === undefined || radius === 0) return null;

  const matched = cssTokens.radii.find(
    (entry) => entry.token.value === radius && !entry.token.is_per_corner,
  ) ?? cssTokens.radii.find((entry) => entry.token.value === radius);

  return {
    value: radius,
    css_variable: matched ? cssVariableReference(matched.name) : null,
    css_property: 'border-radius',
  };
}

// ─── Layout ─────────────────────────────────────────────

function mapLayout(r: Record<string, unknown>, cssTokens: CssTokenNames): LayoutInfo | null {
  const layoutMode = r.layoutMode as string | undefined;
  if (!layoutMode || layoutMode === 'NONE') return null;

  const paddingTop = (r.paddingTop as number) ?? 0;
  const paddingRight = (r.paddingRight as number) ?? 0;
  const paddingBottom = (r.paddingBottom as number) ?? 0;
  const paddingLeft = (r.paddingLeft as number) ?? 0;
  const itemSpacing = (r.itemSpacing as number) ?? 0;
  const counterAxisSpacing = r.counterAxisSpacing as number | undefined;

  const sizingH = r.layoutSizingHorizontal as string | undefined;
  const sizingV = r.layoutSizingVertical as string | undefined;

  return {
    mode: layoutMode,
    padding: {
      top: paddingTop,
      right: paddingRight,
      bottom: paddingBottom,
      left: paddingLeft,
    },
    padding_css: [
      mapSpacingValue(paddingTop, 'padding-top', cssTokens),
      mapSpacingValue(paddingRight, 'padding-right', cssTokens),
      mapSpacingValue(paddingBottom, 'padding-bottom', cssTokens),
      mapSpacingValue(paddingLeft, 'padding-left', cssTokens),
    ],
    item_spacing: itemSpacing,
    item_spacing_css: matchSpacingCSS(itemSpacing, cssTokens),
    counter_axis_spacing: counterAxisSpacing ?? null,
    primary_axis_align: (r.primaryAxisAlignItems as string) ?? 'MIN',
    counter_axis_align: (r.counterAxisAlignItems as string) ?? 'MIN',
    layout_wrap: (r.layoutWrap as string) ?? 'NO_WRAP',
    sizing_horizontal: (sizingH as LayoutInfo['sizing_horizontal']) ?? null,
    sizing_vertical: (sizingV as LayoutInfo['sizing_vertical']) ?? null,
  };
}

function mapSpacingValue(
  value: number,
  cssProperty: string,
  cssTokens: CssTokenNames,
): CSSMappedValue {
  const matched = cssTokens.spacing.find((entry) => entry.token.value === value);
  return {
    value,
    css_variable: matched ? cssVariableReference(matched.name) : null,
    css_property: cssProperty,
  };
}

function matchSpacingCSS(value: number, cssTokens: CssTokenNames): string | null {
  const matched = cssTokens.spacing.find((entry) => entry.token.value === value);
  return matched ? cssVariableReference(matched.name) : null;
}

// ─── Typography ─────────────────────────────────────────

function mapTypography(
  r: Record<string, unknown>,
  cssTokens: CssTokenNames,
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

  const familyToken = cssTokens.fontFamilies.find((entry) => entry.value === fontFamily)
    ?? cssTokens.fontFamilies.find(
      (entry) => entry.value.toLowerCase() === fontFamily.toLowerCase(),
    );
  const sizeToken = cssTokens.fontSizes.find((entry) => entry.value === fontSize);
  const weightToken = cssTokens.fontWeights.find((entry) => entry.value === fontWeight);

  // Get text color from fills
  const fills = r.fills as Array<Record<string, unknown>> | undefined;
  let colorHex = '#000000';
  let colorCss: string | null = null;
  if (fills && fills.length > 0) {
    const firstFill = fills[0];
    if (firstFill.type === 'SOLID' && firstFill.visible !== false) {
      const c = firstFill.color as { r: number; g: number; b: number; a: number };
      colorHex = rgbaToHex(c.r, c.g, c.b, combinedPaintAlpha(c.a, firstFill.opacity));
      const matched = matchColor(colorHex, cssTokens.colors);
      colorCss = matched ? cssVariableReference(matched.name) : null;
    }
  }

  // Compute em-based values
  const lineHeightEm = lineHeightPx && fontSize > 0
    ? `${parseFloat((lineHeightPx / fontSize).toFixed(4))}em`
    : 'normal';
  const letterSpacingEm = fontSize > 0
    ? `${parseFloat((letterSpacing / fontSize).toFixed(4))}em`
    : '0em';

  return {
    font_family: fontFamily,
    font_family_css: familyToken ? cssVariableReference(familyToken.name) : null,
    font_size: fontSize,
    font_size_css: sizeToken ? cssVariableReference(sizeToken.name) : null,
    font_weight: fontWeight,
    font_weight_css: weightToken ? cssVariableReference(weightToken.name) : null,
    line_height: lineHeightPx ? `${lineHeightPx}px` : 'normal',
    line_height_em: lineHeightEm,
    letter_spacing: letterSpacing,
    letter_spacing_em: letterSpacingEm,
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
  cssTokens: CssTokenNames,
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
      const hex = segColor
        ? rgbaToHex(segColor.r, segColor.g, segColor.b, segColor.a)
        : '#000000';
      const matched = matchColor(hex, cssTokens.colors);

      const segFontFamily = (override?.fontFamily as string) ?? defaultFontFamily;
      const segFontSize = (override?.fontSize as number) ?? defaultFontSize;
      const segFontWeight = (override?.fontWeight as number) ?? defaultFontWeight;

      segments.push({
        text: segText,
        start: segStart,
        end: i,
        color_hex: hex,
        color_css: matched ? cssVariableReference(matched.name) : null,
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
  const color = first.color as { r: number; g: number; b: number; a: number };
  return { ...color, a: combinedPaintAlpha(color.a, first.opacity) };
}

// ─── Children ───────────────────────────────────────────

function mapChildren(
  r: Record<string, unknown>,
  cssTokens: CssTokenNames,
  currentDepth: number,
  maxDepth: number,
  fileCtx?: FileContext,
  parentGeometry?: ParentGeometry,
): NodeDetail[] {
  if (currentDepth >= maxDepth) return [];

  const children = r.children as Node[] | undefined;
  if (!children || !Array.isArray(children)) return [];

  return children.map((child) =>
    buildNodeDetail(child, cssTokens, currentDepth + 1, maxDepth, fileCtx, parentGeometry),
  );
}

function isAutoLayout(r: Record<string, unknown>): boolean {
  const layoutMode = r.layoutMode as string | undefined;
  return layoutMode !== undefined && layoutMode !== 'NONE';
}

function mapParentRelativePosition(
  r: Record<string, unknown>,
  canvasX: number,
  canvasY: number,
  hasCanvasPosition: boolean,
  parentGeometry?: ParentGeometry,
): { x: number; y: number } | null {
  if (!parentGeometry) return null;

  const transform = r.relativeTransform as unknown;
  if (
    Array.isArray(transform) &&
    Array.isArray(transform[0]) &&
    Array.isArray(transform[1]) &&
    typeof transform[0][2] === 'number' &&
    Number.isFinite(transform[0][2]) &&
    typeof transform[1][2] === 'number' &&
    Number.isFinite(transform[1][2])
  ) {
    return { x: transform[0][2], y: transform[1][2] };
  }

  return hasCanvasPosition && parentGeometry.has_canvas_position
    ? {
        x: canvasX - parentGeometry.canvas_x,
        y: canvasY - parentGeometry.canvas_y,
      }
    : null;
}

// ─── Component Info ─────────────────────────────────────

function mapComponentInfo(r: Record<string, unknown>, fileCtx?: FileContext): ComponentRef | null {
  const type = r.type as string;

  if (type === 'INSTANCE') {
    const componentId = (r.componentId as string) ?? '';
    const ref: ComponentRef = {
      component_id: componentId,
      component_name: (r.name as string) ?? '',
      is_instance: true,
      variant_properties: (r.componentProperties as Record<string, string>) ?? null,
    };

    // Resolve main component name and description from file context
    if (fileCtx?.components && componentId) {
      const mainComp = fileCtx.components[componentId];
      if (mainComp) {
        ref.main_component_name = mainComp.name;
        if (mainComp.description) {
          ref.main_component_description = mainComp.description;
        }
      }
    }

    return ref;
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

// ─── Blend Mode (T017) ──────────────────────────────────

const BLEND_MODE_MAP: Record<string, string> = {
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  DARKEN: 'darken',
  LIGHTEN: 'lighten',
  COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn',
  HARD_LIGHT: 'hard-light',
  SOFT_LIGHT: 'soft-light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HUE: 'hue',
  SATURATION: 'saturation',
  COLOR: 'color',
  LUMINOSITY: 'luminosity',
  LINEAR_BURN: 'color-burn',
  LINEAR_DODGE: 'color-dodge',
};

function mapBlendMode(rawBlendMode: string | undefined): {
  blend_mode: string | null;
  blend_mode_css: string | null;
} {
  if (!rawBlendMode || rawBlendMode === 'NORMAL' || rawBlendMode === 'PASS_THROUGH') {
    return { blend_mode: null, blend_mode_css: null };
  }

  const cssValue = BLEND_MODE_MAP[rawBlendMode] ?? rawBlendMode.toLowerCase().replace(/_/g, '-');
  return { blend_mode: rawBlendMode, blend_mode_css: cssValue };
}

// ─── Color Matching ─────────────────────────────────────

function matchColor(
  hex: string,
  colors: CssTokenNames['colors'],
): CssTokenNames['colors'][number] | null {
  const normalized = hex.toLowerCase();
  return colors.find((entry) => entry.token.value_hex.toLowerCase() === normalized) ?? null;
}

function matchShadow(
  effect: Record<string, unknown>,
  shadows: CssTokenNames['shadows'],
): CssTokenNames['shadows'][number] | null {
  const type = effect.type as string;
  if (type !== 'DROP_SHADOW' && type !== 'INNER_SHADOW') return null;

  const offset = effect.offset as { x: number; y: number } | undefined;
  const radius = (effect.radius as number) ?? 0;
  const spread = (effect.spread as number) ?? 0;

  const x = offset?.x ?? 0;
  const y = offset?.y ?? 0;

  return (
    shadows.find(
      (entry) =>
        entry.token.shadow_type === type &&
        entry.token.offset_x === x &&
        entry.token.offset_y === y &&
        entry.token.blur === radius &&
        entry.token.spread === spread,
    ) ?? null
  );
}

/**
 * Convert Figma's 0-1 float RGBA to hex string.
 * Figma API returns r,g,b as 0-1 floats.
 */
function rgbaToHex(r: number, g: number, b: number, a: number = 1): string {
  const toHex = (v: number) =>
    Math.round(clampUnit(v) * 255)
      .toString(16)
      .padStart(2, '0');
  const rgb = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  return a < 1 ? `${rgb}${toHex(a)}` : rgb;
}

function rgbaToCSS(r: number, g: number, b: number, a: number): string {
  if (a >= 1) return rgbaToHex(r, g, b);

  const channel = (value: number) => Math.round(clampUnit(value) * 255);
  const alpha = Math.round(a * 10000) / 10000;
  return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${alpha})`;
}

function combinedPaintAlpha(colorAlpha: number | undefined, paintOpacity: unknown): number {
  return clampUnit(colorAlpha) * clampUnit(paintOpacity);
}

function clampUnit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

// ─── Constraints ────────────────────────────────────────

function mapConstraints(r: Record<string, unknown>): ConstraintsInfo | null {
  const constraints = r.constraints as { horizontal?: string; vertical?: string } | undefined;
  if (!constraints) return null;

  const h = constraints.horizontal ?? 'MIN';
  const v = constraints.vertical ?? 'MIN';

  // Skip if both are default MIN — no useful info
  if (h === 'MIN' && v === 'MIN') return null;

  const hCssMap: Record<string, string> = {
    MIN: 'align-self: flex-start',
    CENTER: 'margin-inline: auto',
    MAX: 'align-self: flex-end',
    STRETCH: 'width: 100%',
    SCALE: 'width: percentage-based',
  };

  const vCssMap: Record<string, string> = {
    MIN: 'align-self: flex-start',
    CENTER: 'margin-block: auto',
    MAX: 'align-self: flex-end',
    STRETCH: 'height: 100%',
    SCALE: 'height: percentage-based',
  };

  return {
    horizontal: h,
    vertical: v,
    horizontal_css: hCssMap[h] ?? h,
    vertical_css: vCssMap[v] ?? v,
  };
}

// ─── Applied Styles (Figma shared styles) ───────────────

function mapAppliedStyles(r: Record<string, unknown>, fileCtx?: FileContext): AppliedStyles | null {
  const rawStyles = r.styles as Record<string, string> | undefined;
  if (!rawStyles || !fileCtx?.styles) return null;

  const result: AppliedStyles = {};
  let hasAny = false;

  for (const [type, styleId] of Object.entries(rawStyles)) {
    const meta = fileCtx.styles[styleId];
    if (meta) {
      const key = type.toLowerCase() as keyof AppliedStyles;
      if (key === 'fill' || key === 'stroke' || key === 'text' || key === 'effect') {
        result[key] = { id: styleId, name: meta.name };
        hasAny = true;
      }
    }
  }

  return hasAny ? result : null;
}

// ─── Nearest observed-value hints ───────────────────────

function collectTokenHints(detail: NodeDetail, cssTokens: CssTokenNames): TokenHint[] {
  const hints: TokenHint[] = [];

  // Check padding values against spacing tokens
  if (detail.layout) {
    const { padding } = detail.layout;
    for (const [side, value] of Object.entries(padding)) {
      if (value === 0) continue;
      const nearest = findNearestSpacing(value, cssTokens);
      if (nearest && nearest.delta !== 0) {
        hints.push({
          property: `padding-${side}`,
          actual_value: value,
          nearest_token: cssVariableReference(nearest.name),
          nearest_value: nearest.value,
          delta: nearest.delta,
        });
      }
    }

    // Check item_spacing
    if (detail.layout.item_spacing > 0) {
      const nearest = findNearestSpacing(detail.layout.item_spacing, cssTokens);
      if (nearest && nearest.delta !== 0) {
        hints.push({
          property: 'gap',
          actual_value: detail.layout.item_spacing,
          nearest_token: cssVariableReference(nearest.name),
          nearest_value: nearest.value,
          delta: nearest.delta,
        });
      }
    }
  }

  // Check corner radius
  if (detail.corner_radius && !detail.corner_radius.css_variable) {
    const nearest = findNearestRadius(detail.corner_radius.value, cssTokens);
    if (nearest && nearest.delta !== 0) {
      hints.push({
        property: 'border-radius',
        actual_value: detail.corner_radius.value,
        nearest_token: cssVariableReference(nearest.name),
        nearest_value: nearest.value,
        delta: nearest.delta,
      });
    }
  }

  // Check fill colors against color tokens
  for (const fill of detail.fills) {
    if (fill.fill_type === 'solid' && fill.value_hex && !fill.css_variable) {
      const nearest = findNearestColor(fill.value_hex, cssTokens);
      if (nearest && nearest.distance > 0 && nearest.distance < 30) {
        hints.push({
          property: 'color',
          actual_value: fill.value_hex,
          nearest_token: cssVariableReference(nearest.name),
          nearest_value: nearest.hex,
          delta: Math.round(nearest.distance),
        });
      }
    }
  }

  // Check font size
  if (detail.typography && !detail.typography.font_size_css) {
    const nearest = findNearestFontSize(detail.typography.font_size, cssTokens);
    if (nearest && nearest.delta !== 0) {
      hints.push({
        property: 'font-size',
        actual_value: detail.typography.font_size,
        nearest_token: cssVariableReference(nearest.name),
        nearest_value: nearest.value,
        delta: nearest.delta,
      });
    }
  }

  return hints;
}

function findNearestSpacing(
  value: number,
  cssTokens: CssTokenNames,
): { value: number; name: string; delta: number } | null {
  if (cssTokens.spacing.length === 0) return null;
  let best = cssTokens.spacing[0];
  let bestDelta = Math.abs(best.token.value - value);
  for (const spacing of cssTokens.spacing) {
    const d = Math.abs(spacing.token.value - value);
    if (d < bestDelta) {
      best = spacing;
      bestDelta = d;
    }
  }
  // Exact match means the css_variable was already set
  if (bestDelta === 0) return null;
  return { value: best.token.value, name: best.name, delta: value - best.token.value };
}

function findNearestRadius(
  value: number,
  cssTokens: CssTokenNames,
): { value: number; name: string; delta: number } | null {
  const uniform = cssTokens.radii.filter((entry) => !entry.token.is_per_corner);
  const candidates = uniform.length > 0 ? uniform : cssTokens.radii;
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDelta = Math.abs(best.token.value - value);
  for (const radius of candidates) {
    const d = Math.abs(radius.token.value - value);
    if (d < bestDelta) {
      best = radius;
      bestDelta = d;
    }
  }
  if (bestDelta === 0) return null;
  return { value: best.token.value, name: best.name, delta: value - best.token.value };
}

function findNearestColor(
  hex: string,
  cssTokens: CssTokenNames,
): { name: string; hex: string; distance: number } | null {
  if (cssTokens.colors.length === 0) return null;
  const [qr, qg, qb] = hexToRgbInts(hex);
  let bestName = '';
  let bestHex = '';
  let bestDist = Infinity;
  for (const color of cssTokens.colors) {
    const [cr, cg, cb] = hexToRgbInts(color.token.value_hex);
    const d = Math.sqrt((qr - cr) ** 2 + (qg - cg) ** 2 + (qb - cb) ** 2);
    if (d < bestDist) {
      bestDist = d;
      bestName = color.name;
      bestHex = color.token.value_hex;
    }
  }
  return { name: bestName, hex: bestHex, distance: bestDist };
}

function findNearestFontSize(
  value: number,
  cssTokens: CssTokenNames,
): { value: number; name: string; delta: number } | null {
  if (cssTokens.fontSizes.length === 0) return null;
  let best = cssTokens.fontSizes[0];
  let bestDelta = Math.abs(best.value - value);
  for (const size of cssTokens.fontSizes) {
    const d = Math.abs(size.value - value);
    if (d < bestDelta) {
      best = size;
      bestDelta = d;
    }
  }
  if (bestDelta === 0) return null;
  return { value: best.value, name: best.name, delta: value - best.value };
}

function hexToRgbInts(hex: string): [number, number, number] {
  let h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
