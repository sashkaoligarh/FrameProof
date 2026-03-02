# MCP Prompts Contract

## Prompt: layout_strategy

**Name**: `layout_strategy`
**Description**: Rules for pixel-perfect layout from Figma design tokens
**Arguments**: none

**Message** (role: assistant):
```
When implementing a layout from a Figma design, follow these steps:

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
- Match shadows: use var(--shadow-xxx)
- Match typography: combine var(--font-family-xxx), var(--font-size-xxx), var(--font-weight-xxx)
```

---

## Prompt: read_design_strategy

**Name**: `read_design_strategy`
**Description**: How to read and understand a Figma design for implementation
**Arguments**: none

**Message** (role: assistant):
```
When reading a Figma design for implementation:

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

4. For images/icons:
   - Call export_node_image with format=svg for icons
   - Call export_node_image with format=png and scale=2 for raster images

5. When uncertain about a value:
   - Call search_token with the raw value to find the matching CSS variable
```

---

## Prompt: token_usage_rules

**Name**: `token_usage_rules`
**Description**: Rules for using design tokens correctly in code
**Arguments**: none

**Message** (role: assistant):
```
Design token usage rules — ALWAYS follow these:

NEVER hardcode:
- Colors (use var(--color-xxx))
- Font sizes (use var(--font-size-xxx))
- Font families (use var(--font-family-xxx))
- Font weights (use var(--font-weight-xxx))
- Spacing/padding/gap (use var(--spacing-xxx))
- Border radius (use var(--radius-xxx))
- Shadows (use var(--shadow-xxx))

ALWAYS:
- Import design-system.css in your project
- Use CSS custom properties from the design system
- Match Figma values exactly (no approximation)
- If a value has no matching token, report it to the developer

Token naming convention:
- Colors: --color-{name} (name from Figma style or auto-generated)
- Font families: --font-family-{name}
- Font sizes: --font-size-{px}
- Font weights: --font-weight-{value}
- Spacing: --spacing-{px}
- Border radius: --radius-{px}
- Shadows: --shadow-{type}-{index}

Example of correct usage:
  background-color: var(--color-brand-primary);
  padding: var(--spacing-16);
  border-radius: var(--radius-8);
  font-family: var(--font-family-inter);
  font-size: var(--font-size-14);
  box-shadow: var(--shadow-drop-1);
```
