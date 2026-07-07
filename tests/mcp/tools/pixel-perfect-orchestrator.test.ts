import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TokenCache } from '../../../src/mcp/cache.js';
import { handlePixelPerfectOrchestrator } from '../../../src/mcp/tools/pixel-perfect-orchestrator.js';
import type { AllTokens, FigmaFile } from '../../../src/types/tokens.js';

const emptyTokens: AllTokens = {
  colors: [],
  gradients: [],
  typography: [],
  spacing: [],
  radii: [],
  shadows: [],
  images: [],
  components: [],
};

describe('handlePixelPerfectOrchestrator', () => {
  it('writes a continuous pixel-perfect runbook', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-scaler-orchestrator-'));
    const fetchFn = vi.fn().mockResolvedValue({
      file: {
        file_id: 'file-1',
        name: 'Test Design',
        last_modified: '2026-01-01',
        version: '1',
        document: { type: 'DOCUMENT' } as FigmaFile['document'],
        components: {},
        component_sets: {},
        styles: {},
      },
      nodes: [],
      tokens: emptyTokens,
    });

    const result = await handlePixelPerfectOrchestrator(
      {
        file_id: 'file-1',
        framework: 'astro',
        route: '/pricing',
        selectors: ['.pricing-hero'],
        output_dir: outputDir,
      },
      new TokenCache(),
      fetchFn,
    );

    expect(result.mode).toBe('continuous_until_pass');
    expect(result.runbook_path).toBe(path.join(outputDir, 'RUNBOOK.md'));
    expect(result.final_gate_commands[0]).toContain('figma-scaler gate');
    expect(result.final_gate_commands[0]).toContain('--real-flow');
    expect(fs.readFileSync(result.runbook_path, 'utf8')).toContain('Do not stop after analysis');
  });

  it('discovers full-page sections and breakpoint variants from one Figma file link', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-scaler-orchestrator-'));
    const fetchFn = vi.fn().mockResolvedValue({
      file: {
        file_id: 'file-1',
        name: 'Test Design',
        last_modified: '2026-01-01',
        version: '1',
        document: makeDocumentWithBreakpointFrames() as FigmaFile['document'],
        components: {},
        component_sets: {},
        styles: {},
      },
      nodes: [],
      tokens: emptyTokens,
    });

    const result = await handlePixelPerfectOrchestrator(
      {
        file_id: 'https://www.figma.com/design/file-1/Test',
        framework: 'astro',
        route: '/pricing',
        output_dir: outputDir,
      },
      new TokenCache(),
      fetchFn,
    );

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].name).toBe('Hero');
    expect(result.sections[0].variants.map((variant) => variant.breakpoint)).toEqual(['desktop', 'tablet', 'mobile']);
    expect(result.final_gate_commands[0]).toContain('--figma-url-desktop');
    expect(result.final_gate_commands[0]).toContain('--figma-url-tablet');
    expect(result.final_gate_commands[0]).toContain('--figma-url-mobile');
    expect(fs.existsSync(result.inventory_path)).toBe(true);
    expect(fs.readFileSync(result.runbook_path, 'utf8')).toContain('A single Figma file/page/root link is enough');
  });
});

function makeDocumentWithBreakpointFrames(): Record<string, unknown> {
  return {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      {
        id: '0:1',
        name: 'Landing',
        type: 'CANVAS',
        children: [
          makeFrame('1:1', 'Pricing Desktop', 1440, 1200, [
            makeFrame('1:10', 'Hero', 1440, 600),
            makeFrame('1:11', 'Features', 1440, 600),
          ]),
          makeFrame('2:1', 'Pricing Tablet', 1024, 1400, [
            makeFrame('2:10', 'Hero', 1024, 620),
            makeFrame('2:11', 'Features', 1024, 780),
          ]),
          makeFrame('3:1', 'Pricing Mobile', 390, 1600, [
            makeFrame('3:10', 'Hero', 390, 700),
            makeFrame('3:11', 'Features', 390, 900),
          ]),
        ],
      },
    ],
  };
}

function makeFrame(id: string, name: string, width: number, height: number, children: unknown[] = []): Record<string, unknown> {
  return {
    id,
    name,
    type: 'FRAME',
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width, height },
    children,
  };
}
