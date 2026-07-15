import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import { resolveParams } from '../utils/normalize-node-id.js';
import { atomicWriteOutputFile, prepareOutputDirectory } from '../utils/output-path.js';

const FRAMEWORKS = ['astro', 'react', 'next', 'auto'] as const;
const ARCHITECTURES = ['feature-sliced', 'project-native', 'auto'] as const;
const BREAKPOINT_ORDER = ['desktop', 'tablet', 'mobile', 'unknown'] as const;
const MAX_PASSES = 100;
const MAX_SELECTORS = 100;
const MAX_SELECTOR_LENGTH = 512;
const MAX_CLI_COMMAND_PARTS = 16;
const MAX_CLI_COMMAND_PART_LENGTH = 4_096;

type BreakpointName = (typeof BREAKPOINT_ORDER)[number];
type RawNode = Record<string, unknown>;

export const pixelPerfectOrchestratorSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL. A file/page/root link is enough; all frames/sections are inventoried automatically.'),
  node_id: z.string().optional().describe('Optional root node ID. If omitted, the whole file/page top-level frames are inventoried.'),
  project_root: z.string().min(1).optional().describe('Target React/Astro project root path inside FRAMEPROOF_OUTPUT_ROOT.'),
  framework: z.enum(FRAMEWORKS).optional().default('auto').describe('Target framework: astro, react, next, or auto.'),
  architecture: z.enum(ARCHITECTURES).optional().default('feature-sliced').describe('Preferred code architecture.'),
  route: z.string().optional().describe('Live route, for example /pricing.'),
  page_url: z.string().optional().describe('Absolute live page URL. Overrides route/base_url in generated commands.'),
  base_url: z.string().optional().default('http://localhost:3000').describe('Base URL for generated route commands.'),
  selectors: z
    .array(z.string().trim().min(1).max(MAX_SELECTOR_LENGTH))
    .max(MAX_SELECTORS)
    .optional()
    .describe(`Up to ${MAX_SELECTORS} stable live CSS selectors (${MAX_SELECTOR_LENGTH} characters each). If omitted, the plan calls for selector discovery per section.`),
  cli_command: z
    .array(z.string().min(1).max(MAX_CLI_COMMAND_PART_LENGTH))
    .min(1)
    .max(MAX_CLI_COMMAND_PARTS)
    .optional()
    .describe('Safe argv prefix used to invoke the CLI, for example ["node", "/checkout/dist/cli.js"]. Source-checkout MCP runs are detected automatically.'),
  output_dir: z.string().optional().default('.figma/pixel-perfect-orchestration').describe('Directory for generated runbook artifacts.'),
  max_passes: z.number().int().min(1).max(MAX_PASSES).optional().default(12).describe(`Planned safety cap per section (1-${MAX_PASSES}).`),
  real_flow: z.boolean().optional().default(true).describe('Require strict real-flow gate with semantic visibility and ultrawide checks.'),
  fail_on_review: z.boolean().optional().default(true).describe('Treat REVIEW as non-closable final state.'),
};

export interface PixelPerfectOrchestratorParams {
  file_id: string;
  node_id?: string;
  project_root?: string;
  framework?: (typeof FRAMEWORKS)[number];
  architecture?: (typeof ARCHITECTURES)[number];
  route?: string;
  page_url?: string;
  base_url?: string;
  selectors?: string[];
  cli_command?: string[];
  output_dir?: string;
  max_passes?: number;
  real_flow?: boolean;
  fail_on_review?: boolean;
}

export interface BreakpointVariantInventory {
  breakpoint: BreakpointName;
  node_id: string;
  name: string;
  dimensions: string;
  source_root: string;
  source_page?: string;
  figma_url: string;
}

export interface SectionInventory {
  node_id: string;
  name: string;
  dimensions: string;
  selector?: string;
  breakpoint: BreakpointName;
  source_root: string;
  source_page?: string;
  figma_url: string;
  variants: BreakpointVariantInventory[];
}

export interface PixelPerfectOrchestratorResult {
  mode: 'plan_only';
  runbook_path: string;
  inventory_path: string;
  figma_root: { file_id: string; node_id?: string };
  framework: string;
  architecture: string;
  sections: SectionInventory[];
  required_artifacts: string[];
  final_gate_argv: string[][];
  final_gate_posix_display: string[];
  acceptance: string[];
}

interface RootCandidate {
  raw: RawNode;
  pageName?: string;
}

interface RootGroup {
  name: string;
  roots: RootCandidate[];
}

