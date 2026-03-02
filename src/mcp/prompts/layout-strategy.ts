/**
 * MCP Prompt: layout_strategy
 * Rules for pixel-perfect layout from Figma design tokens.
 */

export const LAYOUT_STRATEGY_NAME = 'layout_strategy';
export const LAYOUT_STRATEGY_DESCRIPTION =
  'Rules for pixel-perfect layout from Figma design tokens';

export const LAYOUT_STRATEGY_MESSAGE = `When implementing a layout from a Figma design, follow these steps:

1. FIRST call get_design_context to load the design system tokens
2. For each component you need to implement:
   a. Call get_node_info with the component's node ID
   b. Use the css_variable fields in the response directly in your code
   c. Never hardcode color, spacing, typography, or shadow values
3. Always use CSS custom properties: var(--color-xxx), var(--spacing-xxx), etc.
4. If a value doesn't match any token, call search_token to find the closest match
5. If no token exists for a value, explicitly tell the developer

Layout rules:
- Use flexbox/grid to match Figma auto-layout (HORIZONTAL → flex-direction: row, VERTICAL → column)
- Match padding exactly: use var(--spacing-{value}) for each side
- Match gap: use var(--spacing-{value}) for item_spacing
- Match border-radius: use var(--radius-{value})
  - If corner_radii is non-null, use per-corner values: border-radius: {tl}px {tr}px {br}px {bl}px
- Match shadows: use var(--shadow-xxx)
- Match typography: combine var(--font-family-xxx), var(--font-size-xxx), var(--font-weight-xxx)
  - Prefer line_height_em and letter_spacing_em for responsive scaling

Fills and backgrounds:
- For solid fills: use css_variable or value_hex directly as background-color
- For gradient fills (fill_type: "gradient"): use css_value directly as background property
  - linear-gradient, radial-gradient, conic-gradient are all supported
- For image fills (fill_type: "image"): call export_node_image for the asset, apply:
  - background-size: use scale_mode_css (cover, contain, repeat, or 100% 100%)
  - background-image: url(path-to-exported-image)
- Multi-fill nodes: apply fills in Figma array order (first fill = bottommost layer)

Visual properties:
- opacity: apply directly as CSS opacity (omitted when 1.0)
- rotation: apply as transform: rotate({value}deg). null means no rotation
- blend_mode_css: apply as mix-blend-mode when non-null
- overflow: "hidden" → overflow: hidden, "visible" → default

Sizing and positioning:
- layout.sizing_horizontal/sizing_vertical: FILL → width/height: 100%, HUG → auto, FIXED → explicit px
- position: "absolute" → position: absolute with x/y as left/top
- position: "relative" → element participates in auto-layout flow

Strokes and borders:
- alignment_css hints: "border" → use border, "box-shadow-inset" → use inset box-shadow, "outline" → use outline
- dash_pattern: non-null → use border-style: dashed with stroke-dasharray equivalent

Effects:
- css_property: "backdrop-filter" → apply as backdrop-filter (background blur)
- css_property: "filter" → apply as filter (layer blur)
- css_property: "box-shadow" → apply as box-shadow`;
