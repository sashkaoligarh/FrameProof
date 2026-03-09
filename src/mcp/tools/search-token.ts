/**
 * MCP Tool: search_token
 * Search design tokens by value (hex color, number, font name).
 */

import { z } from 'zod';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { TokenSearchResult, TokenMatch } from '../../types/mcp.js';
import type { AllTokens } from '../../types/tokens.js';
import { resolveParams } from '../utils/normalize-node-id.js';

export const searchTokenSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  query: z.string().describe('Value to search (hex color, number, font name)'),
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
  const category = params.category ?? 'all';
  const query = params.query.trim();

  const matches: TokenMatch[] = [];

  // Detect query type
  const isHex = /^#?[0-9a-fA-F]{3,8}$/.test(query);
  const numericValue = parseFloat(query);
  const isNumber = !isNaN(numericValue) && !isHex;

  if (isHex && (category === 'all' || category === 'color')) {
    matches.push(...searchColors(query, tokens));
  }

  if (isNumber) {
    if (category === 'all' || category === 'spacing') {
      matches.push(...searchSpacing(numericValue, tokens));
    }
    if (category === 'all' || category === 'radius') {
      matches.push(...searchRadius(numericValue, tokens));
    }
    if (category === 'all' || category === 'typography') {
      matches.push(...searchTypographyBySize(numericValue, tokens));
    }
  }

  if (!isHex && !isNumber && (category === 'all' || category === 'typography')) {
    matches.push(...searchTypographyByName(query, tokens));
  }

  // Sort by distance, take top N
  matches.sort((a, b) => a.distance - b.distance);

  return {
    query: params.query,
    matches: matches.slice(0, MAX_RESULTS),
  };
}

// ─── Color Search ───────────────────────────────────────

function searchColors(query: string, tokens: AllTokens): TokenMatch[] {
  const hex = normalizeHex(query);
  const [qr, qg, qb] = hexToRgb(hex);

  return tokens.colors.map((c) => {
    const [cr, cg, cb] = hexToRgb(normalizeHex(c.value_hex));
    const distance = Math.sqrt((qr - cr) ** 2 + (qg - cg) ** 2 + (qb - cb) ** 2);
    return {
      category: 'color',
      name: c.name,
      css_variable: `--color-${c.name}`,
      value: c.value_hex,
      usage_count: c.usage_count,
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

function searchSpacing(value: number, tokens: AllTokens): TokenMatch[] {
  return tokens.spacing.map((s) => ({
    category: 'spacing',
    name: `spacing-${s.value}`,
    css_variable: `--spacing-${s.value}`,
    value: `${s.value}px`,
    usage_count: s.usage_count,
    distance: Math.abs(s.value - value),
  }));
}

// ─── Radius Search ──────────────────────────────────────

function searchRadius(value: number, tokens: AllTokens): TokenMatch[] {
  return tokens.radii.map((r) => ({
    category: 'radius',
    name: `radius-${r.value}`,
    css_variable: `--radius-${r.value}`,
    value: `${r.value}px`,
    usage_count: r.usage_count,
    distance: Math.abs(r.value - value),
  }));
}

// ─── Typography Search ──────────────────────────────────

function searchTypographyBySize(value: number, tokens: AllTokens): TokenMatch[] {
  return tokens.typography.map((t) => ({
    category: 'typography',
    name: t.name,
    css_variable: `--font-size-${t.font_size}`,
    value: `${t.font_size}px`,
    usage_count: t.usage_count,
    distance: Math.abs(t.font_size - value),
  }));
}

function searchTypographyByName(query: string, tokens: AllTokens): TokenMatch[] {
  const q = query.toLowerCase();
  return tokens.typography
    .filter((t) => t.font_family.toLowerCase().includes(q))
    .map((t) => ({
      category: 'typography',
      name: t.name,
      css_variable: `--font-family-${t.font_family.toLowerCase().replace(/\s+/g, '-')}`,
      value: t.font_family,
      usage_count: t.usage_count,
      distance: 0,
    }));
}
