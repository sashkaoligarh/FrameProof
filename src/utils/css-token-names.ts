import type {
  AllTokens,
  ColorToken,
  RadiusToken,
  ShadowToken,
  SpacingToken,
} from '../types/tokens.js';
import { sanitizeCssIdentifier } from './naming.js';

export interface NamedCssToken<T> {
  token: T;
  name: string;
}

export interface NamedCssValue<T> {
  value: T;
  name: string;
}

export interface CssTokenNames {
  colors: NamedCssToken<ColorToken>[];
  fontFamilies: NamedCssValue<string>[];
  fontSizes: NamedCssValue<number>[];
  fontWeights: NamedCssValue<number>[];
  spacing: NamedCssToken<SpacingToken>[];
  radii: NamedCssToken<RadiusToken>[];
  shadows: NamedCssToken<ShadowToken>[];
}

/** Allocate every generated custom-property name in CSS declaration order. */
export function allocateCssTokenNames(tokens: AllTokens): CssTokenNames {
  const usedNames = new Set<string>();

  function allocate(candidate: string): string {
    const base = sanitizeCssIdentifier(candidate);
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${base}-${suffix}`;
      suffix++;
    }
    usedNames.add(name);
    return name;
  }

  const colors = tokens.colors.map((token) => ({
    token,
    name: allocate(`color-${token.name}`),
  }));

  const families = new Set(tokens.typography.map((token) => token.font_family));
  const fontFamilies = [...families].map((value) => ({
    value,
    name: allocate(`font-family-${value}`),
  }));

  const sizes = new Set(tokens.typography.map((token) => token.font_size));
  const fontSizes = [...sizes].sort((a, b) => a - b).map((value) => ({
    value,
    name: allocate(`font-size-${value}`),
  }));

  const weights = new Set(tokens.typography.map((token) => token.font_weight));
  const fontWeights = [...weights].sort((a, b) => a - b).map((value) => ({
    value,
    name: allocate(`font-weight-${value}`),
  }));

  const spacing = tokens.spacing.map((token) => ({
    token,
    name: allocate(`spacing-${token.value}`),
  }));

  const radiusCounts = new Map<number, number>();
  for (const token of tokens.radii) {
    radiusCounts.set(token.value, (radiusCounts.get(token.value) ?? 0) + 1);
  }
  const radii = tokens.radii.map((token) => {
    const qualifier = (radiusCounts.get(token.value) ?? 0) > 1
      ? `-${token.is_per_corner ? 'per-corner' : 'uniform'}`
      : '';
    return {
      token,
      name: allocate(`radius-${token.value}${qualifier}`),
    };
  });

  const shadows = tokens.shadows.map((token) => ({
    token,
    name: allocate(token.name),
  }));

  return { colors, fontFamilies, fontSizes, fontWeights, spacing, radii, shadows };
}

export function cssVariableReference(name: string): string {
  return `var(--${name})`;
}

export function cssCustomProperty(name: string): string {
  return `--${name}`;
}
