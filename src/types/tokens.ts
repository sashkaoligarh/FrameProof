/**
 * Core types for Figma Design Parser.
 * Based on data-model.md specification.
 */

// Re-export Figma API types for convenience
import type { Node } from '@figma/rest-api-spec';

/** Context for a parse run. Immutable after creation. */
export interface ParseContext {
  file_id: string;
  token: string;
  output_dir: string;
  page_filter?: string;
  node_filter?: string;
  include_hidden: boolean;
  format: 'all' | 'json' | 'css' | 'context';
  export_images: boolean;
  image_formats: ImageFormat[];
  image_scale: number;
}

/** Representation of a fetched Figma file. */
export interface FigmaFile {
  file_id: string;
  name: string;
  last_modified: string;
  version: string;
  document: Node;
  components: Record<string, ComponentMeta>;
  component_sets: Record<string, ComponentSetMeta>;
  styles: Record<string, StyleMeta>;
}

export interface ComponentMeta {
  key: string;
  name: string;
  description: string;
  component_set_id?: string;
}

export interface ComponentSetMeta {
  key: string;
  name: string;
  description: string;
}

export interface StyleMeta {
  key: string;
  name: string;
  style_type: string;
  description: string;
}

/** Flat representation of a node after tree traversal. */
export interface ParsedNode {
  node_id: string;
  node_type: string;
  name: string;
  parent_id: string | null;
  depth: number;
  raw: Node;
}

/** RGBA color value. r,g,b: 0-255 integers, a: 0-1 float. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Extracted color token. */
export interface ColorToken {
  name: string;
  node_id: string;
  source_type: 'fill' | 'stroke';
  value_hex: string;
  value_rgba: RGBA;
  opacity: number;
  usage_count: number;
  used_in_types: string[];
}

/** Gradient stop. */
export interface GradientStop {
  position: number;
  color_hex: string;
  color_rgba: RGBA;
}

/** Extracted gradient token. */
export interface GradientToken {
  name: string;
  node_id: string;
  gradient_type: 'LINEAR' | 'RADIAL' | 'ANGULAR' | 'DIAMOND';
  stops: GradientStop[];
  handle_positions: { x: number; y: number }[];
}

/** Extracted typography token. */
export interface TypographyToken {
  name: string;
  node_id: string;
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
  usage_count: number;
}

/** Extracted spacing token. */
export interface SpacingToken {
  value: number;
  source: 'padding' | 'item_spacing' | 'counter_axis';
  usage_count: number;
}

/** Extracted border-radius token. */
export interface RadiusToken {
  value: number;
  is_per_corner: boolean;
  usage_count: number;
}

/** Extracted shadow token. */
export interface ShadowToken {
  name: string;
  node_id: string;
  shadow_type: 'DROP_SHADOW' | 'INNER_SHADOW';
  offset_x: number;
  offset_y: number;
  blur: number;
  spread: number;
  color_hex: string;
  color_rgba: RGBA;
  css: string;
}

/** Extracted image fill token. */
export interface ImageToken {
  node_id: string;
  name: string;
  image_ref: string;
  scale_mode: string;
  node_type: string;
  file_name: string;
  downloaded: boolean;
  formats_downloaded: string[];
}

/** Image export format. */
export type ImageFormat = 'svg' | 'png' | 'jpg' | 'pdf';

/** Simplified child node representation for components. */
export interface ComponentChild {
  node_id: string;
  node_type: string;
  name: string;
  children?: ComponentChild[];
}

/** Variant information for a component set. */
export interface VariantInfo {
  node_id: string;
  name: string;
  properties: Record<string, string>;
  width: number;
  height: number;
}

/** Extracted component information. */
export interface ComponentInfo {
  node_id: string;
  name: string;
  component_type: 'COMPONENT' | 'COMPONENT_SET';
  width: number;
  height: number;
  description: string;
  layout_mode?: string;
  padding: { top: number; right: number; bottom: number; left: number };
  item_spacing?: number;
  counter_axis_spacing?: number;
  primary_axis_align?: string;
  counter_axis_align?: string;
  layout_wrap?: string;
  clips_content: boolean;
  corner_radius?: number;
  corner_radii?: number[];
  variants?: VariantInfo[];
  children: ComponentChild[];
}

/** Aggregated set of all extracted tokens. */
export interface AllTokens {
  colors: ColorToken[];
  gradients: GradientToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  radii: RadiusToken[];
  shadows: ShadowToken[];
  images: ImageToken[];
  components: ComponentInfo[];
}

/** Generation metadata manifest. */
export interface OutputManifest {
  file_id: string;
  file_name: string;
  generated_at: string;
  node_count: number;
  filters_applied: {
    page?: string;
    node?: string;
    include_hidden: boolean;
  };
  token_counts: {
    colors: number;
    gradients: number;
    typography: number;
    spacing: number;
    radii: number;
    shadows: number;
    images: number;
    components: number;
  };
}
