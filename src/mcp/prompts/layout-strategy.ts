/**
 * MCP Prompt: layout_strategy
 * Rules for pixel-perfect layout from observed Figma values and variables.
 */

export const LAYOUT_STRATEGY_NAME = 'layout_strategy';
export const LAYOUT_STRATEGY_DESCRIPTION =
  'Rules for pixel-perfect layout from observed Figma values and authoritative variables';

export const LAYOUT_STRATEGY_MESSAGE = `When implementing a layout from a Figma design, follow these steps:

1. FIRST call get_design_context to load observed design values and generated CSS mappings
2. When get_variables is available, call it to resolve authoritative Figma variables, collections, modes, and aliases
3. For each component you need to implement:
   a. Call get_node_info with the component's node ID
   b. Prefer an authoritative variable returned by get_variables when the node is bound to one
   c. Otherwise use the exact observed value or a generated css_variable from the response
4. Treat css_variable fields as generated references to observed values, not proof of a Figma variable binding
5. Use search_token only to find similar observed/generated values; verify substitutions rather than applying them automatically

Value semantics:
- get_variables is authoritative for Figma variables, IDs, collections, modes, aliases, and values
- get_design_tokens and get_css_variables derive values and CSS names from observed node properties
- applied_styles identifies named Figma shared styles; a named style is not a Figma variable
- token_hints contains nearest-value suggestions only; it does not establish designer intent or a variable binding

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
- For solid fills: prefer css_variable when it represents the exact alpha-aware value; otherwise use css_value
- For gradient fills (fill_type: "gradient"): use css_value directly as background property
  - linear-gradient, radial-gradient, conic-gradient are all supported
- For image fills (fill_type: "image"): call export_node_image for the asset, apply:
  - background-size: use scale_mode_css (cover, contain, repeat, or 100% 100%)
  - background-image: url(path-to-exported-image)
- Multi-fill nodes: apply fills in Figma array order (first fill = bottommost layer)

Visual properties:
- Node opacity: apply NodeDetail.opacity as CSS opacity (omitted when 1.0)
- Paint opacity: fills/strokes already combine it with color or gradient-stop alpha; do not multiply NodeDetail.opacity into paint values
- Image fill opacity may require a separate layer so it does not fade unrelated node content
- rotation: apply as transform: rotate({value}deg). null means no rotation
- blend_mode_css: apply as mix-blend-mode when non-null
- overflow: "hidden" → overflow: hidden, "visible" → default

Sizing and positioning:
- layout.sizing_horizontal/sizing_vertical: FILL → width/height: 100%, HUG → auto, FIXED → explicit px
- canvas_x/canvas_y are absoluteBoundingBox coordinates in canvas/global space
- parent_relative_x/parent_relative_y are coordinates in the immediate parent's coordinate space
- x/y are deprecated canvas/global aliases; never use them as parent-relative offsets
- position: "absolute" → manually positioned child; use parent_relative_x/parent_relative_y as left/top
- position: "relative" → child participates in its parent's auto-layout flow; do not apply canvas coordinates as CSS offsets
- constraints.horizontal: STRETCH → width: 100%, CENTER → margin: 0 auto
- min_width/max_width/min_height/max_height: apply directly as CSS min-width, max-width, etc.
  These are critical for responsive behavior — never ignore them

Strokes and borders:
- alignment_css hints: "border" → use border, "box-shadow-inset" → use inset box-shadow, "outline" → use outline
- dash_pattern: non-null → use border-style: dashed with stroke-dasharray equivalent

Effects:
- css_property: "backdrop-filter" → apply as backdrop-filter (background blur)
- css_property: "filter" → apply as filter (layer blur)
- css_property: "box-shadow" → apply as box-shadow

Component instances — IMPORTANT:
- When you encounter a component_info with is_instance: true, the node is a copy of a main component
- main_component_name shows the canonical component name (may differ from instance name)
- main_component_description contains designer notes about usage
- Always call get_node_info on the component_info.component_id to understand the FULL component design
- The main component defines the canonical structure, states, and variants
- Do NOT infer the component structure only from the instance — it may be overridden or simplified
- Check variant_properties for the current variant state

Applied styles — IMPORTANT:
- When applied_styles is present, it shows the Figma shared style name for fills, strokes, text, effects
- Example: applied_styles.text.name = "Heading/H2" → use a matching CSS class
- This reveals the semantic intent behind raw values
- A shared style name is not an authoritative Figma variable or variable binding
- Overrides on top of shared styles should be applied as inline overrides

Token hints — IMPORTANT:
- When token_hints is present, some values don't exactly match the observed/generated value set
- Example: { property: "padding-top", actual_value: 17, nearest_token: "var(--spacing-16)", delta: 1 }
- nearest_token is a generated CSS custom-property suggestion, not an authoritative Figma variable
- Preserve actual_value unless an authoritative variable binding or project convention justifies substitution

Text with mixed styling — IMPORTANT:
- When text_segments has multiple entries, the text has character-level style overrides
- Each segment may have different color_hex, font_family, font_size, font_weight
- Implement by wrapping each segment in a <span> with its specific styles
- This is common for: accented words in headings, linked text, highlighted text

Decorative and background elements — IMPORTANT:
- Elements with position: "absolute" that have no text_content are usually decorative
- These include: background shapes, gradient overlays, pattern images, floating icons
- Verify their exact parent_relative_x/parent_relative_y position; canvas_x/canvas_y are only for global comparison
- Common mistake: ignoring these elements or misplacing them
- Use z-index layering that matches Figma's layer order (first child = bottom layer)`;
