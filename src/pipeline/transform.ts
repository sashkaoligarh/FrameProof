/**
 * Stage 3: Transform — ParsedNode[] → AllTokens.
 * Orchestrates all extractors to produce the complete token set.
 */

import type { ParsedNode, AllTokens, StyleMeta, ComponentMeta, ComponentSetMeta } from '../types/tokens.js';
import { extractColors } from '../extractors/colors.js';
import { extractGradients } from '../extractors/gradients.js';
import { extractTypography } from '../extractors/typography.js';
import { extractSpacing } from '../extractors/spacing.js';
import { extractRadius } from '../extractors/radius.js';
import { extractShadows } from '../extractors/shadows.js';
import { extractImages } from '../extractors/images.js';
import { extractComponents } from '../extractors/components.js';

/**
 * Extract all design tokens from parsed nodes.
 * Calls each extractor and aggregates results into AllTokens.
 */
export function extractAllTokens(
  nodes: ParsedNode[],
  styles: Record<string, StyleMeta> = {},
  componentsMeta: Record<string, ComponentMeta> = {},
  componentSetsMeta: Record<string, ComponentSetMeta> = {},
): AllTokens {
  return {
    colors: extractColors(nodes, styles),
    gradients: extractGradients(nodes),
    typography: extractTypography(nodes),
    spacing: extractSpacing(nodes),
    radii: extractRadius(nodes),
    shadows: extractShadows(nodes),
    images: extractImages(nodes),
    components: extractComponents(nodes, componentsMeta, componentSetsMeta),
  };
}
