/**
 * Stage 4: Output — writes all generated files to the output directory.
 * Calls all writers and creates directory structure via fs.promises.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AllTokens, ParseContext, FigmaFile } from '../types/tokens.js';
import { generateCSS } from '../writers/css.js';
import { generateJSON, generateComponentsJSON } from '../writers/json.js';
import { generateManifest } from '../writers/manifest.js';
import { generateMarkdown } from '../writers/markdown.js';
import { downloadImages } from './images.js';

export interface OutputResult {
  files_written: string[];
  output_dir: string;
}

/**
 * Write all output files based on format selection.
 */
export async function writeOutput(
  tokens: AllTokens,
  file: FigmaFile,
  ctx: ParseContext,
  nodeCount: number,
): Promise<OutputResult> {
  const outDir = ctx.output_dir;
  await mkdir(outDir, { recursive: true });

  const filesWritten: string[] = [];
  const format = ctx.format;

  // JSON output (DTCG format)
  if (format === 'all' || format === 'json') {
    const jsonFiles = generateJSON(tokens);
    for (const [filename, content] of Object.entries(jsonFiles)) {
      const filePath = join(outDir, filename);
      await writeFile(filePath, content, 'utf-8');
      filesWritten.push(filePath);
    }

    // Components JSON (non-DTCG)
    if (tokens.components.length > 0) {
      const compPath = join(outDir, 'components.json');
      await writeFile(compPath, generateComponentsJSON(tokens.components), 'utf-8');
      filesWritten.push(compPath);
    }
  }

  // CSS output
  if (format === 'all' || format === 'css') {
    const cssPath = join(outDir, 'design-system.css');
    await writeFile(cssPath, generateCSS(tokens, file.file_id), 'utf-8');
    filesWritten.push(cssPath);
  }

  // CONTEXT.md (AI-optimized markdown)
  if (format === 'all' || format === 'context') {
    const contextPath = join(outDir, 'CONTEXT.md');
    await writeFile(contextPath, generateMarkdown(tokens, file.file_id, file.name), 'utf-8');
    filesWritten.push(contextPath);
  }

  // Manifest (always written)
  const manifestPath = join(outDir, 'manifest.json');
  const filters = {
    page: ctx.page_filter,
    node: ctx.node_filter,
    includeHidden: ctx.include_hidden,
  };
  await writeFile(
    manifestPath,
    generateManifest(tokens, file.file_id, file.name, nodeCount, filters),
    'utf-8',
  );
  filesWritten.push(manifestPath);

  // Download images if requested
  if (ctx.export_images && tokens.images.length > 0) {
    const imgResult = await downloadImages(tokens.images, ctx);
    filesWritten.push(...imgResult.files);
  }

  return {
    files_written: filesWritten,
    output_dir: outDir,
  };
}
