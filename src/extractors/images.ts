/**
 * Image token extractor.
 *
 * Extracts two types of images:
 * 1. IMAGE fills — raster images embedded in nodes (imageRef)
 * 2. Exportable vector nodes — VECTOR, BOOLEAN_OPERATION, LINE, STAR, ELLIPSE,
 *    REGULAR_POLYGON, and COMPONENTs that look like icons (small, vector-only)
 *
 * Returns ImageToken[] for downstream download.
 */

import type { ParsedNode, ImageToken } from '../types/tokens.js';
import { sanitizeNodeId } from '../utils/naming.js';

/** Node types that are inherently vector and good candidates for SVG export. */
const VECTOR_TYPES = new Set([
  'VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'STAR', 'ELLIPSE', 'REGULAR_POLYGON',
]);

/** Max dimension for a node to be considered an "icon" (px). */
const ICON_MAX_SIZE = 128;

/**
 * Extract image tokens from parsed nodes.
 * Finds IMAGE fills and vector nodes suitable for SVG export.
 */
export function extractImages(nodes: ParsedNode[]): ImageToken[] {
  const seen = new Map<string, ImageToken>();

  for (const node of nodes) {
    const raw = node.raw as Record<string, any>;

    // 1. IMAGE fills (raster images)
    const fills: any[] | undefined = raw.fills;
    if (fills) {
      for (const fill of fills) {
        if (fill.type !== 'IMAGE') continue;
        if (fill.visible === false) continue;

        const imageRef: string | undefined = fill.imageRef;
        if (!imageRef) continue;

        if (seen.has(`fill:${imageRef}`)) continue;

        const scaleMode: string = fill.scaleMode ?? 'FILL';
        const baseName = sanitizeNodeId(node.node_id);

        seen.set(`fill:${imageRef}`, {
          node_id: node.node_id,
          name: node.name,
          image_ref: imageRef,
          scale_mode: scaleMode,
          node_type: 'IMAGE_FILL',
          file_name: baseName,
          downloaded: false,
          formats_downloaded: [],
        });
      }
    }

    // 2. Vector nodes — candidates for SVG export
    if (VECTOR_TYPES.has(node.node_type)) {
      const key = `vector:${node.node_id}`;
      if (!seen.has(key)) {
        seen.set(key, {
          node_id: node.node_id,
          name: node.name,
          image_ref: '',
          scale_mode: '',
          node_type: node.node_type,
          file_name: sanitizeNodeId(node.node_id),
          downloaded: false,
          formats_downloaded: [],
        });
      }
    }

    // 3. Small COMPONENT/INSTANCE nodes (likely icons)
    if ((node.node_type === 'COMPONENT' || node.node_type === 'INSTANCE') && raw.absoluteBoundingBox) {
      const bbox = raw.absoluteBoundingBox;
      if (bbox.width <= ICON_MAX_SIZE && bbox.height <= ICON_MAX_SIZE) {
        const key = `icon:${node.node_id}`;
        if (!seen.has(key)) {
          seen.set(key, {
            node_id: node.node_id,
            name: node.name,
            image_ref: '',
            scale_mode: '',
            node_type: 'ICON',
            file_name: sanitizeNodeId(node.node_id),
            downloaded: false,
            formats_downloaded: [],
          });
        }
      }
    }
  }

  return [...seen.values()];
}
