import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectDoctorReport,
  formatDoctorReport,
  isSupportedNodeVersion,
  parseFiniteNumberInRange,
  parseNonnegativeInteger,
  program,
} from '../../src/cli.js';

const originalEnvironment = {
  CHROME_BIN: process.env.CHROME_BIN,
  CHROMIUM_BIN: process.env.CHROMIUM_BIN,
  FIGMA_TOKEN: process.env.FIGMA_TOKEN,
  FRAMEPROOF_OUTPUT_ROOT: process.env.FRAMEPROOF_OUTPUT_ROOT,
  TINYJPG_TOKEN: process.env.TINYJPG_TOKEN,
};

describe.sequential('CLI validation and doctor', () => {
  afterEach(() => {
    restoreEnvironment();
  });

  it('accepts only finite bounded scales and thresholds', () => {
    expect(parseFiniteNumberInRange('1', '--image-scale', 1, 4)).toBe(1);
    expect(parseFiniteNumberInRange('2.5', '--image-scale', 1, 4)).toBe(2.5);
    expect(parseFiniteNumberInRange('1', '--rmse-threshold', 0, 1)).toBe(1);

    for (const value of ['0', '4.1', 'NaN', 'Infinity', '2px']) {
      expect(() => parseFiniteNumberInRange(value, '--image-scale', 1, 4)).toThrow();
    }
  });

  it('uses the frameproof command name', () => {
    expect(program.name()).toBe('frameproof');
  });

  it('accepts only nonnegative safe integers for tolerances and waits', () => {
    expect(parseNonnegativeInteger('0', '--wait-ms')).toBe(0);
    expect(parseNonnegativeInteger('500', '--wait-ms')).toBe(500);

    for (const value of ['-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
      expect(() => parseNonnegativeInteger(value, '--wait-ms')).toThrow();
    }
  });

  it('enforces the Vite-compatible Node.js release ranges', () => {
    for (const version of ['20.19.0', '20.20.1', 'v22.12.0', '23.0.0', '24.1.0']) {
      expect(isSupportedNodeVersion(version)).toBe(true);
    }

    for (const version of ['19.9.0', '20.18.1', '21.7.3', '22.11.0', '22.12', 'invalid']) {
      expect(isSupportedNodeVersion(version)).toBe(false);
    }
  });

  it('lists every accepted image format in parse help', () => {
    const parseCommand = program.commands.find((command) => command.name() === 'parse');
    const imageFormatOption = parseCommand?.options.find((option) => option.long === '--image-format');

    expect(imageFormatOption?.description).toContain('svg,png,jpg,pdf');
  });

  it('reports readiness without exposing token values and keeps TinyJPG optional', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-doctor-'));
    const chromePath = path.join(root, 'chrome');
    fs.writeFileSync(chromePath, '#!/bin/sh\necho "Chromium 123"\n', { mode: 0o700 });
    process.env.CHROME_BIN = chromePath;
    delete process.env.CHROMIUM_BIN;
    process.env.FIGMA_TOKEN = 'figma-super-secret';
    process.env.FRAMEPROOF_OUTPUT_ROOT = root;
    delete process.env.TINYJPG_TOKEN;

    const report = collectDoctorReport();
    const serialized = JSON.stringify(report);

    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.name === 'tinyjpg_token')).toMatchObject({
      status: 'warn',
      blocker: false,
    });
    expect(serialized).not.toContain('figma-super-secret');
    expect(formatDoctorReport(report)).toContain('Overall: READY');
  });

  it('marks missing required configuration and an unusable output root as blockers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frameproof-doctor-'));
    const chromePath = path.join(root, 'chrome');
    const outputRootFile = path.join(root, 'not-a-directory');
    fs.writeFileSync(chromePath, '#!/bin/sh\necho "Chromium 123"\n', { mode: 0o700 });
    fs.writeFileSync(outputRootFile, 'file');
    process.env.CHROME_BIN = chromePath;
    delete process.env.FIGMA_TOKEN;
    process.env.FRAMEPROOF_OUTPUT_ROOT = outputRootFile;

    const report = collectDoctorReport();

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === 'figma_token')?.blocker).toBe(true);
    expect(report.checks.find((check) => check.name === 'output_root')?.blocker).toBe(true);
    expect(formatDoctorReport(report)).toContain('Overall: BLOCKED');
  });
});

function restoreEnvironment(): void {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
