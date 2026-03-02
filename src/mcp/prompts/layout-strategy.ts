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
- Match shadows: use var(--shadow-xxx)
- Match typography: combine var(--font-family-xxx), var(--font-size-xxx), var(--font-weight-xxx)`;
