/**
 * MCP Tool: search_token
 * Search design tokens by value (hex color, number, font name).
 */

import { z } from 'zod';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { TokenSearchResult, TokenMatch } from '../../types/mcp.js';
import type { AllTokens } from '../../types/tokens.js';
import { resolveParams } from '../utils/normalize-node-id.js';
import {
  allocateCssTokenNames,
  cssCustomProperty,
  type CssTokenNames,
} from '../../utils/css-token-names.js';

export const searchTokenSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  query: z.string().describe('Value to search (hex color, number, font name, shadow name/CSS)'),
  category: z
    .enum(['color', 'typography', 'spacing', 'radius', 'shadow', 'all'])
    .optional()
    .default('all')
    .describe('Token category filter'),
};

export interface SearchTokenParams {
  file_id: string;
  query: string;
  category?: 'color' | 'typography' | 'spacing' | 'radius' | 'shadow' | 'all';
}

const MAX_RESULTS = 5;

export async function handleSearchToken(
  params: SearchTokenParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<TokenSearchResult> {
  const { file_id: fileId } = resolveParams(params.file_id);
  const entry = await cache.getOrFetch(fileId, fetchFn);
  const tokens = entry.tokens;
  const cssTokens = allocateCssTokenNames(tokens);
  const category = params.category ?? 'all';
  const query = params.query.trim();

  const matches: TokenMatch[] = [];

  // Detect query type
  const isHex = /^#?[0-9a-fA-F]{3,8}$/.test(query);
  const numericValue = parseFloat(query);
  const isNumber = !isNaN(numericValue) && !isHex;

  if (isHex && (category === 'all' || category === 'color')) {
    matches.push(...searchColors(query, cssTokens));
  }

  if (isNumber) {
    if (category === 'all' || category === 'spacing') {
      matches.push(...searchSpacing(numericValue, cssTokens));
    }
    if (category === 'all' || category === 'radius') {
      matches.push(...searchRadius(numericValue, cssTokens));
    }
    if (category === 'all' || category === 'typography') {
      matches.push(...searchTypographyByNumber(numericValue, tokens, cssTokens));
    }
  }

  if (!isHex && !isNumber && (category === 'all' || category === 'typography')) {
    matches.push(...searchTypographyByName(query, tokens, cssTokens));
  }

  if (category === 'all' || category === 'shadow') {
    matches.push(...searchShadows(query, cssTokens));
  }

  // Sort by distance, take top N
  matches.sort((a, b) => a.distance - b.distance);

  return {
    query: params.query,
    matches: matches.slice(0, MAX_RESULTS),
  };
}

// ─── Color Search ───────────────────────────────────────

function searchColors(query: string, cssTokens: CssTokenNames): TokenMatch[] {
  const hex = normalizeHex(query);
  const [qr, qg, qb] = hexToRgb(hex);

  return cssTokens.colors.map((entry) => {
    const color = entry.token;
    const [cr, cg, cb] = hexToRgb(normalizeHex(color.value_hex));
    const distance = Math.sqrt((qr - cr) ** 2 + (qg - cg) ** 2 + (qb - cb) ** 2);
    return {
      category: 'color',
      name: color.name,
      css_variable: cssCustomProperty(entry.name),
      value: color.value_hex,
      usage_count: color.usage_count,
      distance: Math.round(distance * 100) / 100,
    };
  });
}

function normalizeHex(hex: string): string {
  let h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return h.slice(0, 6).toLowerCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return [r, g, b];
}

// ─── Spacing Search ─────────────────────────────────────

function searchSpacing(value: number, cssTokens: CssTokenNames): TokenMatch[] {
  return cssTokens.spacing.map((entry) => ({
    category: 'spacing',
    name: entry.name,
    css_variable: cssCustomProperty(entry.name),
    value: `${entry.token.value}px`,
    usage_count: entry.token.usage_count,
    distance: Math.abs(entry.token.value - value),
  }));
}

// ─── Radius Search ──────────────────────────────────────

function searchRadius(value: number, cssTokens: CssTokenNames): TokenMatch[] {
  return cssTokens.radii.map((entry) => ({
    category: 'radius',
    name: entry.name,
    css_variable: cssCustomProperty(entry.name),
    value: `${entry.token.value}px`,
    usage_count: entry.token.usage_count,
    distance: Math.abs(entry.token.value - value),
  }));
}

// ─── Typography Search ──────────────────────────────────

function searchTypographyByNumber(
  value: number,
  tokens: AllTokens,
  cssTokens: CssTokenNames,
): TokenMatch[] {
  return tokens.typography.flatMap((token): TokenMatch[] => {
    const size = cssTokens.fontSizes.find((entry) => entry.value === token.font_size);
    const weight = cssTokens.fontWeights.find((entry) => entry.value === token.font_weight);
    const matches: TokenMatch[] = [];
    if (size) matches.push({
      category: 'typography',
      name: token.name,
      css_variable: cssCustomProperty(size.name),
      value: `${token.font_size}px`,
      usage_count: token.usage_count,
      distance: Math.abs(token.font_size - value),
    });
    if (weight) matches.push({
      category: 'typography',
      name: token.name,
      css_variable: cssCustomProperty(weight.name),
      value: String(token.font_weight),
      usage_count: token.usage_count,
      distance: Math.abs(token.font_weight - value),
    });
    return matches;
  });
}

function searchTypographyByName(
  query: string,
  tokens: AllTokens,
  cssTokens: CssTokenNames,
): TokenMatch[] {
  const q = query.toLowerCase();
  return tokens.typography.flatMap((token): TokenMatch[] => {
    if (!token.font_family.toLowerCase().includes(q)) return [];
    const family = cssTokens.fontFamilies.find((entry) => entry.value === token.font_family);
    return family ? [{
      category: 'typography',
      name: token.name,
      css_variable: cssCustomProperty(family.name),
      value: token.font_family,
      usage_count: token.usage_count,
      distance: 0,
    }] : [];
  });
}

// ─── Shadow Search ──────────────────────────────────────

function searchShadows(query: string, cssTokens: CssTokenNames): TokenMatch[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const variableQuery = normalizedQuery
    .replace(/^var\((--[^)]+)\)$/, '$1')
    .replace(/^--/, '');
  const queryNumbers = extractNumbers(normalizedQuery);

  return cssTokens.shadows.flatMap((entry): TokenMatch[] => {
    const shadow = entry.token;
    const name = normalizeSearchText(shadow.name);
    const css = normalizeSearchText(shadow.css);
    const color = shadow.color_hex.toLowerCase();
    const textMatch = name.includes(normalizedQuery)
      || entry.name.includes(variableQuery)
      || css.includes(normalizedQuery)
      || color === normalizedQuery;

    if (!textMatch && queryNumbers.length === 0) return [];

    return [{
      category: 'shadow',
      name: shadow.name,
      css_variable: cssCustomProperty(entry.name),
      value: shadow.css,
      usage_count: 1,
      distance: textMatch ? 0 : shadowNumericDistance(normalizedQuery, queryNumbers, shadow),
    }];
  });
}

function shadowNumericDistance(
  query: string,
  values: number[],
  shadow: CssTokenNames['shadows'][number]['token'],
): number {
  if (values.length >= 4) {
    const geometry = [shadow.offset_x, shadow.offset_y, shadow.blur, shadow.spread];
    return Math.sqrt(geometry.reduce(
      (sum, component, index) => sum + (component - values[index]) ** 2,
      0,
    ));
  }

  const value = values[0];
  if (query.includes('spread')) return Math.abs(shadow.spread - value);
  if (/offset[-\s_]*x|\bx\b/.test(query)) return Math.abs(shadow.offset_x - value);
  if (/offset[-\s_]*y|\by\b/.test(query)) return Math.abs(shadow.offset_y - value);
  return Math.abs(shadow.blur - value);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractNumbers(value: string): number[] {
  return [...value.matchAll(/-?(?:\d+\.?\d*|\.\d+)/g)]
    .map((match) => Number(match[0]))
    .filter(Number.isFinite);
}
