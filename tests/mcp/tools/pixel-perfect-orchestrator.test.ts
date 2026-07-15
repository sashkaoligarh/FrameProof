import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import { TokenCache } from '../../../src/mcp/cache.js';
import {
  handlePixelPerfectOrchestrator,
  pixelPerfectOrchestratorSchema,
} from '../../../src/mcp/tools/pixel-perfect-orchestrator.js';
import { PIXEL_PERFECT_ORCHESTRATION_MESSAGE } from '../../../src/mcp/prompts/pixel-perfect-orchestration.js';
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
  afterEach(() => {
    delete process.env.FIGMA_SCALER_OUTPUT_ROOT;
  });

  it('writes an explicitly plan-only pixel-perfect runbook', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-scaler-orchestrator-'));
    process.env.FIGMA_SCALER_OUTPUT_ROOT = outputDir;
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

    expect(result.mode).toBe('plan_only');
    expect(result.runbook_path).toBe(path.join(outputDir, 'RUNBOOK.md'));
    expect(result.final_gate_argv).toEqual([]);
    expect(result.final_gate_posix_display).toEqual([]);
    const runbook = fs.readFileSync(result.runbook_path, 'utf8');
    expect(runbook).toContain('It does not edit project files, capture live pages, run gates, or verify PASS.');
    expect(runbook).toContain('Figma frame URL containing ?node-id=');
    expect(runbook).toContain('Do not run a file-level Figma URL as a visual gate reference.');
    expect(runbook).not.toContain('continuous_until_pass');
  });

  it('discovers full-page sections and breakpoint variants from one Figma file link', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-scaler-orchestrator-'));
    process.env.FIGMA_SCALER_OUTPUT_ROOT = outputDir;
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
    expect(result.final_gate_argv[0]).toContain('--figma-url-desktop');
    expect(result.final_gate_argv[0]).toContain('--figma-url-tablet');
    expect(result.final_gate_argv[0]).toContain('--figma-url-mobile');
    expect(argumentAfter(result.final_gate_argv[0], '--viewports')).toBe('desktop,tablet,mobile,ultrawide');
    expect(result.acceptance).toContain('Ultrawide is behavior-only and cannot provide pixel acceptance; every available exact breakpoint must pass size and RMSE checks.');
    expect(fs.existsSync(result.inventory_path)).toBe(true);
    expect(fs.readFileSync(result.runbook_path, 'utf8')).toContain('A single Figma file/page/root link is enough');
  });

  it('roots generated artifacts under project_root and shell-quotes commands', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-scaler-orchestrator-'));
    const projectRoot = path.join(outputRoot, "project's ui");
    process.env.FIGMA_SCALER_OUTPUT_ROOT = outputRoot;
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
    const selector = "[data-name='price']$(printf unsafe)";
    const route = "/pricing's-route";

    const result = await handlePixelPerfectOrchestrator(
      {
        file_id: 'https://www.figma.com/design/file-1/Test',
        project_root: projectRoot,
        route,
        selectors: [selector],
        cli_command: ['node', '/checkout with space/dist/cli.js'],
      },
      new TokenCache(),
      fetchFn,
    );

    expect(result.runbook_path).toBe(path.join(projectRoot, '.figma', 'pixel-perfect-orchestration', 'RUNBOOK.md'));
    expect(result.required_artifacts.every((artifact) => artifact.startsWith(`${projectRoot}${path.sep}`))).toBe(true);
    const argv = result.final_gate_argv[0];
    expect(argv.slice(0, 3)).toEqual(['node', '/checkout with space/dist/cli.js', 'gate']);
    expect(argv).toContain(route);
    expect(argv).toContain(selector);
    expect(argv).toContain(path.join(projectRoot, '.pixel-perfect', 'figma-gate'));

    const runbook = fs.readFileSync(result.runbook_path, 'utf8');
    expect(runbook).toContain(`export_page_analysis output_path="${path.join(projectRoot, '.figma', 'page-analysis.md')}"`);
    expect(runbook).not.toContain('export_page_analysis save_to=');
    expect(runbook).toContain('Safe Argv');
    expect(runbook).toContain('POSIX display only:');
    expect(runbook).toContain(JSON.stringify(argv));
  });

  it('groups breakpoint children when an explicit root contains desktop, tablet, and mobile variants', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-scaler-orchestrator-'));
    process.env.FIGMA_SCALER_OUTPUT_ROOT = outputRoot;
    const explicitRoot = makeFrame('1:0', 'Pricing variants', 1440, 1200, [
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
    ]);
    const document = {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [{ id: '0:1', name: 'Landing', type: 'CANVAS', children: [explicitRoot] }],
    };
    const fetchFn = vi.fn().mockResolvedValue({
      file: {
        file_id: 'file-1',
        name: 'Test Design',
        last_modified: '2026-01-01',
        version: '1',
        document: document as FigmaFile['document'],
        components: {},
        component_sets: {},
        styles: {},
      },
      nodes: [{
        node_id: '1:0',
        node_type: 'FRAME',
        name: 'Pricing variants',
        parent_id: '0:1',
        depth: 2,
        raw: explicitRoot,
      }],
      tokens: emptyTokens,
    });

    const result = await handlePixelPerfectOrchestrator(
      { file_id: 'file-1', node_id: '1:0' },
      new TokenCache(),
      fetchFn,
    );

    expect(result.sections.map((section) => section.name)).toEqual(['Hero', 'Features']);
    expect(result.sections[0].variants.map((variant) => variant.breakpoint)).toEqual(['desktop', 'tablet', 'mobile']);
  });

  it('does not group explicit-root children as breakpoints from widths alone', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-scaler-orchestrator-'));
    process.env.FIGMA_SCALER_OUTPUT_ROOT = outputRoot;
    const explicitRoot = makeFrame('1:0', 'Pricing variants', 1440, 1200, [
      makeFrame('1:1', 'Option A', 1440, 1200),
      makeFrame('2:1', 'Option B', 1024, 1400),
      makeFrame('3:1', 'Option C', 390, 1600),
    ]);
    const fetchFn = fixtureFetch(
      { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
      [{
        node_id: '1:0',
        node_type: 'FRAME',
        name: 'Pricing variants',
        parent_id: '0:1',
        depth: 2,
        raw: explicitRoot,
      }],
    );

    const result = await handlePixelPerfectOrchestrator(
      { file_id: 'file-1', node_id: '1:0' },
      new TokenCache(),
      fetchFn,
    );

    expect(result.sections.map((section) => section.name)).toEqual(['Option A', 'Option B', 'Option C']);
    expect(result.sections.every((section) => section.variants.length === 1)).toBe(true);
  });

  it('uses only available exact viewports and does not force a missing tablet', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-scaler-orchestrator-'));
    process.env.FIGMA_SCALER_OUTPUT_ROOT = outputRoot;
    const document = {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [{
        id: '0:1',
        name: 'Landing',
        type: 'CANVAS',
        children: [
          makeFrame('1:1', 'Pricing Desktop', 1920, 1200, [makeFrame('1:10', 'Hero', 1920, 600)]),
          makeFrame('3:1', 'Pricing Mobile', 390, 1600, [makeFrame('3:10', 'Hero', 390, 700)]),
        ],
      }],
    };

    const result = await handlePixelPerfectOrchestrator(
      { file_id: 'file-1', route: '/pricing' },
      new TokenCache(),
      fixtureFetch(document, []),
    );

    const argv = result.final_gate_argv[0];
    expect(argumentAfter(argv, '--viewports')).toBe('desktop,mobile,ultrawide');
    expect(argv).not.toContain('--figma-url-tablet');
    expect(argv).toContain('--real-flow');
  });

  it('detects the source-checkout CLI when invoked from dist/mcp/server.js', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-scaler-orchestrator-'));
    process.env.FIGMA_SCALER_OUTPUT_ROOT = outputRoot;
    const checkout = path.join(outputRoot, 'checkout');
    const distMcp = path.join(checkout, 'dist', 'mcp');
    fs.mkdirSync(distMcp, { recursive: true });
    const serverEntry = path.join(distMcp, 'server.js');
    const cliEntry = path.join(checkout, 'dist', 'cli.js');
    fs.writeFileSync(serverEntry, '');
    fs.writeFileSync(cliEntry, '');
    const previousEntry = process.argv[1];
    process.argv[1] = serverEntry;

    try {
      const result = await handlePixelPerfectOrchestrator(
        { file_id: 'file-1' },
        new TokenCache(),
        fixtureFetch(makeDocumentWithBreakpointFrames(), []),
      );
      expect(result.final_gate_argv[0]?.slice(0, 3)).toEqual([process.execPath, cliEntry, 'gate']);
    } finally {
      process.argv[1] = previousEntry;
    }
  });

  it('bounds max_passes and selectors in the public MCP schema', () => {
    const schema = z.object(pixelPerfectOrchestratorSchema);
    expect(schema.safeParse({ file_id: 'file-1', max_passes: 1, selectors: ['.hero'] }).success).toBe(true);
    expect(schema.safeParse({ file_id: 'file-1', max_passes: 100 }).success).toBe(true);
    expect(schema.safeParse({ file_id: 'file-1', max_passes: 0 }).success).toBe(false);
    expect(schema.safeParse({ file_id: 'file-1', max_passes: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ file_id: 'file-1', max_passes: 101 }).success).toBe(false);
    expect(schema.safeParse({ file_id: 'file-1', selectors: [''] }).success).toBe(false);
    expect(schema.safeParse({ file_id: 'file-1', selectors: ['x'.repeat(513)] }).success).toBe(false);
    expect(schema.safeParse({ file_id: 'file-1', selectors: Array(101).fill('.section') }).success).toBe(false);
    expect(schema.safeParse({ file_id: 'file-1', cli_command: ['node', '/checkout/dist/cli.js'] }).success).toBe(true);
    expect(schema.safeParse({ file_id: 'file-1', cli_command: [] }).success).toBe(false);
  });

  it('describes the planner as plan-only and uses export_page_analysis.output_path', () => {
    expect(PIXEL_PERFECT_ORCHESTRATION_MESSAGE).toContain('plan_pixel_perfect_workflow');
    expect(PIXEL_PERFECT_ORCHESTRATION_MESSAGE).toContain('planning tool does not edit UI code');
    expect(PIXEL_PERFECT_ORCHESTRATION_MESSAGE).toContain('export_page_analysis output_path=');
    expect(PIXEL_PERFECT_ORCHESTRATION_MESSAGE).not.toContain('pixel_perfect_orchestrator');
    expect(PIXEL_PERFECT_ORCHESTRATION_MESSAGE).not.toContain('continuous_until_pass');
    expect(PIXEL_PERFECT_ORCHESTRATION_MESSAGE).toContain('non-authoritative values observed in nodes');
    expect(PIXEL_PERFECT_ORCHESTRATION_MESSAGE).not.toContain('delta <= 2px');
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

function fixtureFetch(document: Record<string, unknown>, nodes: unknown[]) {
  return vi.fn().mockResolvedValue({
    file: {
      file_id: 'file-1',
      name: 'Test Design',
      last_modified: '2026-01-01',
      version: '1',
      document: document as FigmaFile['document'],
      components: {},
      component_sets: {},
      styles: {},
    },
    nodes,
    tokens: emptyTokens,
  });
}

function argumentAfter(argv: string[] | undefined, flag: string): string | undefined {
  if (!argv) return undefined;
  const index = argv.indexOf(flag);
  return index < 0 ? undefined : argv[index + 1];
}
