import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenCache } from '../../../src/mcp/cache.js';
import {
  copyImageReference,
  exportFigmaReference,
  type FigmaReferenceSession,
} from '../../../src/visual/figma-reference.js';
import type { AllTokens, FigmaFile } from '../../../src/types/tokens.js';

const temporaryDirs: string[] = [];
const previousFigmaToken = process.env.FIGMA_TOKEN;
const previousOutputRoot = process.env.FRAMEPROOF_OUTPUT_ROOT;

afterEach(() => {
  if (previousFigmaToken === undefined) delete process.env.FIGMA_TOKEN;
  else process.env.FIGMA_TOKEN = previousFigmaToken;
  if (previousOutputRoot === undefined) delete process.env.FRAMEPROOF_OUTPUT_ROOT;
  else process.env.FRAMEPROOF_OUTPUT_ROOT = previousOutputRoot;
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('visual reference files', () => {
  it('accepts PNG bytes regardless of the source extension', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-reference-'));
    const sourcePath = path.join(dir, 'reference.bin');
    const outputDir = path.join(dir, 'output');
    writePng(sourcePath, 2, 3);

    const result = copyImageReference(sourcePath, outputDir);

    expect(result.imagePath).toBe(path.join(outputDir, 'reference.png'));
    expect(fs.existsSync(result.imagePath)).toBe(true);
  });

  it('rejects a non-PNG reference with an actionable error', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-reference-'));
    const sourcePath = path.join(dir, 'reference.jpg');
    fs.writeFileSync(sourcePath, Buffer.from([0xff, 0xd8, 0xff, 0xdb]));

    expect(() => copyImageReference(sourcePath, path.join(dir, 'output')))
      .toThrow(`Reference image must be a PNG file: ${sourcePath}`);
  });

  it('rejects malformed PNG bytes with the source path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-reference-'));
    const sourcePath = path.join(dir, 'broken.png');
    fs.writeFileSync(sourcePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    expect(() => copyImageReference(sourcePath, path.join(dir, 'output')))
      .toThrow(new RegExp(`Reference image is not a valid PNG: ${escapeRegex(sourcePath)}`));
  });

  it('exports Figma image and node artifacts directly into the gate directory outside the MCP output root', async () => {
    const sandboxRoot = temporaryDir('frameproof-sandbox-');
    const gateRoot = temporaryDir('frameproof-standalone-gate-');
    const outputDir = path.join(gateRoot, 'run', 'desktop', 'figma');
    process.env.FIGMA_TOKEN = 'test-token';
    process.env.FRAMEPROOF_OUTPUT_ROOT = sandboxRoot;

    const rawNode = {
      id: '1:2',
      name: 'Desktop reference',
      type: 'FRAME',
      visible: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 20 },
      children: [],
    };
    const renderedPng = pngBuffer(1920, 20);
    const fetchFigmaData = vi.fn().mockResolvedValue({
      file: {
        file_id: 'file1',
        name: 'Fixture',
        last_modified: '2026-01-01',
        version: '1',
        document: rawNode as FigmaFile['document'],
        components: {},
        component_sets: {},
        styles: {},
      },
      nodes: [{
        node_id: '1:2',
        node_type: 'FRAME',
        name: 'Desktop reference',
        parent_id: null,
        depth: 0,
        raw: rawNode,
      }],
      tokens: emptyTokens(),
    });
    const fetchImages = vi.fn().mockResolvedValue({ '1:2': 'https://images.test/reference.png' });
    const download = vi.fn().mockResolvedValue(toArrayBuffer(renderedPng));
    const session: FigmaReferenceSession = {
      cache: new TokenCache(),
      fetchFigmaData,
      fetchImages,
      download,
    };

    const result = await exportFigmaReference(
      'https://www.figma.com/design/file1/Fixture?node-id=1-2',
      outputDir,
      1,
      session,
    );

    expect(result).toMatchObject({
      imagePath: path.join(outputDir, 'reference.png'),
      nodePath: path.join(outputDir, 'node.json'),
      nodeId: '1:2',
    });
    expect(PNG.sync.read(fs.readFileSync(result.imagePath))).toMatchObject({ width: 1920, height: 20 });
    expect(JSON.parse(fs.readFileSync(result.nodePath!, 'utf8'))).toMatchObject({ node_id: '1:2' });
    expect(fetchImages).toHaveBeenCalledWith('file1', 'test-token', ['1:2'], { format: 'png', scale: 1 });
    expect(fs.readdirSync(sandboxRoot)).toEqual([]);
  });

  it('requires a node ID before fetching or writing a Figma reference', async () => {
    process.env.FIGMA_TOKEN = 'test-token';
    const outputDir = path.join(temporaryDir('frameproof-reference-'), 'output');

    await expect(exportFigmaReference(
      'https://www.figma.com/design/file-1/Fixture',
      outputDir,
    )).rejects.toThrow('A Figma node ID is required');
    expect(fs.existsSync(outputDir)).toBe(false);
  });
});

function writePng(filePath: string, width: number, height: number): void {
  fs.writeFileSync(filePath, pngBuffer(width, height));
}

function pngBuffer(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return PNG.sync.write(png);
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function temporaryDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirs.push(dir);
  return dir;
}

function emptyTokens(): AllTokens {
  return {
    colors: [],
    gradients: [],
    typography: [],
    spacing: [],
    radii: [],
    shadows: [],
    images: [],
    components: [],
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
