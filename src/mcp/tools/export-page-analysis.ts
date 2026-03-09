/**
 * MCP Tool: export_page_analysis
 * Generate comprehensive page analysis saved to file.
 * Includes structure, CSS mappings, component references, and design annotations.
 * Claude reads the file section-by-section instead of loading everything into context.
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Node } from '@figma/rest-api-spec';
import type { TokenCache, FetchCallback } from '../cache.js';
import type { NodeDetail } from '../../types/mcp.js';
import type { AllTokens } from '../../types/tokens.js';
import { mapNodeToDetail } from '../mappers/css-mapper.js';
import { collapseSvgGroups } from '../utils/svg-collapse.js';
import { buildNodeSummary } from '../utils/node-summary.js';
import { resolveParams } from '../utils/normalize-node-id.js';

export const exportPageAnalysisSchema = {
  file_id: z.string().describe('Figma file ID or full Figma URL (e.g. https://www.figma.com/design/FILE_ID/...)'),
  node_id: z.string().optional().describe('Root frame node ID (usually a page or screen frame). Auto-extracted from URL if not provided.'),
  output_path: z
    .string()
    .optional()
    .default('.figma/page-analysis.md')
    .describe('Output file path (.md or .json)'),
  format: z
    .enum(['markdown', 'json'])
    .optional()
    .default('markdown')
    .describe('Output format: markdown (human/AI readable) or json (structured)'),
  section_depth: z
    .number()
    .optional()
    .default(4)
    .describe('How deep to analyze each section (default: 4)'),
};

export interface ExportPageAnalysisParams {
  file_id: string;
  node_id?: string;
  output_path?: string;
  format?: 'markdown' | 'json';
  section_depth?: number;
}

export interface PageAnalysisResult {
  output_path: string;
  file_size_bytes: number;
  format: string;
  sections_count: number;
  sections: Array<{
    node_id: string;
    name: string;
    line_start: number;
  }>;
  design_notes: string[];
}

interface SectionAnalysis {
  node_id: string;
  name: string;
  node_type: string;
  dimensions: { width: number; height: number };
  position: { x: number; y: number };
  visible: boolean;
  detail: NodeDetail;
}

/**
 * Handle export_page_analysis request.
 */
export async function handleExportPageAnalysis(
  params: ExportPageAnalysisParams,
  cache: TokenCache,
  fetchFn: FetchCallback,
): Promise<PageAnalysisResult> {
  const { file_id: fileId, node_id: nodeId } = resolveParams(params.file_id, params.node_id);
  if (!nodeId) {
    throw new Error('node_id is required. Provide it explicitly or include node-id in the Figma URL.');
  }

  const entry = await cache.getOrFetch(fileId, fetchFn);

  const node = entry.nodes.find((n) => n.node_id === nodeId);
  if (!node) {
    throw new Error(
      `Node "${nodeId}" not found in file "${fileId}". ` +
        `Use get_document_structure to discover available node IDs.`,
    );
  }

  const raw = node.raw as Record<string, unknown>;
  const rawChildren = (raw.children ?? []) as Node[];
  const depth = params.section_depth ?? 4;

  // Analyze each section
  const fileCtx = { styles: entry.file.styles, components: entry.file.components };
  const sections: SectionAnalysis[] = rawChildren.map((child) => {
    const childR = child as unknown as Record<string, unknown>;
    let detail = mapNodeToDetail(child, entry.tokens, depth, fileCtx);
    detail = collapseSvgGroups(detail);

    const bbox = childR.absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    return {
      node_id: (childR.id as string) ?? '',
      name: (childR.name as string) ?? '',
      node_type: (childR.type as string) ?? '',
      dimensions: { width: Math.round(bbox?.width ?? 0), height: Math.round(bbox?.height ?? 0) },
      position: { x: Math.round(bbox?.x ?? 0), y: Math.round(bbox?.y ?? 0) },
      visible: childR.visible !== false,
      detail,
    };
  });

  // Collect design notes (issues/attention points)
  const designNotes = collectDesignNotes(sections, entry.tokens);

  const format = params.format ?? 'markdown';
  const outputPath = params.output_path ?? '.figma/page-analysis.md';

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let content: string;
  const lineMap: Array<{ node_id: string; name: string; line_start: number }> = [];

  if (format === 'markdown') {
    content = generateMarkdownAnalysis(sections, designNotes, entry, params, lineMap);
  } else {
    content = generateJsonAnalysis(sections, designNotes, entry, params);
    // For JSON, line numbers aren't meaningful — use byte offsets approximation
    sections.forEach((s, i) => {
      lineMap.push({ node_id: s.node_id, name: s.name, line_start: i });
    });
  }

  fs.writeFileSync(outputPath, content, 'utf-8');

  return {
    output_path: outputPath,
    file_size_bytes: Buffer.byteLength(content, 'utf-8'),
    format,
    sections_count: sections.length,
    sections: lineMap,
    design_notes: designNotes,
  };
}

