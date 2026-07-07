import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TokenCache, FetchCallback } from '../cache.js';
import { resolveParams } from '../utils/normalize-node-id.js';

const FRAMEWORKS = ['astro', 'react', 'next', 'auto'] as const;
const ARCHITECTURES = ['feature-sliced', 'project-native', 'auto'] as const;
const BREAKPOINT_ORDER = ['desktop', 'tablet', 'mobile', 'unknown'] as const;

type BreakpointName = (typeof BREAKPOINT_ORDER)[number];
type RawNode = Record<string, unknown>;

export const pixelPerfectOrchestratorSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL. A file/page/root link is enough; all frames/sections are inventoried automatically.'),
  node_id: z.string().optional().describe('Optional root node ID. If omitted, the whole file/page top-level frames are inventoried.'),
  project_root: z.string().optional().describe('Target React/Astro project root path.'),
  framework: z.enum(FRAMEWORKS).optional().default('auto').describe('Target framework: astro, react, next, or auto.'),
  architecture: z.enum(ARCHITECTURES).optional().default('feature-sliced').describe('Preferred code architecture.'),
  route: z.string().optional().describe('Live route, for example /pricing.'),
  page_url: z.string().optional().describe('Absolute live page URL. Overrides route/base_url in generated commands.'),
  base_url: z.string().optional().default('http://localhost:3000').describe('Base URL for generated route commands.'),
  selectors: z.array(z.string()).optional().describe('Optional stable live CSS selectors. If omitted, the runbook tells the agent to discover selectors per section.'),
  output_dir: z.string().optional().default('.figma/pixel-perfect-orchestration').describe('Directory for generated runbook artifacts.'),
  max_passes: z.number().optional().default(12).describe('Safety cap for one section before reporting an implementation blocker.'),
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
  mode: 'continuous_until_pass';
  runbook_path: string;
  inventory_path: string;
  figma_root: { file_id: string; node_id?: string };
  framework: string;
  architecture: string;
  sections: SectionInventory[];
  required_artifacts: string[];
  final_gate_commands: string[];
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

