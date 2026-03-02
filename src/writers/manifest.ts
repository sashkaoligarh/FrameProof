/**
 * Manifest writer — generates manifest.json with generation metadata.
 * Token MUST NEVER appear in output (FR-018).
 */

import type { AllTokens, OutputManifest } from '../types/tokens.js';

/**
 * Generate manifest JSON string from tokens and context.
 */
export function generateManifest(
  tokens: AllTokens,
  fileId: string,
  fileName: string,
  nodeCount: number,
  filters: { page?: string; node?: string; includeHidden: boolean },
): string {
  const manifest: OutputManifest = {
    file_id: fileId,
    file_name: fileName,
    generated_at: new Date().toISOString(),
    node_count: nodeCount,
    filters_applied: {
      page: filters.page,
      node: filters.node,
      include_hidden: filters.includeHidden,
    },
    token_counts: {
      colors: tokens.colors.length,
      gradients: tokens.gradients.length,
      typography: tokens.typography.length,
      spacing: tokens.spacing.length,
      radii: tokens.radii.length,
      shadows: tokens.shadows.length,
      images: tokens.images.length,
      components: tokens.components.length,
    },
  };

  return JSON.stringify(manifest, null, 2);
}
