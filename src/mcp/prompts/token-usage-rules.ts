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

Gradient fills:
- When fill_type is "gradient", use css_value directly as background property
- gradient_type indicates the Figma gradient type (LINEAR, RADIAL, ANGULAR, DIAMOND)
- Do not attempt to recreate gradients from stops — use the pre-computed css_value

Image fills:
- When fill_type is "image", call export_node_image to download the asset
- Use scale_mode_css for background-size (cover, contain, repeat, or 100% 100%)
- image_ref is the Figma internal hash — use export_node_image to get the actual file

Blend modes:
- blend_mode_css maps Figma blend modes to CSS mix-blend-mode
- null means default (no blend mode needed)
- LINEAR_BURN → color-burn, LINEAR_DODGE → color-dodge (CSS approximations)

Typography em units:
- Prefer line_height_em over line_height for responsive designs
- Prefer letter_spacing_em over letter_spacing for proportional spacing
- "normal" means auto/unset line-height

Example of correct usage:
  background-color: var(--color-brand-primary);
  background: linear-gradient(180deg, rgba(255, 0, 0, 1) 0%, rgba(0, 0, 255, 1) 100%);
  padding: var(--spacing-16);
  border-radius: var(--radius-8);
  font-family: var(--font-family-inter);
  font-size: var(--font-size-14);
  line-height: 1.5em;
  letter-spacing: 0.05em;
  box-shadow: var(--shadow-drop-1);
  mix-blend-mode: multiply;
  opacity: 0.8;
  backdrop-filter: blur(8px);`;
