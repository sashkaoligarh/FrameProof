/**
 * MCP-specific types for Figma MCP Server.
 * Based on data-model.md specification.
 */

import type { FigmaFile, ParsedNode, AllTokens } from './tokens.js';

// ─── Cache ──────────────────────────────────────────────

/** In-memory cache entry for a parsed Figma file. */
export interface CacheEntry {
  file_id: string;
  file: FigmaFile;
  nodes: ParsedNode[];
  tokens: AllTokens;
  fetched_at: number;
  ttl_ms: number;
}

// ─── CSS Mapped Types ───────────────────────────────────

export interface CSSMappedFill {
  fill_type: 'solid' | 'gradient' | 'image';
  /** Exact paint color as #RRGGBB or #RRGGBBAA. null for non-solid paints. */
  value_hex: string | null;
  /** Effective solid alpha, or source opacity for gradients/images. Gradient CSS already includes it; node opacity is separate. */
  opacity: number;
  /** Generated reference to an observed CSS custom property; not an authoritative Figma variable. */
  css_variable: string | null;
  css_property: string;
  /** Exact CSS paint value. Solid values include paint alpha; gradients include it in stop alpha. */
  css_value: string | null;
  /** Gradient type from Figma — present for gradient fills */
  gradient_type: 'LINEAR' | 'RADIAL' | 'ANGULAR' | 'DIAMOND' | null;
  /** Figma image hash reference — present for image fills */
  image_ref: string | null;
  /** Original Figma scale mode — present for image fills */
  scale_mode: string | null;
  /** CSS equivalent of scale_mode: cover, contain, repeat, 100% 100% */
  scale_mode_css: string | null;
}

export interface CSSMappedStroke {
  /** Exact stroke color as #RRGGBB or #RRGGBBAA. */
  value_hex: string;
  /** Effective paint alpha. Never includes node opacity. */
  opacity: number;
  weight: number;
  /** Generated reference to an observed CSS custom property; not an authoritative Figma variable. */
  css_variable: string | null;
  css_property: string;
  /** Exact CSS color including paint alpha. */
  css_value: string;
  /** Stroke alignment: INSIDE, OUTSIDE, CENTER */
  alignment: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  /** CSS hint: "border" for CENTER, "box-shadow-inset" for INSIDE, "outline" for OUTSIDE */
  alignment_css: string;
  /** Dash pattern from strokeDashPattern. null when solid. */
  dash_pattern: number[] | null;
}

export interface CSSMappedEffect {
  effect_type: string;
  css_value: string;
  /** Generated reference to an observed CSS custom property; not an authoritative Figma variable. */
  css_variable: string | null;
  css_property: string;
}

export interface CSSMappedValue {
  value: number;
  /** Generated reference to an observed CSS custom property; not an authoritative Figma variable. */
  css_variable: string | null;
  css_property: string;
}

export interface CSSMappedTypography {
  font_family: string;
  /** Generated reference based on observed typography values. */
  font_family_css: string | null;
  font_size: number;
  /** Generated reference based on observed typography values. */
  font_size_css: string | null;
  font_weight: number;
  /** Generated reference based on observed typography values. */
  font_weight_css: string | null;
  line_height: string;
  /** Line-height in em units: "{lineHeightPx/fontSize}em" or "normal" */
  line_height_em: string;
  letter_spacing: number;
  /** Letter-spacing in em: "{letterSpacing/fontSize}em" or "0em" */
  letter_spacing_em: string;
  text_align: string;
  text_case: string;
  text_decoration: string;
  color_hex: string;
  /** Generated reference based on an observed color value. */
  color_css: string | null;
}

// ─── Layout ─────────────────────────────────────────────

export interface LayoutInfo {
  mode: string;
  padding: { top: number; right: number; bottom: number; left: number };
  padding_css: CSSMappedValue[];
  item_spacing: number;
  item_spacing_css: string | null;
  counter_axis_spacing: number | null;
  primary_axis_align: string;
  counter_axis_align: string;
  layout_wrap: string;
  /** From layoutSizingHorizontal. null if not auto-layout. */
  sizing_horizontal: 'FIXED' | 'HUG' | 'FILL' | null;
  /** From layoutSizingVertical. null if not auto-layout. */
  sizing_vertical: 'FIXED' | 'HUG' | 'FILL' | null;
}

// ─── Constraints ────────────────────────────────────────

export interface ConstraintsInfo {
  horizontal: string;
  vertical: string;
  /** CSS hint for horizontal constraint */
  horizontal_css: string;
  /** CSS hint for vertical constraint */
  vertical_css: string;
}

// ─── Applied Styles (Figma shared styles) ───────────────

export interface AppliedStyles {
  fill?: { id: string; name: string };
  stroke?: { id: string; name: string };
  text?: { id: string; name: string };
  effect?: { id: string; name: string };
}

// ─── Token Hints (non-standard values) ─────────────────

export interface TokenHint {
  property: string;
  actual_value: number | string;
  /** Nearest generated CSS custom property from observed values, not a Figma variable binding. */
  nearest_token: string;
  nearest_value: number | string;
  delta: number;
}

// ─── Component Reference ────────────────────────────────

