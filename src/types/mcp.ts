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
  value_hex: string;
  opacity: number;
  css_variable: string | null;
  css_property: string;
}

export interface CSSMappedStroke {
  value_hex: string;
  weight: number;
  css_variable: string | null;
  css_property: string;
}

export interface CSSMappedEffect {
  effect_type: string;
  css_value: string;
  css_variable: string | null;
  css_property: string;
}

export interface CSSMappedValue {
  value: number;
  css_variable: string | null;
  css_property: string;
}

export interface CSSMappedTypography {
  font_family: string;
  font_family_css: string | null;
  font_size: number;
  font_size_css: string | null;
  font_weight: number;
  font_weight_css: string | null;
  line_height: string;
  letter_spacing: number;
  text_align: string;
  text_case: string;
  text_decoration: string;
  color_hex: string;
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
}

// ─── Component Reference ────────────────────────────────

export interface ComponentRef {
  component_id: string;
  component_name: string;
  is_instance: boolean;
  variant_properties: Record<string, string> | null;
}

// ─── Text Segments ─────────────────────────────────────

/** A contiguous run of text sharing the same character style override. */
export interface TextSegment {
  text: string;
  start: number;
  end: number;
  color_hex: string;
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
  x: number;
  y: number;
  visible: boolean;
  fills: CSSMappedFill[];
  strokes: CSSMappedStroke[];
  effects: CSSMappedEffect[];
  corner_radius: CSSMappedValue | null;
  layout: LayoutInfo | null;
  typography: CSSMappedTypography | null;
  text_content: string | null;
  text_segments: TextSegment[] | null;
  children: NodeDetail[];
  component_info: ComponentRef | null;
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
