/**
 * MCP Prompt: read_design_strategy
 * How to read and understand a Figma design for implementation.
 */

export const READ_DESIGN_STRATEGY_NAME = 'read_design_strategy';
export const READ_DESIGN_STRATEGY_DESCRIPTION =
  'How to read and understand a Figma design for implementation';

export const READ_DESIGN_STRATEGY_MESSAGE = `When reading a Figma design for implementation:

1. Start with get_document_structure to understand the file layout
   - Note page names and their purposes
   - Identify top-level frames (they are usually screens/views)
   - Note component count for design system scope

2. Load tokens with get_design_tokens
   - Review the color palette (sorted by usage — most-used colors are primary)
   - Review spacing scale (these are your layout building blocks)
   - Review typography styles (identify heading vs body vs caption patterns)

3. For each screen/component to implement:
   a. Call get_node_info with the frame's node ID
   b. Read the response top-down: root frame → children → nested children
   c. Pay attention to layout.mode (HORIZONTAL/VERTICAL) for flex direction
   d. Use css_variable fields directly — they map to the design system
   e. Check fill_type for each fill: "solid", "gradient", or "image"
   f. Check overflow, opacity, rotation, blend_mode_css for visual fidelity
   g. For large trees, use deduplicate_styles: true to reduce response size

4. For images/icons:
   - Call export_node_image with format=svg for icons
   - Call export_node_image with format=png and scale=2 for raster images

5. When uncertain about a value:
   - Call search_token with the raw value to find the matching CSS variable

6. For visual verification after implementing:
   - Call get_screenshot for the frame to get a reference screenshot
   - Compare your implementation against the exported screenshot
   - The summary field provides structural hints (child count, layout mode, dimensions)`;