// ─── Design Notes Collection ────────────────────────────

function collectDesignNotes(sections: SectionAnalysis[], tokens: AllTokens): string[] {
  const notes: string[] = [];

  for (const section of sections) {
    if (!section.visible) {
      notes.push(`HIDDEN: Section "${section.name}" (${section.node_id}) is not visible`);
    }

    walkForNotes(section.detail, section.name, notes);
  }

  return notes;
}

function walkForNotes(node: NodeDetail, sectionName: string, notes: string[]): void {
  // Background images with specific positioning
  for (const fill of node.fills) {
    if (fill.fill_type === 'image' && fill.scale_mode) {
      notes.push(
        `IMAGE_FILL: "${node.name}" in section "${sectionName}" has background image ` +
          `(scale: ${fill.scale_mode} → CSS: ${fill.scale_mode_css}). ` +
          `Export with export_node_image and verify positioning.`,
      );
    }
  }

  // Text with mixed colors (partial coloring like blue accents)
  if (node.text_segments && node.text_segments.length > 1) {
    const uniqueColors = new Set(node.text_segments.map((s) => s.color_hex));
    if (uniqueColors.size > 1) {
      const colorList = [...uniqueColors].join(', ');
      notes.push(
        `MIXED_TEXT_COLOR: "${node.name}" in "${sectionName}" has multi-colored text ` +
          `(${colorList}). Implement with <span> tags for each color segment.`,
      );
    }
  }

  // Absolute positioned elements (floating decorations, background shapes)
  if (node.position === 'absolute' && node.children.length === 0) {
    const hasFill = node.fills.length > 0;
    const isDecorative = hasFill && !node.text_content;
    if (isDecorative) {
      notes.push(
        `ABSOLUTE_ELEMENT: "${node.name}" in "${sectionName}" is absolutely positioned at ` +
          `(${Math.round(node.x)}, ${Math.round(node.y)}) with size ${Math.round(node.width)}x${Math.round(node.height)}. ` +
          `This is likely a decorative/background element. Verify exact position.`,
      );
    }
  }

  // Component instances — reference main component
  if (node.component_info?.is_instance) {
    notes.push(
      `COMPONENT_INSTANCE: "${node.name}" in "${sectionName}" is an instance of ` +
        `component "${node.component_info.component_name}" (${node.component_info.component_id}). ` +
        `Use get_node_info on the main component to understand the full design.`,
    );
  }

  // Low opacity (might be decorative overlay)
  if (node.opacity !== undefined && node.opacity < 0.5) {
    notes.push(
      `LOW_OPACITY: "${node.name}" in "${sectionName}" has opacity ${node.opacity}. ` +
        `This may be a decorative overlay or subtle background element.`,
    );
  }

  // Blend modes (visual effects that need attention)
  if (node.blend_mode_css) {
    notes.push(
      `BLEND_MODE: "${node.name}" in "${sectionName}" uses blend mode: ${node.blend_mode_css}. ` +
        `Apply as mix-blend-mode in CSS.`,
    );
  }

  // Overflow hidden (clipping)
  if (node.overflow === 'hidden' && node.children.length > 0) {
    // Check if any children extend beyond parent bounds
    for (const child of node.children) {
      if (
        child.x < node.x ||
        child.y < node.y ||
        child.x + child.width > node.x + node.width ||
        child.y + child.height > node.y + node.height
      ) {
        notes.push(
          `CLIPPED_CONTENT: "${node.name}" in "${sectionName}" clips child "${child.name}" ` +
            `that extends beyond its bounds. Ensure overflow: hidden is set.`,
        );
        break;
      }
    }
  }

  // Token hints — non-standard values
  if (node.token_hints && node.token_hints.length > 0) {
    for (const hint of node.token_hints) {
      notes.push(
        `NON_STANDARD_VALUE: "${node.name}" in "${sectionName}" has ${hint.property}: ${hint.actual_value} ` +
          `(nearest token: ${hint.nearest_token} = ${hint.nearest_value}, delta: ${hint.delta > 0 ? '+' : ''}${hint.delta}). ` +
          `Check if this is intentional or a designer rounding error.`,
      );
    }
  }

  // Inconsistent per-corner radii
  if (node.corner_radii) {
    const unique = [...new Set(node.corner_radii.filter((v) => v > 0))];
    if (unique.length > 1) {
      notes.push(
        `INCONSISTENT_RADIUS: "${node.name}" in "${sectionName}" has non-uniform border-radius: ` +
          `[${node.corner_radii.join(', ')}]px. Verify each corner value is intentional.`,
      );
    }
  }

  // Orphan colors (fills without token match)
  for (const fill of node.fills) {
    if (fill.fill_type === 'solid' && fill.value_hex && !fill.css_variable) {
      notes.push(
        `ORPHAN_COLOR: "${node.name}" in "${sectionName}" uses color ${fill.value_hex} ` +
          `which doesn't match any design token. Add to design system or use nearest token.`,
      );
    }
  }

  // Text overflow detection (text extends beyond its frame)
  if (node.text_content && node.children.length === 0) {
    // Simple heuristic: if the parent clips and text exists, flag it
    // More precise: check if text node dimensions seem too small for content
    const charEstimate = node.text_content.length;
    const fontSize = node.typography?.font_size ?? 14;
    const estimatedWidth = charEstimate * fontSize * 0.6;
    if (estimatedWidth > node.width * 2 && node.width > 0) {
      notes.push(
        `TEXT_OVERFLOW: "${node.name}" in "${sectionName}" has ${charEstimate} chars ` +
          `in a ${Math.round(node.width)}px wide container. Verify text-overflow/wrapping.`,
      );
    }
  }

  // Missing auto-layout detection (children appear aligned but no auto-layout)
  if (!node.layout && node.children.length >= 2) {
    const flowChildren = node.children.filter((c) => c.position !== 'absolute' && c.visible);
    if (flowChildren.length >= 2) {
      // Check if children are vertically stacked (similar x, increasing y)
      const sameX = flowChildren.every((c) => Math.abs(c.x - flowChildren[0].x) < 2);
      const yIncreasing = flowChildren.every((c, i) =>
        i === 0 || c.y >= flowChildren[i - 1].y,
      );
      // Check if children are horizontally arranged (similar y, increasing x)
      const sameY = flowChildren.every((c) => Math.abs(c.y - flowChildren[0].y) < 2);
      const xIncreasing = flowChildren.every((c, i) =>
        i === 0 || c.x >= flowChildren[i - 1].x,
      );

      if ((sameX && yIncreasing) || (sameY && xIncreasing)) {
        const direction = sameX ? 'vertically' : 'horizontally';
        notes.push(
          `MISSING_AUTO_LAYOUT: "${node.name}" in "${sectionName}" has ${flowChildren.length} ` +
            `children arranged ${direction} but no auto-layout. Use flexbox for this container.`,
        );
      }
    }
  }

  // Recurse
  for (const child of node.children) {
    walkForNotes(child, sectionName, notes);
  }
}