export interface ComponentRef {
  component_id: string;
  component_name: string;
  is_instance: boolean;
  variant_properties: Record<string, string> | null;
  /** Resolved name of the main component (from file.components). Present only for instances. */
  main_component_name?: string;
  /** Description of the main component. Present only for instances. */
  main_component_description?: string;
}

// ─── Text Segments ─────────────────────────────────────

/** A contiguous run of text sharing the same character style override. */
export interface TextSegment {
  text: string;
  start: number;
  end: number;
  color_hex: string;
  /** Generated reference based on an observed color value. */
  color_css: string | null;
  font_family: string | null;
  font_size: number | null;
  font_weight: number | null;
}

// ─── Node Detail ────────────────────────────────────────

/** AI-optimized representation of a Figma node with CSS mappings. */
export interface NodeDetail {
  node_id: string;
  name: string;
  node_type: string;
  width: number;
  height: number;
  /** X coordinate of absoluteBoundingBox in Figma canvas/global space. */
  canvas_x: number;
  /** Y coordinate of absoluteBoundingBox in Figma canvas/global space. */
  canvas_y: number;
  /** X coordinate in the immediate parent's coordinate space. null for a mapped root. */
  parent_relative_x: number | null;
  /** Y coordinate in the immediate parent's coordinate space. null for a mapped root. */
  parent_relative_y: number | null;
  /** @deprecated Canvas/global X alias. Use canvas_x; this is not parent-relative. */
  x: number;
  /** @deprecated Canvas/global Y alias. Use canvas_y; this is not parent-relative. */
  y: number;
  visible: boolean;
  fills: CSSMappedFill[];
  strokes: CSSMappedStroke[];
  effects: CSSMappedEffect[];
  corner_radius: CSSMappedValue | null;
  /** Per-corner radii [top-left, top-right, bottom-right, bottom-left]. null when uniform or all zeros. */
  corner_radii: [number, number, number, number] | null;
  /** Node/layer-level opacity (0-1), separate from paint alpha. Omitted when 1.0. */
  opacity?: number;
  /** Rotation in degrees. null when 0 or not applicable. */
  rotation: number | null;
  /** Figma blend mode string. null when PASS_THROUGH or NORMAL. */
  blend_mode: string | null;
  /** CSS mix-blend-mode value. null when default. */
  blend_mode_css: string | null;
  /** Derived from clipsContent. */
  overflow: 'hidden' | 'visible';
  /** "relative" for auto-layout participants; "absolute" for manually positioned children. */
  position: 'absolute' | 'relative';
  layout: LayoutInfo | null;
  typography: CSSMappedTypography | null;
  text_content: string | null;
  text_segments: TextSegment[] | null;
  children: NodeDetail[];
  component_info: ComponentRef | null;
  /** Number of collapsed vector children — present only when node_type is IMAGE_SVG. */
  collapsed_children_count?: number;
  /** Figma constraints (horizontal/vertical). Present for non-auto-layout children. */
  constraints?: ConstraintsInfo;
  /** Min width in px. Present only when set in Figma. */
  min_width?: number;
  /** Max width in px. Present only when set in Figma. */
  max_width?: number;
  /** Min height in px. Present only when set in Figma. */
  min_height?: number;
  /** Max height in px. Present only when set in Figma. */
  max_height?: number;
  /** Named Figma shared styles applied to this node. Shared styles are not variables. */
  applied_styles?: AppliedStyles;
  /** Nearest-value suggestions derived from observed/generated values, not authoritative tokens. */
  token_hints?: TokenHint[];
}

// ─── Gradient Stop (internal use for gradient-css.ts) ───

export interface GradientStop {
  position: number;
  color_hex: string;
  color_rgba: string;
}

// ─── Style Deduplication ────────────────────────────────

/** String reference to a shared style: "f_{hash8}", "s_{hash8}", "e_{hash8}" */
export type SharedStyleRef = string;

/** Map of style ref → fill/stroke/effect object */
export type SharedStylesMap = Record<string, CSSMappedFill | CSSMappedStroke | CSSMappedEffect>;

/** Same as NodeDetail but fills/strokes/effects can be string refs. Inherits all new fields (constraints, min/max, applied_styles, token_hints). */
export interface NodeDetailDeduped extends Omit<NodeDetail, 'fills' | 'strokes' | 'effects' | 'children'> {
  fills: (CSSMappedFill | SharedStyleRef)[];
  strokes: (CSSMappedStroke | SharedStyleRef)[];
  effects: (CSSMappedEffect | SharedStyleRef)[];
  children: NodeDetailDeduped[];
  _shared_styles?: SharedStylesMap;
}

// ─── Document Structure ─────────────────────────────────

export interface FrameSummary {
  node_id: string;
  name: string;
  width: number;
  height: number;
  node_type: string;
}

export interface PageSummary {
  page_id: string;
  name: string;
  child_count: number;
  top_frames: FrameSummary[];
}

export interface DocumentStructure {
  file_id: string;
  file_name: string;
  pages: PageSummary[];
  component_count: number;
  component_set_count: number;
}

// ─── Token Search ───────────────────────────────────────

export interface TokenMatch {
  category: string;
  name: string;
  css_variable: string;
  value: string;
  usage_count: number;
  distance: number;
}

export interface TokenSearchResult {
  query: string;
  matches: TokenMatch[];
}
