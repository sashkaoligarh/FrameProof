/**
 * MCP Prompt: token_usage_rules
 * Rules for using design tokens correctly in code.
 */

export const TOKEN_USAGE_RULES_NAME = 'token_usage_rules';
export const TOKEN_USAGE_RULES_DESCRIPTION =
  'Rules for using design tokens correctly in code';

export const TOKEN_USAGE_RULES_MESSAGE = `Design token usage rules — ALWAYS follow these:

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
  box-shadow: var(--shadow-drop-1);`;