export async function handlePixelPerfectOrchestrator(
  params: PixelPerfectOrchestratorParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<PixelPerfectOrchestratorResult> {
  const { file_id: fileId, node_id: nodeId } = resolveParams(params.file_id, params.node_id);
  const outputDir = params.output_dir ?? '.figma/pixel-perfect-orchestration';
  fs.mkdirSync(outputDir, { recursive: true });

  const entry = await cache.getOrFetch(fileId, fetchFn);
  const rootGroups = collectRootGroups(entry.file.document as RawNode, entry.nodes.map((node) => node.raw as RawNode), nodeId);
  const sections = assignSelectors(rootGroups.flatMap((group) => collectSections(group, params.file_id, fileId)), params.selectors ?? []);
  const finalGateCommands = buildGateCommands(params, sections);
  const runbook = renderRunbook(params, fileId, nodeId, rootGroups, sections, finalGateCommands);
  const runbookPath = path.join(outputDir, 'RUNBOOK.md');
  const inventoryPath = path.join(outputDir, 'inventory.json');
  fs.writeFileSync(runbookPath, runbook, 'utf8');
  fs.writeFileSync(inventoryPath, JSON.stringify({ root_groups: rootGroups.map(serializeRootGroup), sections }, null, 2), 'utf8');

  return {
    mode: 'continuous_until_pass',
    runbook_path: runbookPath,
    inventory_path: inventoryPath,
    figma_root: { file_id: fileId, node_id: nodeId },
    framework: params.framework ?? 'auto',
    architecture: params.architecture ?? 'feature-sliced',
    sections,
    required_artifacts: [
      '.figma/tokens.json',
      '.figma/design-system.css',
      '.figma/page-analysis.md',
      '.figma/section screenshots for every section/breakpoint',
      '.figma/pixel-perfect-orchestration/inventory.json',
      '.pixel-perfect/figma-gate/*/REPORT.md',
      '.pixel-perfect/figma-gate/*/summary.json',
    ],
    final_gate_commands: finalGateCommands,
    acceptance: acceptanceContract(params),
  };
}

function collectRootGroups(document: RawNode, allNodes: RawNode[], nodeId: string | undefined): RootGroup[] {
  if (nodeId) {
    const root = allNodes.find((node) => node.id === nodeId);
    return root ? [{ name: nodeName(root), roots: [{ raw: root }] }] : [];
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

function buildGateCommands(params: PixelPerfectOrchestratorParams, sections: SectionInventory[]): string[] {
  const pageArg = params.page_url
    ? `--page-url "${params.page_url}"`
    : `--route "${params.route ?? '/'}" --base-url "${params.base_url ?? 'http://localhost:3000'}"`;
  const flags = [
    params.real_flow ?? true ? '--real-flow' : '',
    params.fail_on_review ?? true ? '--fail-on-review' : '',
  ].filter(Boolean).join(' ');

  if (sections.length === 0) {
    return [`figma-scaler gate ${pageArg} --selector "<stable-section-selector>" --figma-url "${params.file_id}" ${flags}`];
  }

  return sections.map((section) => {
    const selector = section.selector ?? `<selector-for-${slugify(section.name)}>`;
    const breakpointFlags = section.variants.filter((variant) => variant.breakpoint !== 'unknown');
    const figmaArgs = breakpointFlags.length > 1
      ? breakpointFlags.map((variant) => `--figma-url-${variant.breakpoint} "${variant.figma_url}"`).join(' ')
      : `--figma-url "${section.figma_url}"`;
    return `figma-scaler gate ${pageArg} --selector "${selector}" ${figmaArgs} ${flags}`;
  });
}

function renderRunbook(
  params: PixelPerfectOrchestratorParams,
  fileId: string,
  nodeId: string | undefined,
  rootGroups: RootGroup[],
  sections: SectionInventory[],
  finalGateCommands: string[],
): string {
  const lines = [
    '# Pixel-Perfect Orchestration Runbook',
    '',
    'Mode: continuous_until_pass',
    `Figma file: ${fileId}`,
    `Figma root node: ${nodeId ?? 'whole file/page inventory'}`,
    `Framework: ${params.framework ?? 'auto'}`,
    `Architecture: ${params.architecture ?? 'feature-sliced'}`,
    `Project root: ${params.project_root ?? 'current workspace'}`,
    `Max passes before blocker report: ${params.max_passes ?? 12}`,
    '',
    '## Non-Stop Contract',
    '',
    ...acceptanceContract(params).map((item) => `- ${item}`),
    '',
    '## Full-Page Auto-Discovery',
    '',
    '- A single Figma file/page/root link is enough. Do not ask the user for every block link.',
    '- Inventory every top-level page/frame and every direct child section before editing.',
    '- If root frames are desktop/tablet/mobile variants, group them as breakpoints and inspect each breakpoint-specific section.',
    '- If a Figma node describes one functional block instead of a page, treat the block variants as the full scope and still verify all available breakpoints.',
    '- If inventory contains multiple pages, process every relevant page/frame unless the user explicitly narrows the scope.',
    '',
    '## Mandatory Figma Extraction',
    '',
    '- read_design_strategy prompt',
    '- layout_strategy prompt',
    '- get_document_structure for whole-file/page frame inventory',
    '- get_screenshot for each root frame/breakpoint',
    '- get_design_tokens save_to=".figma/tokens.json"',
    '- get_css_variables save_to=".figma/design-system.css"',
    '- get_frame_overview for every root frame and breakpoint frame',
    '- batch_screenshots for every root frame/breakpoint section list',
    '- get_node_info save_to=".figma/<section>/<breakpoint>.json" for every edited section/breakpoint',
    '- export_node_image for exact SVG/PNG assets instead of approximations',
    '- export_page_analysis save_to=".figma/page-analysis.md" for design notes',
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
    ...finalGateCommands.map((command) => `- ${command}`),
    '',
  );

  return `${lines.join('\n')}\n`;
}

function acceptanceContract(params: PixelPerfectOrchestratorParams): string[] {
  return [
    'Do not stop after analysis, first draft, or partial visual similarity; continue until strict gates pass or a concrete blocker is proven.',
    'Final closure requires fresh screenshots captured after the last code edit.',
    `Final gate must use ${params.real_flow ?? true ? '--real-flow' : 'the configured strict viewport set'}${params.fail_on_review ?? true ? ' and --fail-on-review' : ''}.`,
    'Any FAIL or REVIEW on an edited selector/breakpoint is non-closable unless classified as renderer_only_drift, content_drift, asset_blocker, access_blocker, or implementation_blocker.',
    'Do not invent responsive layouts when Figma has tablet/mobile nodes; inspect the breakpoint-specific nodes.',
    'Do not hardcode arbitrary colors, fonts, spacing, shadows, or radii when project/Figma tokens exist.',
  ];
}

function architectureRules(params: PixelPerfectOrchestratorParams): string[] {
  const framework = params.framework ?? 'auto';
  return [
    'Discover existing tokens, fonts, theme files, public assets, shared UI, and page composition before editing.',
    'Use Figma token_hints and applied_styles to map values onto existing design-system variables/classes.',
    'If token delta <= 2px, prefer the existing token; if delta > 2px, use raw value only with an explicit note in the audit artifact.',
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
  const name = nodeName(node).toLowerCase();
  if (/desktop|десктоп|web|1920|1440|1366|1280/.test(name)) return 'desktop';
  if (/tablet|планшет|1024|834|820|768/.test(name)) return 'tablet';
  if (/mobile|моб|phone|iphone|android|430|414|393|390|375|360|320/.test(name)) return 'mobile';

  const width = widthOf(node);
  if (width >= 1180) return 'desktop';
  if (width >= 700) return 'tablet';
  if (width > 0 && width <= 600) return 'mobile';
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