// ─── Markdown Generation ────────────────────────────────

function generateMarkdownAnalysis(
  sections: SectionAnalysis[],
  designNotes: string[],
  entry: { file_id: string; file: { name: string }; tokens: AllTokens },
  params: ExportPageAnalysisParams,
  lineMap: Array<{ node_id: string; name: string; line_start: number }>,
): string {
  const lines: string[] = [];

  lines.push(`# Page Analysis: ${entry.file.name}`);
  lines.push(`**File ID:** ${entry.file_id}`);
  lines.push(`**Root Node:** ${params.node_id ?? ''}`);
  lines.push(`**Sections:** ${sections.length}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');

  // Design notes first — most important for accuracy
  if (designNotes.length > 0) {
    lines.push('## Design Notes (Attention Required)');
    lines.push('');
    for (const note of designNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  // Table of contents
  lines.push('## Sections');
  lines.push('');
  for (const s of sections) {
    const visibility = s.visible ? '' : ' (HIDDEN)';
    lines.push(`- [${s.name}${visibility}](#section-${sanitizeAnchor(s.name)}) — ${s.dimensions.width}x${s.dimensions.height} ${s.node_type}`);
  }
  lines.push('');

  // Each section
  for (const section of sections) {
    const lineStart = lines.length + 1;
    lineMap.push({ node_id: section.node_id, name: section.name, line_start: lineStart });

    lines.push(`---`);
    lines.push(`## Section: ${section.name} {#section-${sanitizeAnchor(section.name)}}`);
    lines.push(`- **Node ID:** ${section.node_id}`);
    lines.push(`- **Type:** ${section.node_type}`);
    lines.push(`- **Dimensions:** ${section.dimensions.width}x${section.dimensions.height}`);
    lines.push(`- **Position:** (${section.position.x}, ${section.position.y})`);
    lines.push(`- **Visible:** ${section.visible}`);
    lines.push('');

    // Write the full node detail as JSON block
    lines.push('### Structure');
    lines.push('```json');
    lines.push(JSON.stringify(section.detail, null, 2));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function sanitizeAnchor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── JSON Generation ────────────────────────────────────

function generateJsonAnalysis(
  sections: SectionAnalysis[],
  designNotes: string[],
  entry: { file_id: string; file: { name: string }; tokens: AllTokens },
  params: ExportPageAnalysisParams,
): string {
  const result = {
    file_name: entry.file.name,
    file_id: entry.file_id,
    root_node_id: params.node_id ?? '',
    generated_at: new Date().toISOString(),
    design_notes: designNotes,
    sections: sections.map((s) => ({
      node_id: s.node_id,
      name: s.name,
      node_type: s.node_type,
      dimensions: s.dimensions,
      position: s.position,
      visible: s.visible,
      detail: s.detail,
    })),
  };

  return JSON.stringify(result, null, 2);
}
