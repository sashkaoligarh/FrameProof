/**
 * MCP Prompt: read_design_strategy
 * How to read and understand a Figma design for implementation.
 */

export const READ_DESIGN_STRATEGY_NAME = 'read_design_strategy';
export const READ_DESIGN_STRATEGY_DESCRIPTION =
  'How to read and understand a Figma design for pixel-perfect implementation';

export const READ_DESIGN_STRATEGY_MESSAGE = `When reading a Figma design for implementation, follow this workflow:

IMPORTANT: All output files (tokens, screenshots, analysis) go to the .figma/ directory.
This directory is gitignored and should never be committed.

## Phase 1: Overview (before writing any code)

1. get_screenshot — take a full-page screenshot for visual reference
2. get_document_structure — understand pages, frames, component counts
3. get_design_tokens with save_to=".figma/tokens.json" — save values generated from observed node properties
4. get_css_variables with save_to=".figma/design-system.css" — generate CSS custom properties from those observed values
   - Import this CSS file only when the project wants these generated references
5. When get_variables is available, call it for authoritative Figma variables, collections, modes, aliases, and IDs
6. get_frame_overview — get a lightweight map of all sections in the page
   - Returns each section's name, type, dimensions, visibility, component refs
   - Shows gap_to_next between siblings (useful for spacing verification)
   - Shows main_component_name for instances (resolved from file metadata)
   - Use this to plan which sections to implement and in what order

## Phase 2: Section-by-section analysis

For large pages (3+ sections), NEVER load all sections at once. Process one section at a time:

1. batch_screenshots — screenshot all sections at once for visual reference
2. For each section:
   a. get_node_info with save_to=".figma/{section_name}.json" — saves full data to file
   b. Read the saved file to implement the section
   c. Move to next section after completing the current one

For small components (1-2 sections), you can use get_node_info without save_to.

## Phase 3: Full-page export (alternative to section-by-section)

For comprehensive analysis, use export_page_analysis:
- Generates a full page analysis as markdown or JSON file
- Includes structure, CSS mappings, and **design notes** with attention points
- Read the file section-by-section using offset/limit parameters
- Design notes highlight: mixed text colors, background images, absolute elements,
  component instances, non-standard values, orphan colors, inconsistent radii, text overflow

## Critical Details Checklist

ALWAYS check these for EVERY section — missing any of these creates visual bugs:

### Value and token semantics
- get_design_tokens reports deduplicated values observed in nodes; it does not prove those values are Figma variables
- get_css_variables and css_variable fields are generated CSS names for observed values
- get_variables is authoritative for actual Figma variables when that tool is available
- Check token_hints on each node — it flags values that differ from the observed/generated value set
- Example: padding-top: 17px with nearest token --spacing-16 (delta: +1)
- nearest_token is a similarity hint, not evidence of a variable binding or designer error
- Preserve the exact observed value unless an authoritative variable or project convention supports replacement

### Applied styles (Figma shared styles)
- Check applied_styles on nodes — shows the Figma shared style name
- Example: { fill: { name: "Primary/Blue" }, text: { name: "Body/Regular" } }
- This tells you the semantic intent — use matching CSS class/variable names
- Named shared styles are distinct from Figma variables; do not infer a variable binding from a style name

### Constraints and sizing — NEW
- Check constraints on nodes — horizontal/vertical positioning constraints
- STRETCH → width: 100% or height: 100%
- CENTER → margin: 0 auto
- Check min_width, max_width, min_height, max_height — critical for responsive behavior
- Nodes with FILL sizing + max_width need max-width in CSS

### Text with mixed colors (partial accents)
- Check text_segments array — if it has multiple entries with different color_hex values,
  the text has mixed coloring (e.g., "Хмарна **платформа**" where "платформа" is blue)
- Implement with <span> tags wrapping each differently-colored segment
- Use the exact color from each segment's color_hex/color_css

### Background images and decorative elements
- Check fills for fill_type: "image" — these are background images
- ALWAYS verify: scale_mode_css (cover/contain/repeat), position, dimensions
- Check for position: "absolute" elements — these are often decorative shapes,
  background patterns, or floating icons. Verify parent_relative_x/parent_relative_y
- canvas_x/canvas_y are global canvas coordinates; deprecated x/y are the same global values, not parent-relative
- Call export_node_image to download the actual image asset

### Component instances — go to main component
- When component_info.is_instance is true, the element is based on a main component
- main_component_name shows the resolved name (e.g., "Button/Primary" vs instance name "Submit")
- main_component_description may contain usage notes from the designer
- Call get_node_info on component_info.component_id to see the FULL component definition
- This reveals the intended design, variants, and interactive states
- Do NOT guess the component structure from the instance alone — always check the main component

### Element presence/absence
- Check visible: false elements — they exist in Figma but should NOT be rendered
- Check NodeDetail.opacity < 1 for node/layer opacity
- Fill/stroke opacity is paint-level and already combined with color or gradient-stop alpha; keep it separate from node opacity
- Count exact children in each section and compare with your implementation
- Missing elements (buttons, icons, dividers, badges) are common implementation errors

### Overflow and clipping
- overflow: "hidden" means content is clipped — ALWAYS set overflow: hidden in CSS
- Children extending beyond parent bounds will be visually cut off
- This is especially important for hero sections with background images

### Spacing and alignment
- layout.primary_axis_align and counter_axis_align control flex alignment
- Check EVERY padding value (top, right, bottom, left) — they may all differ
- item_spacing is the gap between children — match exactly
- position: "absolute" children are manually positioned, including children of non-auto-layout frames
- position: "relative" children participate in the parent's auto-layout flow
- Use parent_relative_x/parent_relative_y only for manual offsets; do not position flow children from canvas coordinates
- Check gap_to_next in frame overview for spacing between sibling sections

### Visual effects
- blend_mode_css → apply as mix-blend-mode
- NodeDetail.opacity → apply as CSS opacity; do not apply it a second time to paint alpha
- rotation → apply as transform: rotate()
- effects with css_property "backdrop-filter" → apply backdrop-filter: blur()

### Gradients
- Use css_value directly from gradient fills — it contains pre-computed CSS
- Do NOT attempt to recreate gradients from raw values

## Images and icons workflow
- Icons: export_node_image with format=svg
- Raster images: export_node_image with format=png and scale=2
- Background images: check scale_mode_css for correct background-size

## Verification
- After implementing each section, compare against the section screenshot
- Check: element count, colors, spacing, font sizes, background positions
- Use get_screenshot for the full page after all sections are complete
- Verify token_hints against authoritative variables or project conventions before substituting the observed value`;
