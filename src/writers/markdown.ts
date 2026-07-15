/**
 * Markdown writer — generates CONTEXT.md for AI consumption.
 * Provides a structured overview of the design system tokens
 * optimized for LLM context windows.
 */

import type { AllTokens } from '../types/tokens.js';
import { allocateCssTokenNames } from '../utils/css-token-names.js';

/**
 * Generate a Markdown string summarizing all design tokens.
 * Intended for CONTEXT.md — an AI-friendly overview of the design system.
 */
export function generateMarkdown(
  tokens: AllTokens,
  fileId: string,
  fileName: string,
): string {
  const lines: string[] = [];
  const cssNames = allocateCssTokenNames(tokens);
  const colorNames = new Map(cssNames.colors.map(({ token, name }) => [token, name]));
  const spacingNames = new Map(cssNames.spacing.map(({ token, name }) => [token, name]));
  const radiusNames = new Map(cssNames.radii.map(({ token, name }) => [token, name]));
  const shadowNames = new Map(cssNames.shadows.map(({ token, name }) => [token, name]));

  // ----- Source -----
  lines.push('# Design System Tokens');
  lines.push('');
  lines.push('## Source');
  lines.push('');
  lines.push(`- **File ID**: ${fileId}`);
  lines.push(`- **File Name**: ${fileName}`);
  lines.push(`- **Generated**: ${new Date().toISOString()}`);
  lines.push('');

  // ----- How to use -----
  lines.push('## How to use');
  lines.push('');
  lines.push('Import the CSS file in your project:');
  lines.push('');
  lines.push('```html');
  lines.push('<link rel="stylesheet" href="design-system.css">');
  lines.push('```');
  lines.push('');
  lines.push('Rules:');
  lines.push('');
  lines.push('- Never hardcode color, spacing, or typography values');
  lines.push('- Always use CSS variables from design-system.css');
  lines.push('- Use semantic variable names (e.g. `var(--color-brand-primary)`)');
  lines.push('');

  // ----- Colors -----
  lines.push('## Colors');
  lines.push('');
  if (tokens.colors.length > 0) {
    const sorted = [...tokens.colors].sort((a, b) => b.usage_count - a.usage_count);
    lines.push('| CSS Variable | Hex | Usage Count | Node ID |');
    lines.push('| --- | --- | --- | --- |');
    for (const c of sorted) {
      lines.push(`| \`--${colorNames.get(c)}\` | \`${c.value_hex}\` | ${c.usage_count} | ${c.node_id} |`);
    }
  } else {
    lines.push('No color tokens extracted.');
  }
  lines.push('');

  // ----- Typography -----
  lines.push('## Typography');
  lines.push('');
  if (tokens.typography.length > 0) {
    const sorted = [...tokens.typography].sort((a, b) => b.usage_count - a.usage_count);
    lines.push('| Family | Size | Weight | Line Height |');
    lines.push('| --- | --- | --- | --- |');
    for (const t of sorted) {
      lines.push(`| ${t.font_family} | ${t.font_size}px | ${t.font_weight} | ${t.line_height} |`);
    }
  } else {
    lines.push('No typography tokens extracted.');
  }
  lines.push('');

  // ----- Spacing -----
  lines.push('## Spacing');
  lines.push('');
  if (tokens.spacing.length > 0) {
    const sorted = [...tokens.spacing].sort((a, b) => a.value - b.value);
    for (const s of sorted) {
      lines.push(`- \`--${spacingNames.get(s)}\`: ${s.value}px`);
    }
  } else {
    lines.push('No spacing tokens extracted.');
  }
  lines.push('');

  // ----- Border Radius -----
  lines.push('## Border Radius');
  lines.push('');
  if (tokens.radii.length > 0) {
    const sorted = [...tokens.radii].sort((a, b) => a.value - b.value);
    for (const r of sorted) {
      lines.push(`- \`--${radiusNames.get(r)}\`: ${r.value}px`);
    }
  } else {
    lines.push('No border radius tokens extracted.');
  }
  lines.push('');

  // ----- Shadows -----
  lines.push('## Shadows');
  lines.push('');
  if (tokens.shadows.length > 0) {
    lines.push('| Name | CSS Value |');
    lines.push('| --- | --- |');
    for (const s of tokens.shadows) {
      lines.push(`| \`--${shadowNames.get(s)}\` | \`${s.css}\` |`);
    }
  } else {
    lines.push('No shadow tokens extracted.');
  }
  lines.push('');

  // ----- Components -----
  if (tokens.components.length > 0) {
    lines.push('## Components');
    lines.push('');
    lines.push('| Name | Node ID | Dimensions | Layout |');
    lines.push('| --- | --- | --- | --- |');
    for (const comp of tokens.components) {
      const dimensions = `${comp.width}x${comp.height}`;
      const layout = comp.layout_mode ?? 'NONE';
      lines.push(`| ${comp.name} | ${comp.node_id} | ${dimensions} | ${layout} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