interface ArtifactPaths {
  projectRoot: string;
  tokens: string;
  designSystem: string;
  pageAnalysis: string;
  sectionDetails: string;
  screenshotDirectory: string;
  sectionScreenshots: string;
  gateRoot: string;
}

interface GateCommand {
  argv: string[];
  posixDisplay: string;
}

export async function handlePixelPerfectOrchestrator(
  params: PixelPerfectOrchestratorParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<PixelPerfectOrchestratorResult> {
  const { file_id: fileId, node_id: nodeId } = resolveParams(params.file_id, params.node_id);
  const projectRoot = prepareOutputDirectory(params.project_root ?? '.');
  const outputDir = prepareProjectOutputDirectory(
    projectRoot,
    params.output_dir ?? '.figma/pixel-perfect-orchestration',
  );
  const artifacts = buildArtifactPaths(projectRoot);

  const entry = await cache.getOrFetch(fileId, fetchFn);
  const rootGroups = collectRootGroups(entry.file.document as RawNode, entry.nodes.map((node) => node.raw as RawNode), nodeId);
  const sections = assignSelectors(rootGroups.flatMap((group) => collectSections(group, params.file_id, fileId)), params.selectors ?? []);
  const finalGateCommands = buildGateCommands(params, sections, artifacts.gateRoot);
  const runbook = renderRunbook(params, fileId, nodeId, rootGroups, sections, finalGateCommands, artifacts);
  const runbookPath = path.join(outputDir, 'RUNBOOK.md');
  const inventoryPath = path.join(outputDir, 'inventory.json');
  atomicWriteOutputFile(runbookPath, runbook);
  atomicWriteOutputFile(inventoryPath, JSON.stringify({ root_groups: rootGroups.map(serializeRootGroup), sections }, null, 2));

  return {
    mode: 'plan_only',
    runbook_path: runbookPath,
    inventory_path: inventoryPath,
    figma_root: { file_id: fileId, node_id: nodeId },
    framework: params.framework ?? 'auto',
    architecture: params.architecture ?? 'feature-sliced',
    sections,
    required_artifacts: [
      artifacts.tokens,
      artifacts.designSystem,
      artifacts.pageAnalysis,
      artifacts.sectionScreenshots,
      inventoryPath,
      path.join(artifacts.gateRoot, '*', 'REPORT.md'),
      path.join(artifacts.gateRoot, '*', 'summary.json'),
    ],
    final_gate_argv: finalGateCommands.map((command) => command.argv),
    final_gate_posix_display: finalGateCommands.map((command) => command.posixDisplay),
    acceptance: acceptanceContract(params),
  };
}

function collectRootGroups(document: RawNode, allNodes: RawNode[], nodeId: string | undefined): RootGroup[] {
  if (nodeId) {
    const root = allNodes.find((node) => node.id === nodeId);
    if (!root) return [];

    const breakpointChildren = children(root).filter((child) => isFrameLike(child) && child.visible !== false);
    const namedChildBreakpoints = new Set(
      breakpointChildren.map(classifyBreakpointName).filter((breakpoint) => breakpoint !== 'unknown'),
    );
    if (namedChildBreakpoints.size > 1) {
      return [{
        name: nodeName(root),
        roots: breakpointChildren.map((child) => ({ raw: child })),
      }];
    }

    return [{ name: nodeName(root), roots: [{ raw: root }] }];
  }

  const candidates: RootCandidate[] = [];
  for (const page of children(document).filter((child) => child.type === 'CANVAS')) {
    for (const child of children(page).filter(isFrameLike)) {
      candidates.push({ raw: child, pageName: nodeName(page) });
    }
  }

  const grouped = new Map<string, RootCandidate[]>();
  for (const candidate of candidates) {
    const key = normalizeGroupName(nodeName(candidate.raw));
    const existing = grouped.get(key) ?? [];
    existing.push(candidate);
    grouped.set(key, existing);
  }

  const result: RootGroup[] = [];
  for (const [name, roots] of grouped.entries()) {
    const breakpointCount = new Set(roots.map((root) => classifyBreakpoint(root.raw)).filter((value) => value !== 'unknown')).size;
    if (roots.length > 1 && breakpointCount > 1) {
      result.push({ name, roots });
    } else {
      for (const root of roots) {
        result.push({ name: nodeName(root.raw), roots: [root] });
      }
    }
  }

  return result;
}

function collectSections(group: RootGroup, originalFileInput: string, fileId: string): SectionInventory[] {
  const breakpointRoots = group.roots
    .map((root) => ({ ...root, breakpoint: classifyBreakpoint(root.raw) }))
    .sort((a, b) => breakpointIndex(a.breakpoint) - breakpointIndex(b.breakpoint));
  const hasBreakpointSet = new Set(breakpointRoots.map((root) => root.breakpoint).filter((bp) => bp !== 'unknown')).size > 1;
  const sectionGroups = new Map<string, BreakpointVariantInventory[]>();

  if (hasBreakpointSet) {
    for (const root of breakpointRoots) {
      const rootSections = sectionChildrenOrSelf(root.raw);
      for (const section of rootSections) {
        const key = normalizeGroupName(nodeName(section));
        const variants = sectionGroups.get(key) ?? [];
        variants.push(toVariant(section, root.breakpoint, nodeName(root.raw), root.pageName, originalFileInput, fileId));
        sectionGroups.set(key, variants);
      }
    }
  } else {
    for (const root of breakpointRoots) {
      const rootBreakpoint = root.breakpoint;
      for (const section of sectionChildrenOrSelf(root.raw)) {
        const key = `${nodeIdOf(section)}:${nodeName(section)}`;
        sectionGroups.set(key, [toVariant(section, rootBreakpoint, nodeName(root.raw), root.pageName, originalFileInput, fileId)]);
      }
    }
  }

  return [...sectionGroups.values()].map((variants) => {
    const sortedVariants = variants.sort((a, b) => breakpointIndex(a.breakpoint) - breakpointIndex(b.breakpoint));
    const primary = sortedVariants.find((variant) => variant.breakpoint === 'desktop') ?? sortedVariants[0];
    return {
      node_id: primary.node_id,
      name: primary.name,
      dimensions: primary.dimensions,
      breakpoint: primary.breakpoint,
      source_root: primary.source_root,
      source_page: primary.source_page,
      figma_url: primary.figma_url,
      variants: sortedVariants,
    };
  });
}

function sectionChildrenOrSelf(root: RawNode): RawNode[] {
  const sections = children(root).filter((child) => isFrameLike(child) && child.visible !== false);
  return sections.length > 0 ? sections : [root];
}

function toVariant(
  node: RawNode,
  breakpoint: BreakpointName,
  sourceRoot: string,
  sourcePage: string | undefined,
  originalFileInput: string,
  fileId: string,
): BreakpointVariantInventory {
  return {
    breakpoint,
    node_id: nodeIdOf(node),
    name: nodeName(node),
    dimensions: dimensionsOf(node),
    source_root: sourceRoot,
    source_page: sourcePage,
    figma_url: buildFigmaNodeUrl(originalFileInput, fileId, nodeIdOf(node)),
  };
}

function assignSelectors(sections: SectionInventory[], selectors: string[]): SectionInventory[] {
  return sections.map((section, index) => ({ ...section, selector: selectors[index] }));
}

function buildGateCommands(
  params: PixelPerfectOrchestratorParams,
  sections: SectionInventory[],
  gateOutputDir: string,
): GateCommand[] {
  const cliCommand = resolveCliCommand(params.cli_command);
  const pageArgs = params.page_url
    ? ['--page-url', params.page_url]
    : ['--route', params.route ?? '/', '--base-url', params.base_url ?? 'http://localhost:3000'];

  return sections.flatMap((section) => {
    const selector = section.selector ?? `<selector-for-${slugify(section.name)}>`;
    const variants = new Map<BreakpointName, BreakpointVariantInventory>();
    for (const variant of section.variants) {
      if (variant.breakpoint !== 'unknown' && !variants.has(variant.breakpoint)) {
        variants.set(variant.breakpoint, variant);
      }
    }
    const exactBreakpoints = BREAKPOINT_ORDER
      .filter((breakpoint): breakpoint is Exclude<BreakpointName, 'unknown'> => breakpoint !== 'unknown')
      .filter((breakpoint) => variants.has(breakpoint));
    if (exactBreakpoints.length === 0) return [];

    const viewportNames = [
      ...exactBreakpoints,
      ...((params.real_flow ?? true) && variants.has('desktop') ? ['ultrawide'] : []),
    ];
    const figmaArgs = exactBreakpoints.length === 1
      ? ['--figma-url', variants.get(exactBreakpoints[0])!.figma_url]
      : exactBreakpoints.flatMap((breakpoint) => [
        `--figma-url-${breakpoint}`,
        variants.get(breakpoint)!.figma_url,
      ]);
    const argv = [
      ...cliCommand,
      'gate',
      ...pageArgs,
      '--selector',
      selector,
      ...figmaArgs,
      '--viewports',
      viewportNames.join(','),
      '--output-dir',
      gateOutputDir,
      ...((params.real_flow ?? true) ? ['--real-flow'] : []),
      ...((params.fail_on_review ?? true) ? ['--fail-on-review'] : []),
    ];
    return [{ argv, posixDisplay: argv.map(posixShellQuote).join(' ') }];
  });
}

function renderRunbook(
  params: PixelPerfectOrchestratorParams,
  fileId: string,
  nodeId: string | undefined,
  rootGroups: RootGroup[],
  sections: SectionInventory[],
  finalGateCommands: GateCommand[],
  artifacts: ArtifactPaths,
): string {
  const lines = [
    '# Pixel-Perfect Workflow Plan',
    '',
    'Mode: plan_only',
    'This file inventories and plans the work. It does not edit project files, capture live pages, run gates, or verify PASS.',
    `Figma file: ${fileId}`,
    `Figma root node: ${nodeId ?? 'whole file/page inventory'}`,
    `Framework: ${params.framework ?? 'auto'}`,
    `Architecture: ${params.architecture ?? 'feature-sliced'}`,
    `Project root: ${artifacts.projectRoot}`,
    `Max passes before blocker report: ${params.max_passes ?? 12}`,
    '',
    '## Execution Acceptance Criteria',
    '',
    ...acceptanceContract(params).map((item) => `- ${item}`),
    '',
    '## Full-Page Auto-Discovery',
    '',
    '- A single Figma file/page/root link is enough. Do not ask the user for every block link.',
    '- Inventory every top-level page/frame and every direct child section before editing.',
    '- If root frames are desktop/tablet/mobile variants, group them as breakpoints and inspect each breakpoint-specific section.',
    '- For an explicitly selected root, widths alone do not prove child breakpoint variants; require breakpoint evidence in the child frame names.',
    '- If a Figma node describes one functional block instead of a page, treat the block variants as the full scope and still verify all available breakpoints.',
    '- If inventory contains multiple pages, process every relevant page/frame unless the user explicitly narrows the scope.',
    '',
    '## Mandatory Figma Extraction',
    '',
    '- read_design_strategy prompt',
    '- layout_strategy prompt',
    '- get_document_structure for whole-file/page frame inventory',
    '- get_screenshot for each root frame/breakpoint',
    `- get_design_tokens save_to="${artifacts.tokens}"`,
    `- get_css_variables save_to="${artifacts.designSystem}"`,
    '- get_frame_overview for every root frame and breakpoint frame',
    `- batch_screenshots output_dir="${artifacts.screenshotDirectory}" for every root frame/breakpoint section list`,
    `- get_node_info save_to="${artifacts.sectionDetails}" for every edited section/breakpoint`,
    '- export_node_image for exact SVG/PNG assets instead of approximations',
    `- export_page_analysis output_path="${artifacts.pageAnalysis}" for design notes`,
    '',
    '## Root Frames',
    '',
  ];

  if (rootGroups.length === 0) {
    lines.push('- No frame inventory found. Use get_document_structure and inspect the file manually before editing.');
  } else {
    for (const group of rootGroups) {
      lines.push(`- ${group.name}: ${group.roots.map((root) => `${nodeName(root.raw)} (${nodeIdOf(root.raw)}, ${dimensionsOf(root.raw)}, ${classifyBreakpoint(root.raw)})`).join('; ')}`);
    }
  }

  lines.push('', '## Section Inventory', '');

  if (sections.length === 0) {
    lines.push('- No section inventory found. Do not implement by guessing; inspect document structure first.');
  } else {
    for (const section of sections) {
      lines.push(`- ${section.name} (${section.node_id}) ${section.dimensions}${section.selector ? ` selector=${section.selector}` : ''}`);
      lines.push(`  variants: ${section.variants.map((variant) => `${variant.breakpoint}=${variant.node_id} ${variant.dimensions}`).join(', ')}`);
    }
  }

  lines.push(
    '',
    '## Four-Pass Loop Per Section',
    '',
    '- Geometry/layout: frame size, container, padding, gap, alignment, order, clipping, constraints.',
    '- Typography/tokens: font family, size, weight, line-height, letter-spacing, wrapping, colors, mixed segments.',
    '- Assets/styling: exact SVG/PNG assets, gradients, image crop, borders, radii, shadows, opacity, blend modes.',
    '- Responsive/behavior: desktop/tablet/mobile nodes, overflow, semantic visibility, interactive states, stale CSS/assets.',
    '',
    'Repeat code edit -> fresh capture -> compare -> fix until PASS for every section and breakpoint. Do not close from stale screenshots.',
    '',
    '## Design-System And FSD Rules',
    '',
    ...architectureRules(params).map((item) => `- ${item}`),
    '',
    '## Final Gates',
    '',
  );

  if (finalGateCommands.length === 0) {
    lines.push(
      '- No gate command was generated because the inventory did not yield a node with a named or width-classified exact breakpoint.',
      `- Re-run plan_pixel_perfect_workflow with a Figma frame URL containing ?node-id=... or pass node_id explicitly${nodeId ? ', then inspect the node and provide a stable selector' : ''}. Do not run a file-level Figma URL as a visual gate reference.`,
      '',
    );
  } else {
    lines.push(
      'Execute the argv arrays directly without a shell when possible. POSIX strings are display-only and are not portable command APIs.',
      '',
    );
    finalGateCommands.forEach((command, index) => {
      lines.push(
        `### Gate ${index + 1} Safe Argv`,
        '',
        '```json',
        JSON.stringify(command.argv),
        '```',
        '',
        'POSIX display only:',
        '',
        '```sh',
        command.posixDisplay,
        '```',
        '',
      );
    });
  }

  return `${lines.join('\n')}\n`;
}

function acceptanceContract(params: PixelPerfectOrchestratorParams): string[] {
  return [
    'The plan is not evidence of implementation or visual correctness; execute and verify every listed step separately.',
    'During execution, do not stop after analysis, first draft, or partial visual similarity; continue until strict gates pass or a concrete blocker is proven.',
    'Final closure requires fresh screenshots captured after the last code edit.',
    `Final gate must use ${params.real_flow ?? true ? '--real-flow' : 'the configured strict viewport set'}${params.fail_on_review ?? true ? ' and --fail-on-review' : ''}.`,
    'Use --viewports with every available exact breakpoint; add ultrawide only when desktop exists.',
    'Ultrawide is behavior-only and cannot provide pixel acceptance; every available exact breakpoint must pass size and RMSE checks.',
    'Any FAIL or REVIEW on an edited selector/breakpoint is non-closable unless classified as renderer_only_drift, content_drift, asset_blocker, access_blocker, or implementation_blocker.',
    'Do not invent responsive layouts when Figma has tablet/mobile nodes; inspect the breakpoint-specific nodes.',
    'Use authoritative Figma variable bindings or established project tokens when they apply; otherwise preserve exact observed values.',
  ];
}

function architectureRules(params: PixelPerfectOrchestratorParams): string[] {
  const framework = params.framework ?? 'auto';
  return [
    'Discover existing tokens, fonts, theme files, public assets, shared UI, and page composition before editing.',
    'Treat get_design_tokens, generated CSS variables, and token_hints as non-authoritative values observed in nodes unless get_variables proves a binding.',
    'Preserve the exact observed value unless an authoritative Figma variable or established project convention justifies substitution; verify token_hints at every delta.',
    'Feature-Sliced default: shared/ui for primitives, shared/assets for exact exports, entities for domain cards, features for interactions, widgets/sections for page blocks, pages/app for routing.',
    framework === 'astro'
      ? 'Astro: keep page-local fixes in page sections; do not mutate shared Header/Footer/UI for one page unless the task is explicitly global.'
      : 'React/Next: preserve existing component boundaries and state/data flow; add variants instead of forking shared components.',
    'Exact overlays are diagnostic or last-resort only; prefer semantic markup plus exact assets so real DOM visibility stays valid.',
  ];
}

function serializeRootGroup(group: RootGroup): unknown {
  return {
    name: group.name,
    roots: group.roots.map((root) => ({
      page: root.pageName,
      node_id: nodeIdOf(root.raw),
      name: nodeName(root.raw),
      dimensions: dimensionsOf(root.raw),
      breakpoint: classifyBreakpoint(root.raw),
    })),
  };
}

function prepareProjectOutputDirectory(projectRoot: string, requestedPath: string): string {
  if (!path.isAbsolute(requestedPath) && requestedPath.split(/[\\/]+/).includes('..')) {
    throw new Error(`Orchestration output directory must not traverse outside project_root "${projectRoot}".`);
  }
  const candidate = path.isAbsolute(requestedPath) ? path.resolve(requestedPath) : path.join(projectRoot, requestedPath);
  if (!isWithin(projectRoot, candidate)) {
    throw new Error(`Orchestration output directory must be inside project_root "${projectRoot}".`);
  }
  const outputDir = prepareOutputDirectory(candidate);
  if (!isWithin(projectRoot, outputDir)) {
    throw new Error(`Orchestration output directory must be inside project_root "${projectRoot}".`);
  }
  return outputDir;
}

function buildArtifactPaths(projectRoot: string): ArtifactPaths {
  return {
    projectRoot,
    tokens: path.join(projectRoot, '.figma', 'tokens.json'),
    designSystem: path.join(projectRoot, '.figma', 'design-system.css'),
    pageAnalysis: path.join(projectRoot, '.figma', 'page-analysis.md'),
    sectionDetails: path.join(projectRoot, '.figma', '<section>', '<breakpoint>.json'),
    screenshotDirectory: path.join(projectRoot, '.figma', 'screenshots'),
    sectionScreenshots: path.join(projectRoot, '.figma', 'screenshots', '<section>-<breakpoint>.png'),
    gateRoot: path.join(projectRoot, '.pixel-perfect', 'figma-gate'),
  };
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function resolveCliCommand(explicitCommand: string[] | undefined): string[] {
  if (explicitCommand) return [...explicitCommand];

  const serverEntry = process.argv[1];
  if (serverEntry && /(?:^|[\\/])dist[\\/]mcp[\\/]server\.js$/.test(serverEntry)) {
    const cliEntry = path.resolve(path.dirname(serverEntry), '..', 'cli.js');
    if (fs.existsSync(cliEntry)) return [process.execPath, cliEntry];
  }
  return ['frameproof'];
}

function posixShellQuote(value: string): string {
  if (/^[a-zA-Z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function children(node: RawNode): RawNode[] {
  return Array.isArray(node.children) ? node.children as RawNode[] : [];
}

function isFrameLike(node: RawNode): boolean {
  return ['FRAME', 'COMPONENT', 'INSTANCE', 'SECTION', 'COMPONENT_SET'].includes(String(node.type));
}

function nodeIdOf(node: RawNode): string {
  return String(node.id ?? '');
}

function nodeName(node: RawNode): string {
  return String(node.name ?? 'Unnamed');
}

function dimensionsOf(node: RawNode): string {
  const bbox = node.absoluteBoundingBox as { width?: number; height?: number } | undefined;
  return `${Math.round(bbox?.width ?? 0)}x${Math.round(bbox?.height ?? 0)}`;
}

function widthOf(node: RawNode): number {
  const bbox = node.absoluteBoundingBox as { width?: number } | undefined;
  return Math.round(bbox?.width ?? 0);
}

function classifyBreakpoint(node: RawNode): BreakpointName {
  const namedBreakpoint = classifyBreakpointName(node);
  if (namedBreakpoint !== 'unknown') return namedBreakpoint;

  const width = widthOf(node);
  if (width >= 1180) return 'desktop';
  if (width >= 700) return 'tablet';
  if (width > 0 && width <= 600) return 'mobile';
  return 'unknown';
}

function classifyBreakpointName(node: RawNode): BreakpointName {
  const name = nodeName(node).toLowerCase();
  if (/desktop|десктоп|web|1920|1440|1366|1280/.test(name)) return 'desktop';
  if (/tablet|планшет|1024|834|820|768/.test(name)) return 'tablet';
  if (/mobile|моб|phone|iphone|android|430|414|393|390|375|360|320/.test(name)) return 'mobile';
  return 'unknown';
}

function breakpointIndex(value: BreakpointName): number {
  return BREAKPOINT_ORDER.indexOf(value);
}

function normalizeGroupName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/desktop|десктоп|tablet|планшет|mobile|моб|phone|iphone|android|web/g, '')
    .replace(/\b(1920|1440|1366|1280|1024|834|820|768|430|414|393|390|375|360|320)\b/g, '')
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || slugify(name);
}

function buildFigmaNodeUrl(originalInput: string, fileId: string, nodeId: string): string {
  const encodedNodeId = nodeId.replace(/:/g, '-');
  try {
    const url = new URL(originalInput);
    url.searchParams.set('node-id', encodedNodeId);
    return url.toString();
  } catch {
    return `https://www.figma.com/design/${fileId}/?node-id=${encodedNodeId}`;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'section';
}
