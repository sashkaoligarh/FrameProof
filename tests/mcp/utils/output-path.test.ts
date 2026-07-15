import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  atomicWriteOutputFile,
  prepareOutputDirectory,
  resolveOutputPath,
} from '../../../src/mcp/utils/output-path.js';

describe('secure output paths', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-output-root-'));
    process.env.FRAMEPROOF_OUTPUT_ROOT = root;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FRAMEPROOF_OUTPUT_ROOT;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('uses a project working directory when no root is configured', () => {
    delete process.env.FRAMEPROOF_OUTPUT_ROOT;
    vi.spyOn(process, 'cwd').mockReturnValue(root);

    expect(resolveOutputPath('tokens.json')).toBe(path.join(root, 'tokens.json'));
  });

  it('rejects filesystem root and user home as configured output roots', () => {
    process.env.FRAMEPROOF_OUTPUT_ROOT = path.parse(root).root;
    expect(() => resolveOutputPath('tokens.json')).toThrow(/narrower project directory/i);

    process.env.FRAMEPROOF_OUTPUT_ROOT = os.homedir();
    expect(() => resolveOutputPath('tokens.json')).toThrow(/narrower project directory/i);
  });

  it('gives actionable guidance when the default working directory is unsafe', () => {
    delete process.env.FRAMEPROOF_OUTPUT_ROOT;
    vi.spyOn(process, 'cwd').mockReturnValue(path.parse(root).root);

    expect(() => resolveOutputPath('tokens.json')).toThrow(
      /FRAMEPROOF_OUTPUT_ROOT.*launch frameproof inside a project/i,
    );
  });

  it('resolves relative paths under the configured root and writes atomically', () => {
    const outputPath = atomicWriteOutputFile('nested/tokens.json', '{"ok":true}');

    expect(outputPath).toBe(path.join(root, 'nested', 'tokens.json'));
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('{"ok":true}');
    expect(fs.readdirSync(path.dirname(outputPath))).toEqual(['tokens.json']);
  });

  it('allows absolute paths only when they are inside the configured root', () => {
    const allowed = path.join(root, 'screenshots');

    expect(prepareOutputDirectory(allowed)).toBe(allowed);
    expect(() => resolveOutputPath(path.join(os.tmpdir(), 'outside.png'))).toThrow(/safe root/i);
  });

  it('rejects traversal segments even when normalization would land inside the root', () => {
    expect(() => resolveOutputPath('nested/../tokens.json')).toThrow(/traversal/i);
    expect(() => resolveOutputPath('../escape.json')).toThrow(/traversal/i);
  });

  it('rejects an existing symlink that escapes the configured root', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-outside-'));
    try {
      fs.symlinkSync(outside, path.join(root, 'escape'), 'dir');
      expect(() => atomicWriteOutputFile('escape/secret.txt', 'blocked')).toThrow(/symbolic link/i);
      expect(fs.existsSync(path.join(outside, 'secret.txt'))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects dangling symlinks in an output path', () => {
    fs.symlinkSync(path.join(root, 'missing-target'), path.join(root, 'dangling'), 'dir');

    expect(() => atomicWriteOutputFile('dangling/file.txt', 'blocked')).toThrow(/dangling symbolic link/i);
  });
});
