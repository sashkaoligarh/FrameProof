import * as fs from 'node:fs';
import * as path from 'node:path';
import { downloadImage, fetchFigmaImages } from '../api/client.js';
import { TokenCache, type FetchResult } from '../mcp/cache.js';
import { handleGetNodeInfo } from '../mcp/tools/get-node-info.js';
import { handleGetScreenshot } from '../mcp/tools/get-screenshot.js';
import { fetchAndParse, parseFileIdOrUrl } from '../pipeline/fetch.js';
import { parseDocumentTree } from '../pipeline/parse.js';
import { extractAllTokens } from '../pipeline/transform.js';
import type { ParseContext } from '../types/tokens.js';
import { resolveParams } from '../mcp/utils/normalize-node-id.js';

export interface FigmaReferenceResult {
  kind: 'figma-url' | 'image-file';
  source: string;
  imagePath: string;
  nodePath?: string;
  nodeId?: string;
}

export async function exportFigmaReference(
  figmaUrl: string,
  outputDir: string,
  scale = 1,
): Promise<FigmaReferenceResult> {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error('FIGMA_TOKEN is required for Figma reference extraction.');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const cache = new TokenCache();
  const fetchFigmaData = createFigmaFetch(token);
  const screenshot = await handleGetScreenshot(
    { file_id: figmaUrl, output_dir: outputDir, scale, compress: false },
    cache,
    fetchFigmaData,
    fetchFigmaImages,
    downloadImage,
  );

  const { node_id: nodeId } = resolveParams(figmaUrl);
  let nodePath: string | undefined;
  if (nodeId) {
    nodePath = path.join(outputDir, 'node.json');
    await handleGetNodeInfo(
      { file_id: figmaUrl, node_id: nodeId, depth: 5, deduplicate_styles: true, save_to: nodePath },
      cache,
      fetchFigmaData,
    );
  }

  return {
    kind: 'figma-url',
    source: figmaUrl,
    imagePath: screenshot.file_path,
    nodePath,
    nodeId,
  };
}

export function copyImageReference(imagePath: string, outputDir: string): FigmaReferenceResult {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Reference image does not exist: ${imagePath}`);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const targetPath = path.join(outputDir, `reference${path.extname(imagePath) || '.png'}`);
  fs.copyFileSync(imagePath, targetPath);
  return { kind: 'image-file', source: imagePath, imagePath: targetPath };
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
