import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { comparePngRmse, cropPng, identifyPng } from '../../../src/visual/image.js';

describe('visual image comparison', () => {
  it('identifies PNG dimensions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-image-'));
    const imagePath = path.join(dir, 'image.png');
    writePng(imagePath, 3, 2, [255, 255, 255, 255]);

    expect(identifyPng(imagePath)).toEqual({ width: 3, height: 2 });
  });

  it('returns zero RMSE for identical images', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-image-'));
    const aPath = path.join(dir, 'a.png');
    const bPath = path.join(dir, 'b.png');
    writePng(aPath, 2, 2, [10, 20, 30, 255]);
    writePng(bPath, 2, 2, [10, 20, 30, 255]);

    const result = comparePngRmse(aPath, bPath, path.join(dir, 'diff.png'));

    expect(result.status).toBe('ok');
    expect(result.normalized).toBe(0);
    expect(result.changedPixels).toBe(0);
    expect(fs.existsSync(path.join(dir, 'diff.png'))).toBe(true);
  });

  it('reports size mismatch without comparing pixels', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-image-'));
    const aPath = path.join(dir, 'a.png');
    const bPath = path.join(dir, 'b.png');
    writePng(aPath, 2, 2, [10, 20, 30, 255]);
    writePng(bPath, 3, 2, [10, 20, 30, 255]);

    const result = comparePngRmse(aPath, bPath);

    expect(result.status).toBe('size-mismatch');
    expect(result.normalized).toBeNull();
    expect(result.aSize).toEqual({ width: 2, height: 2 });
    expect(result.bSize).toEqual({ width: 3, height: 2 });
  });

  it('crops PNG images for tolerance comparisons', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-image-'));
    const sourcePath = path.join(dir, 'source.png');
    const cropPath = path.join(dir, 'crop.png');
    writePng(sourcePath, 4, 3, [10, 20, 30, 255]);

    const size = cropPng(sourcePath, { x: 1, y: 1, width: 2, height: 2 }, cropPath);

    expect(size).toEqual({ width: 2, height: 2 });
    expect(identifyPng(cropPath)).toEqual({ width: 2, height: 2 });
  });
});

function writePng(filePath: string, width: number, height: number, rgba: [number, number, number, number]): void {
  const png = new PNG({ width, height });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = rgba[0];
    png.data[index + 1] = rgba[1];
    png.data[index + 2] = rgba[2];
    png.data[index + 3] = rgba[3];
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}
