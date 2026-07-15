/**
 * W3C DTCG JSON writer (FR-008).
 * Generates separate JSON files for each token category.
 */

import type {
  AllTokens,
  ColorToken,
  GradientToken,
  TypographyToken,
  SpacingToken,
  RadiusToken,
  ShadowToken,
  ComponentInfo,
} from '../types/tokens.js';

/**
 * Generate DTCG JSON files from tokens.
 * Returns a map of filename → JSON string.
 */
export function generateJSON(tokens: AllTokens): Record<string, string> {
  const files: Record<string, string> = {};

  files['colors.json'] = JSON.stringify(buildColorsDTCG(tokens.colors), null, 2);
  files['typography.json'] = JSON.stringify(buildTypographyDTCG(tokens.typography), null, 2);
  files['spacing.json'] = JSON.stringify(buildSpacingDTCG(tokens.spacing), null, 2);
  files['border-radius.json'] = JSON.stringify(buildRadiusDTCG(tokens.radii), null, 2);
  files['shadows.json'] = JSON.stringify(buildShadowsDTCG(tokens.shadows), null, 2);
  files['gradients.json'] = JSON.stringify(buildGradientsDTCG(tokens.gradients), null, 2);

  return files;
}

/**
 * Generate components.json (not DTCG — custom structure for components).
 */
export function generateComponentsJSON(components: ComponentInfo[]): string {
  return JSON.stringify(components, null, 2);
}

function tokenRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

function setToken(
  result: Record<string, unknown>,
  preferredKey: string,
  value: unknown,
): void {
  const base = preferredKey || 'unnamed';
  let key = base;
  let suffix = 2;
  while (Object.hasOwn(result, key)) {
    key = `${base}-${suffix}`;
    suffix++;
  }
  result[key] = value;
}

function buildColorsDTCG(colors: ColorToken[]): Record<string, unknown> {
  const result = tokenRecord();
  for (const color of colors) {
    setToken(result, color.name, {
      $type: 'color',
      $value: color.value_hex,
      $extensions: {
        'figma-scaler': {
          node_id: color.node_id,
          usage_count: color.usage_count,
          rgba: color.value_rgba,
        },
      },
    });
  }
  return result;
}

function buildTypographyDTCG(tokens: TypographyToken[]): Record<string, unknown> {
  const result = tokenRecord();
  for (const t of tokens) {
    setToken(result, t.name, {
      $type: 'typography',
      $value: {
        font_family: t.font_family,
        font_size: `${t.font_size}px`,
        font_weight: t.font_weight,
        line_height: t.line_height,
        letter_spacing: `${t.letter_spacing}px`,
      },
      $extensions: {
        'figma-scaler': {
          node_id: t.node_id,
          usage_count: t.usage_count,
          font_style: t.font_style,
          text_case: t.text_case,
          text_decoration: t.text_decoration,
          sample_text: t.sample_text,
        },
      },
    });
  }
  return result;
}

function buildSpacingDTCG(tokens: SpacingToken[]): Record<string, unknown> {
  const result = tokenRecord();
  for (const s of tokens) {
    setToken(result, `spacing-${s.value}`, {
      $type: 'dimension',
      $value: `${s.value}px`,
      $extensions: {
        'figma-scaler': {
          source: s.source,
          usage_count: s.usage_count,
        },
      },
    });
  }
  return result;
}

function buildRadiusDTCG(tokens: RadiusToken[]): Record<string, unknown> {
  const result = tokenRecord();
  const radiusCounts = new Map<number, number>();
  for (const radius of tokens) {
    radiusCounts.set(radius.value, (radiusCounts.get(radius.value) ?? 0) + 1);
  }
  for (const r of tokens) {
    const qualifier = (radiusCounts.get(r.value) ?? 0) > 1
      ? `-${r.is_per_corner ? 'per-corner' : 'uniform'}`
      : '';
    setToken(result, `radius-${r.value}${qualifier}`, {
      $type: 'dimension',
      $value: `${r.value}px`,
      $extensions: {
        'figma-scaler': {
          is_per_corner: r.is_per_corner,
          usage_count: r.usage_count,
        },
      },
    });
  }
  return result;
}

function buildShadowsDTCG(tokens: ShadowToken[]): Record<string, unknown> {
  const result = tokenRecord();
  for (const s of tokens) {
    setToken(result, s.name, {
      $type: 'shadow',
      $value: {
        offset_x: `${s.offset_x}px`,
        offset_y: `${s.offset_y}px`,
        blur: `${s.blur}px`,
        spread: `${s.spread}px`,
        color: s.color_hex,
      },
      $extensions: {
        'figma-scaler': {
          node_id: s.node_id,
          shadow_type: s.shadow_type,
          css: s.css,
        },
      },
    });
  }
  return result;
}

function buildGradientsDTCG(tokens: GradientToken[]): Record<string, unknown> {
  const result = tokenRecord();
  for (const g of tokens) {
    setToken(result, g.name, {
      $type: 'gradient',
      $value: {
        type: g.gradient_type,
        stops: g.stops.map((s) => ({
          position: s.position,
          color: s.color_hex,
        })),
      },
      $extensions: {
        'figma-scaler': {
          node_id: g.node_id,
          handle_positions: g.handle_positions,
          stops_rgba: g.stops.map((s) => s.color_rgba),
        },
      },
    });
  }
  return result;
}
