import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import type { ImageSize } from './types.js';

export interface PngRmseResult {
  status: 'ok' | 'missing-image' | 'size-mismatch';
  normalized: number | null;
  absolute: number | null;
  pixelsCompared: number;
  changedPixels: number;
  changedPixelRatio: number;
  aSize: ImageSize | null;
  bSize: ImageSize | null;
  diffPath?: string;
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function identifyPng(filePath: string): ImageSize | null {
  if (!fs.existsSync(filePath)) return null;
  const png = PNG.sync.read(fs.readFileSync(filePath));
  return { width: png.width, height: png.height };
}

export function comparePngRmse(aPath: string, bPath: string, diffPath?: string): PngRmseResult {
  if (!fs.existsSync(aPath) || !fs.existsSync(bPath)) {
    return {
      status: 'missing-image',
      normalized: null,
      absolute: null,
      pixelsCompared: 0,
      changedPixels: 0,
      changedPixelRatio: 0,
      aSize: fs.existsSync(aPath) ? identifyPng(aPath) : null,
      bSize: fs.existsSync(bPath) ? identifyPng(bPath) : null,
    };
  }

  const a = PNG.sync.read(fs.readFileSync(aPath));
  const b = PNG.sync.read(fs.readFileSync(bPath));
  const aSize = { width: a.width, height: a.height };
  const bSize = { width: b.width, height: b.height };

  if (a.width !== b.width || a.height !== b.height) {
    return {
      status: 'size-mismatch',
      normalized: null,
      absolute: null,
      pixelsCompared: 0,
      changedPixels: 0,
      changedPixelRatio: 0,
      aSize,
      bSize,
    };
  }

  const diff = diffPath ? new PNG({ width: a.width, height: a.height }) : null;
  let sumSquares = 0;
  let changedPixels = 0;
  const pixels = a.width * a.height;

  for (let index = 0; index < a.data.length; index += 4) {
    const ar = compositeOnWhite(a.data[index], a.data[index + 3]);
    const ag = compositeOnWhite(a.data[index + 1], a.data[index + 3]);
    const ab = compositeOnWhite(a.data[index + 2], a.data[index + 3]);
    const br = compositeOnWhite(b.data[index], b.data[index + 3]);
    const bg = compositeOnWhite(b.data[index + 1], b.data[index + 3]);
    const bb = compositeOnWhite(b.data[index + 2], b.data[index + 3]);

    const dr = ar - br;
    const dg = ag - bg;
    const db = ab - bb;
    const pixelSquare = dr * dr + dg * dg + db * db;
    sumSquares += pixelSquare;

    const maxDelta = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
    if (maxDelta > 0) changedPixels += 1;

    if (diff) {
      const amplified = Math.min(255, maxDelta * 4);
      diff.data[index] = 255;
      diff.data[index + 1] = 255 - amplified;
      diff.data[index + 2] = 255 - amplified;
      diff.data[index + 3] = 255;
    }
  }

  if (diff && diffPath) {
    fs.mkdirSync(path.dirname(diffPath), { recursive: true });
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  const absolute = Math.sqrt(sumSquares / (pixels * 3));
  return {
    status: 'ok',
    normalized: absolute / 255,
    absolute,
    pixelsCompared: pixels,
    changedPixels,
    changedPixelRatio: pixels === 0 ? 0 : changedPixels / pixels,
    aSize,
    bSize,
    diffPath,
  };
}

export function cropPng(inputPath: string, crop: CropBox, outputPath: string): ImageSize {
  const source = PNG.sync.read(fs.readFileSync(inputPath));
  const width = Math.max(0, Math.min(crop.width, source.width - crop.x));
  const height = Math.max(0, Math.min(crop.height, source.height - crop.y));
  const target = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = ((crop.y + y) * source.width + crop.x + x) * 4;
      const targetIndex = (y * width + x) * 4;
      target.data[targetIndex] = source.data[sourceIndex];
      target.data[targetIndex + 1] = source.data[sourceIndex + 1];
      target.data[targetIndex + 2] = source.data[sourceIndex + 2];
      target.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(target));
  return { width, height };
}

function compositeOnWhite(channel: number, alpha: number): number {
  const normalizedAlpha = alpha / 255;
  return Math.round(channel * normalizedAlpha + 255 * (1 - normalizedAlpha));
}
