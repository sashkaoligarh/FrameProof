/**
 * Utilities for normalizing Figma identifiers from various input formats.
 */

/**
 * Normalize a Figma node ID.
 * Figma URLs use dashes (e.g., "8427-36170") but the API uses colons ("8427:36170").
 * This function accepts both formats and always returns the colon format.
 */
export function normalizeNodeId(nodeId: string): string {
  // If it already contains a colon, return as-is
  if (nodeId.includes(':')) return nodeId;
  // Convert first dash to colon (node IDs are "number-number")
  return nodeId.replace('-', ':');
}

/**
 * Parse a full Figma URL and extract file_id and optional node_id.
 * Supports:
 *   - https://www.figma.com/design/<fileId>/Name?node-id=123-456&m=dev
 *   - https://www.figma.com/file/<fileId>/Name?node-id=123-456
 *   - Raw file ID string
 *
 * Returns { file_id, node_id } where node_id is normalized (colon format) or undefined.
 */
export function parseFigmaUrl(input: string): { file_id: string; node_id?: string } {
  // Try URL pattern
  const urlMatch = input.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (urlMatch) {
    const fileId = urlMatch[1];

    // Extract node-id from query params
    const nodeIdMatch = input.match(/[?&]node-id=([^&]+)/);
    if (nodeIdMatch) {
      const rawNodeId = decodeURIComponent(nodeIdMatch[1]);
      return { file_id: fileId, node_id: normalizeNodeId(rawNodeId) };
    }

    return { file_id: fileId };
  }

  // Not a URL — return as-is (raw file ID)
  return { file_id: input };
}

/**
 * Resolve file_id and node_id from tool params.
 * Handles cases where:
 *   - file_id is a full Figma URL with node-id in query params
 *   - node_id is in dash format and needs colon normalization
 *   - node_id is extracted from URL when not explicitly provided
 *
 * @param fileIdOrUrl - Raw file_id param (may be URL)
 * @param explicitNodeId - Explicit node_id param (takes priority)
 * @returns { file_id, node_id } both normalized
 */
export function resolveParams(
  fileIdOrUrl: string,
  explicitNodeId?: string,
): { file_id: string; node_id: string | undefined } {
  const parsed = parseFigmaUrl(fileIdOrUrl);

  // Explicit node_id takes priority over URL-extracted one
  const nodeId = explicitNodeId
    ? normalizeNodeId(explicitNodeId)
    : parsed.node_id;

  return { file_id: parsed.file_id, node_id: nodeId };
}
