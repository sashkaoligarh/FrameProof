import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  downloadImage,
  fetchFigmaImages,
  type ImageExportOptions,
} from '../api/client.js';
import { TokenCache, type FetchResult } from '../mcp/cache.js';
import { mapNodeToDetail } from '../mcp/mappers/css-mapper.js';
import { deduplicateStyles } from '../mcp/utils/style-dedup.js';
import { collapseSvgGroups } from '../mcp/utils/svg-collapse.js';
import { fetchAndParse, parseFileIdOrUrl } from '../pipeline/fetch.js';
import { parseDocumentTree } from '../pipeline/parse.js';
import { extractAllTokens } from '../pipeline/transform.js';
import type { ParseContext } from '../types/tokens.js';
import { resolveParams } from '../mcp/utils/normalize-node-id.js';
import { assertValidPng } from './image.js';

export interface FigmaReferenceResult {
  kind: 'figma-url' | 'image-file';
  source: string;
  imagePath: string;
  nodePath?: string;
  nodeId?: string;
}

export interface FigmaReferenceSession {
  cache: TokenCache;
  fetchFigmaData: ReturnType<typeof createFigmaFetch>;
  fetchImages: (
    fileId: string,
    token: string,
    nodeIds: string[],
    options?: ImageExportOptions,
  ) => Promise<Record<string, string | null>>;
  download: (imageUrl: string) => Promise<ArrayBuffer>;
}

export async function exportFigmaReference(
  figmaUrl: string,
  outputDir: string,
  scale = 1,
  session?: FigmaReferenceSession,
): Promise<FigmaReferenceResult> {
  const { file_id: fileId, node_id: nodeId } = resolveParams(figmaUrl);
  if (!nodeId) {
    throw new Error('A Figma node ID is required for visual reference extraction. Provide node_id or a Figma URL containing ?node-id=.');
  }
  if (!Number.isFinite(scale) || scale < 1 || scale > 4) {
    throw new RangeError('Figma reference scale must be between 1 and 4.');
  }

  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error('FIGMA_TOKEN is required for Figma reference extraction.');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const activeSession = session ?? createFigmaReferenceSession();
  const entry = await activeSession.cache.getOrFetch(fileId, activeSession.fetchFigmaData);
  const node = entry.nodes.find((candidate) => candidate.node_id === nodeId);
  if (!node) {
    throw new Error(`Node "${nodeId}" not found in Figma file "${fileId}".`);
  }

  const imageUrls = await activeSession.fetchImages(fileId, token, [nodeId], { format: 'png', scale });
  const imageUrl = imageUrls[nodeId];
  if (!imageUrl) {
    throw new Error(`Figma API returned no image URL for node "${nodeId}".`);
  }
  const imagePath = path.join(outputDir, 'reference.png');
  fs.writeFileSync(imagePath, new Uint8Array(await activeSession.download(imageUrl)));
  assertValidPng(imagePath, 'Figma reference image');

  const detail = collapseSvgGroups(mapNodeToDetail(
    node.raw,
    entry.tokens,
    5,
    { styles: entry.file.styles, components: entry.file.components },
  ));
  const nodePath = path.join(outputDir, 'node.json');
  fs.writeFileSync(nodePath, JSON.stringify(deduplicateStyles(detail), null, 2), 'utf8');

  return {
    kind: 'figma-url',
    source: figmaUrl,
    imagePath,
    nodePath,
    nodeId,
  };
}

export function copyImageReference(imagePath: string, outputDir: string): FigmaReferenceResult {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Reference image does not exist: ${imagePath}`);
  }
  assertValidPng(imagePath, 'Reference image');
  fs.mkdirSync(outputDir, { recursive: true });
  const targetPath = path.join(outputDir, 'reference.png');
  fs.copyFileSync(imagePath, targetPath);
  return { kind: 'image-file', source: imagePath, imagePath: targetPath };
}

export function createFigmaReferenceSession(): FigmaReferenceSession {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error('FIGMA_TOKEN is required for Figma reference extraction.');
  return {
    cache: new TokenCache(),
    fetchFigmaData: createFigmaFetch(token),
    fetchImages: fetchFigmaImages,
    download: downloadImage,
  };
}

export function createFigmaFetch(token: string) {
  return async (fileId: string): Promise<FetchResult> => {
    const resolvedId = parseFileIdOrUrl(fileId);
    const ctx: ParseContext = {
      file_id: resolvedId,
      token,
      output_dir: '',
      include_hidden: true,
      format: 'all',
      export_images: false,
      image_formats: [],
      image_scale: 1,
      compress: false,
    };

    const file = await fetchAndParse(ctx);
    const nodes = parseDocumentTree(file.document, { includeHidden: true });
    const tokens = extractAllTokens(nodes, file.styles, file.components, file.component_sets);
    return { file, nodes, tokens };
  };
}
