/**
 * MCP Prompt: token_usage_rules
 * Rules for using design tokens correctly in code.
 */

export const TOKEN_USAGE_RULES_NAME = 'token_usage_rules';
export const TOKEN_USAGE_RULES_DESCRIPTION =
  'Rules for using design tokens correctly in code';

export const TOKEN_USAGE_RULES_MESSAGE = `Design token usage rules — ALWAYS follow these:

Distinguish these sources:
- Authoritative Figma variables: returned by get_variables with collection, mode, alias, and variable IDs
- Observed/generated CSS variables: produced by get_design_tokens/get_css_variables and css_variable fields from node values
- Named styles: applied_styles entries for Figma shared fill, stroke, text, or effect styles; these are not variables
- Token hints: nearest observed/generated values; these are suggestions, not bindings or proof of intent

ALWAYS:
- Call get_variables when available before claiming that a value or name is an authoritative Figma variable
- Prefer an existing project variable when it maps to the authoritative Figma variable or established project convention
- Treat .figma/design-system.css as generated from observed values, not as an export of authoritative Figma variables
- Match exact observed values when no authoritative/project variable applies
- Check token_hints for nearby candidates, but verify before replacing actual_value at any delta
- Preserve semantic shared-style names without presenting them as variable names

Generated observed CSS naming convention:
- Colors: --color-{name} (name from Figma style or auto-generated)
- Font families: --font-family-{name}
- Font sizes: --font-size-{px}
- Font weights: --font-weight-{value}
- Spacing: --spacing-{px}
- Border radius: --radius-{px}
- Shadows: --shadow-{type}-{index}
- These names describe generated CSS custom properties and may not match Figma variable names

Paint alpha:
- Solid fill/stroke css_value and value_hex include color alpha multiplied by paint opacity
- Gradient css_value already multiplies paint opacity into each stop alpha
- NodeDetail.opacity is separate node/layer opacity; do not merge it into generated color variables
- Prefer css_value over a css_variable that does not represent the exact alpha-aware value

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
