/**
 * T007 — CSS mapper tests.
 *
 * Coverage:
 * - Color match: fill hex → ColorToken css_variable
 * - Typography match: font_family + font_size + font_weight → TypographyToken css variables
 * - Spacing match: padding/gap values → SpacingToken css_variable
 * - Radius match: cornerRadius → RadiusToken css_variable
 * - Shadow match: effect → ShadowToken css_variable
 * - No-match: returns null css_variable when no token matches
 * - Depth limiting: children beyond max depth are truncated
 */

import { describe, it, expect } from 'vitest';
import { mapNodeToDetail } from '../../../src/mcp/mappers/css-mapper.js';
import { generateCSS } from '../../../src/writers/css.js';
import type { AllTokens } from '../../../src/types/tokens.js';
import type { Node } from '@figma/rest-api-spec';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tokens: AllTokens = {
  colors: [
    {
      name: 'brand-primary',
      node_id: '1:1',
      source_type: 'fill',
      value_hex: '#2563eb',
      value_rgba: { r: 37, g: 99, b: 235, a: 1 },
      opacity: 1,
      usage_count: 5,
      used_in_types: ['RECTANGLE'],
    },
    {
      name: 'text-dark',
      node_id: '1:2',
      source_type: 'fill',
      value_hex: '#111827',
      value_rgba: { r: 17, g: 24, b: 39, a: 1 },
      opacity: 1,
      usage_count: 3,
      used_in_types: ['TEXT'],
    },
  ],
  gradients: [],
  typography: [
    {
      name: 'heading-xl',
      node_id: '1:3',
      font_family: 'Inter',
      font_size: 32,
      font_weight: 700,
      font_style: 'normal',
      line_height: '40px',
      line_height_px: 40,
      letter_spacing: -0.5,
      text_align_horizontal: 'LEFT',
      text_case: 'ORIGINAL',
      text_decoration: 'NONE',
      sample_text: 'Heading',
      usage_count: 2,
    },
  ],
  spacing: [
    { value: 8, source: 'padding', usage_count: 4 },
    { value: 16, source: 'padding', usage_count: 3 },
    { value: 24, source: 'item_spacing', usage_count: 2 },
  ],
  radii: [
    { value: 4, is_per_corner: false, usage_count: 3 },
    { value: 8, is_per_corner: false, usage_count: 2 },
  ],
  shadows: [
    {
      name: 'shadow-sm',
      node_id: '1:4',
      shadow_type: 'DROP_SHADOW',
      offset_x: 0,
      offset_y: 1,
      blur: 2,
      spread: 0,
      color_hex: '#0000001a',
      color_rgba: { r: 0, g: 0, b: 0, a: 0.1 },
      css: '0px 1px 2px 0px rgba(0, 0, 0, 0.1)',
    },
  ],
  images: [],
  components: [],
};

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

/** Helper to create a minimal raw Figma node. */
function makeNode(overrides: Record<string, unknown> = {}): Node {
  return {
    id: '10:1',
    name: 'TestNode',
    type: 'FRAME',
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
    children: [],
    ...overrides,
  } as unknown as Node;
}

// ---------------------------------------------------------------------------
// Tests — Color match
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — color match', () => {
  it('matches fill hex to ColorToken and returns css_variable', () => {
    const node = makeNode({
      fills: [{ type: 'SOLID', color: { r: 37 / 255, g: 99 / 255, b: 235 / 255, a: 1 }, visible: true }],
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.fills).toHaveLength(1);
    expect(detail.fills[0].value_hex).toBe('#2563eb');
    expect(detail.fills[0].css_variable).toBe('var(--color-brand-primary)');
    expect(detail.fills[0].css_property).toBe('background-color');
  });

  it('matches stroke color to ColorToken', () => {
    const node = makeNode({
      strokes: [{ type: 'SOLID', color: { r: 17 / 255, g: 24 / 255, b: 39 / 255, a: 1 }, visible: true }],
      strokeWeight: 2,
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.strokes).toHaveLength(1);
    expect(detail.strokes[0].value_hex).toBe('#111827');
    expect(detail.strokes[0].css_variable).toBe('var(--color-text-dark)');
    expect(detail.strokes[0].css_property).toBe('border-color');
  });

  it('returns null css_variable for unmatched fill color', () => {
    const node = makeNode({
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }],
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.fills).toHaveLength(1);
    expect(detail.fills[0].css_variable).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — Typography match
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — typography match', () => {
  it('matches TEXT node font properties to TypographyToken css variables', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'Hello World',
      style: {
        fontFamily: 'Inter',
        fontSize: 32,
        fontWeight: 700,
        lineHeightPx: 40,
        letterSpacing: -0.5,
        textAlignHorizontal: 'LEFT',
        textCase: 'ORIGINAL',
        textDecoration: 'NONE',
      },
      fills: [{ type: 'SOLID', color: { r: 17 / 255, g: 24 / 255, b: 39 / 255, a: 1 }, visible: true }],
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.typography).not.toBeNull();
    expect(detail.typography!.font_family).toBe('Inter');
    expect(detail.typography!.font_family_css).toBe('var(--font-family-inter)');
    expect(detail.typography!.font_size).toBe(32);
    expect(detail.typography!.font_size_css).toBe('var(--font-size-32)');
    expect(detail.typography!.font_weight).toBe(700);
    expect(detail.typography!.font_weight_css).toBe('var(--font-weight-700)');
    expect(detail.typography!.color_hex).toBe('#111827');
    expect(detail.typography!.color_css).toBe('var(--color-text-dark)');
    expect(detail.text_content).toBe('Hello World');
  });

  it('returns null typography for non-TEXT nodes', () => {
    const node = makeNode({ type: 'FRAME' });
    const detail = mapNodeToDetail(node, tokens);
    expect(detail.typography).toBeNull();
    expect(detail.text_content).toBeNull();
  });

  it('returns null css variables when typography does not match', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'No match',
      style: {
        fontFamily: 'Arial',
        fontSize: 99,
        fontWeight: 300,
        lineHeightPx: 100,
        letterSpacing: 0,
        textAlignHorizontal: 'CENTER',
        textCase: 'ORIGINAL',
        textDecoration: 'NONE',
      },
      fills: [],
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.typography).not.toBeNull();
    expect(detail.typography!.font_family_css).toBeNull();
    expect(detail.typography!.font_size_css).toBeNull();
    expect(detail.typography!.font_weight_css).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — Spacing match
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — spacing match', () => {
  it('matches auto-layout padding to SpacingToken css variables', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      itemSpacing: 8,
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'MIN',
      layoutWrap: 'NO_WRAP',
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.layout).not.toBeNull();
    expect(detail.layout!.mode).toBe('HORIZONTAL');
    expect(detail.layout!.padding.top).toBe(16);
    expect(detail.layout!.item_spacing).toBe(8);
    expect(detail.layout!.item_spacing_css).toBe('var(--spacing-8)');

    // Padding CSS mappings
    const topMapping = detail.layout!.padding_css.find(
      (p) => p.css_property === 'padding-top',
    );
    expect(topMapping).toBeDefined();
    expect(topMapping!.css_variable).toBe('var(--spacing-16)');
  });

  it('returns null layout for nodes without auto-layout', () => {
    const node = makeNode({});
    const detail = mapNodeToDetail(node, tokens);
    expect(detail.layout).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — Radius match
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — radius match', () => {
  it('matches cornerRadius to RadiusToken css_variable', () => {
    const node = makeNode({
      cornerRadius: 8,
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.corner_radius).not.toBeNull();
    expect(detail.corner_radius!.value).toBe(8);
    expect(detail.corner_radius!.css_variable).toBe('var(--radius-8)');
    expect(detail.corner_radius!.css_property).toBe('border-radius');
  });

  it('returns null css_variable for unmatched radius', () => {
    const node = makeNode({
      cornerRadius: 99,
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.corner_radius).not.toBeNull();
    expect(detail.corner_radius!.value).toBe(99);
    expect(detail.corner_radius!.css_variable).toBeNull();
  });

  it('returns null corner_radius when node has no cornerRadius', () => {
    const node = makeNode({});
    const detail = mapNodeToDetail(node, tokens);
    expect(detail.corner_radius).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — Shadow match
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — shadow match', () => {
  it('matches DROP_SHADOW effect to ShadowToken css_variable', () => {
    const node = makeNode({
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 0, y: 1 },
          radius: 2,
          spread: 0,
          color: { r: 0, g: 0, b: 0, a: 0.1 },
        },
      ],
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.effects).toHaveLength(1);
    expect(detail.effects[0].effect_type).toBe('DROP_SHADOW');
    expect(detail.effects[0].css_variable).toBe('var(--shadow-sm)');
    expect(detail.effects[0].css_property).toBe('box-shadow');
  });

  it('returns null css_variable for unmatched shadow', () => {
    const node = makeNode({
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 10, y: 20 },
          radius: 30,
          spread: 5,
          color: { r: 1, g: 0, b: 0, a: 0.5 },
        },
      ],
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.effects).toHaveLength(1);
    expect(detail.effects[0].css_variable).toBeNull();
  });

  it('maps LAYER_BLUR to filter css property', () => {
    const node = makeNode({
      effects: [
        {
          type: 'LAYER_BLUR',
          visible: true,
          radius: 4,
        },
      ],
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.effects).toHaveLength(1);
    expect(detail.effects[0].css_property).toBe('filter');
  });
});

describe('mapNodeToDetail — generated CSS token names', () => {
  it('only returns references declared by the writer after sanitization and collisions', () => {
    const trickyTokens: AllTokens = {
      ...emptyTokens,
      colors: [
        { ...tokens.colors[0], name: 'Brand/Primary' },
        { ...tokens.colors[1], name: 'Brand Primary' },
      ],
      typography: [
        { ...tokens.typography[0], font_family: 'Bad "Font/\nName' },
        { ...tokens.typography[0], name: 'body', font_family: 'Bad Font Name' },
      ],
      spacing: [
        { value: 8, source: 'padding', usage_count: 2 },
        { value: 8, source: 'item_spacing', usage_count: 1 },
      ],
      radii: [
        { value: 8, is_per_corner: false, usage_count: 2 },
        { value: 8, is_per_corner: true, usage_count: 1 },
      ],
      shadows: [{
        ...tokens.shadows[0],
        name: 'color brand primary',
      }],
    };
    const node = makeNode({
      type: 'TEXT',
      characters: 'Token names',
      style: {
        fontFamily: 'Bad Font Name',
        fontSize: 32,
        fontWeight: 700,
      },
      fills: [{
        type: 'SOLID',
        color: { r: 17 / 255, g: 24 / 255, b: 39 / 255, a: 1 },
        visible: true,
      }],
      effects: [{
        type: 'DROP_SHADOW',
        visible: true,
        offset: { x: 0, y: 1 },
        radius: 2,
        spread: 0,
      }],
      cornerRadius: 8,
      layoutMode: 'HORIZONTAL',
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
      itemSpacing: 8,
    });

    const detail = mapNodeToDetail(node, trickyTokens);
    const css = generateCSS(trickyTokens);
    const declarations = new Set(
      [...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((match) => match[1]),
    );
    const references = [
      ...JSON.stringify(detail).matchAll(/var\(--([a-z0-9-]+)\)/g),
    ].map((match) => match[1]);

    expect(detail.fills[0].css_variable).toBe('var(--color-brand-primary-2)');
    expect(detail.typography?.font_family_css).toBe('var(--font-family-bad-font-name-2)');
    expect(detail.corner_radius?.css_variable).toBe('var(--radius-8-uniform)');
    expect(detail.effects[0].css_variable).toBe('var(--color-brand-primary-3)');
    expect(css).toContain('--radius-8-per-corner: 8px;');
    expect(references.length).toBeGreaterThan(0);
    expect(references.every((name) => declarations.has(name))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — Depth limiting
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — depth limiting', () => {
  it('traverses children up to specified depth', () => {
    const deepNode = makeNode({
      id: 'root',
      children: [
        makeNode({
          id: 'child-1',
          children: [
            makeNode({
              id: 'grandchild-1',
              children: [
                makeNode({ id: 'great-grandchild-1', children: [] }),
              ],
            }),
          ],
        }),
      ],
    });

    // Depth 2: root (0) → child (1) → grandchild (2), no great-grandchild
    const detail = mapNodeToDetail(deepNode, tokens, 2);

    expect(detail.children).toHaveLength(1);
    expect(detail.children[0].children).toHaveLength(1);
    expect(detail.children[0].children[0].children).toHaveLength(0);
  });

  it('depth 0 returns no children', () => {
    const node = makeNode({
      children: [makeNode({ id: 'child-1' })],
    });

    const detail = mapNodeToDetail(node, tokens, 0);
    expect(detail.children).toHaveLength(0);
  });

  it('uses default depth of 5', () => {
    const node = makeNode({ children: [] });
    const detail = mapNodeToDetail(node, tokens);
    // Should not throw; default depth should be used
    expect(detail).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — Basic node properties
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — basic properties', () => {
  it('extracts node_id, name, node_type, dimensions, and visibility', () => {
    const node = makeNode({
      id: '42:5',
      name: 'MyFrame',
      type: 'FRAME',
      visible: true,
      absoluteBoundingBox: { x: 10, y: 20, width: 300, height: 150 },
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.node_id).toBe('42:5');
    expect(detail.name).toBe('MyFrame');
    expect(detail.node_type).toBe('FRAME');
    expect(detail.width).toBe(300);
    expect(detail.height).toBe(150);
    expect(detail.canvas_x).toBe(10);
    expect(detail.canvas_y).toBe(20);
    expect(detail.parent_relative_x).toBeNull();
    expect(detail.parent_relative_y).toBeNull();
    // Deprecated aliases remain canvas/global coordinates.
    expect(detail.x).toBe(10);
    expect(detail.y).toBe(20);
    expect(detail.visible).toBe(true);
  });

  it('handles hidden nodes', () => {
    const node = makeNode({ visible: false });
    const detail = mapNodeToDetail(node, tokens);
    expect(detail.visible).toBe(false);
  });

  it('returns empty arrays for nodes without fills/strokes/effects', () => {
    const node = makeNode({});
    const detail = mapNodeToDetail(node, tokens);
    expect(detail.fills).toEqual([]);
    expect(detail.strokes).toEqual([]);
    expect(detail.effects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests — Nested geometry and layout participation
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — nested geometry', () => {
  it('exposes canvas and immediate-parent coordinates at every nested level', () => {
    const node = makeNode({
      id: 'root',
      absoluteBoundingBox: { x: 100, y: 200, width: 500, height: 400 },
      children: [
        makeNode({
          id: 'child',
          absoluteBoundingBox: { x: 132, y: 245, width: 200, height: 100 },
          relativeTransform: [[1, 0, 30], [0, 1, 40]],
          children: [
            makeNode({
              id: 'grandchild',
              absoluteBoundingBox: { x: 150, y: 260, width: 20, height: 10 },
              relativeTransform: [[1, 0, 7], [0, 1, 9]],
            }),
          ],
        }),
      ],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    const child = detail.children[0];
    const grandchild = child.children[0];

    expect(detail.parent_relative_x).toBeNull();
    expect(detail.parent_relative_y).toBeNull();
    expect(child).toMatchObject({
      canvas_x: 132,
      canvas_y: 245,
      parent_relative_x: 30,
      parent_relative_y: 40,
      x: 132,
      y: 245,
    });
    expect(grandchild).toMatchObject({
      canvas_x: 150,
      canvas_y: 260,
      parent_relative_x: 7,
      parent_relative_y: 9,
      x: 150,
      y: 260,
    });
  });

  it('falls back to bounding-box differences when relativeTransform is absent', () => {
    const node = makeNode({
      absoluteBoundingBox: { x: 80, y: 120, width: 300, height: 200 },
      children: [
        makeNode({
          absoluteBoundingBox: { x: 95, y: 148, width: 50, height: 40 },
        }),
      ],
    });

    const child = mapNodeToDetail(node, emptyTokens).children[0];
    expect(child.parent_relative_x).toBe(15);
    expect(child.parent_relative_y).toBe(28);
  });
});

describe('mapNodeToDetail — child layout participation', () => {
  it('marks children of non-auto-layout frames as manually positioned', () => {
    const node = makeNode({
      layoutMode: 'NONE',
      children: [makeNode({ layoutPositioning: 'AUTO' })],
    });

    const child = mapNodeToDetail(node, emptyTokens).children[0];
    expect(child.position).toBe('absolute');
  });

  it('distinguishes auto-layout participants from absolute children', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      children: [
        makeNode({ id: 'flow-child', layoutPositioning: 'AUTO' }),
        makeNode({ id: 'manual-child', layoutPositioning: 'ABSOLUTE' }),
      ],
    });

    const [flowChild, manualChild] = mapNodeToDetail(node, emptyTokens).children;
    expect(flowChild.position).toBe('relative');
    expect(manualChild.position).toBe('absolute');
  });
});

// ---------------------------------------------------------------------------
// Tests — Text segments (mixed styling)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — text segments', () => {
  it('parses characterStyleOverrides into text segments with different colors', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'HelloWorld',
      style: {
        fontFamily: 'Inter',
        fontSize: 32,
        fontWeight: 700,
        lineHeightPx: 40,
        letterSpacing: 0,
        textAlignHorizontal: 'LEFT',
        textCase: 'ORIGINAL',
        textDecoration: 'NONE',
      },
      fills: [{ type: 'SOLID', color: { r: 17 / 255, g: 24 / 255, b: 39 / 255, a: 1 }, visible: true }],
      characterStyleOverrides: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
      styleOverrideTable: {
        '1': {
          fills: [{ type: 'SOLID', color: { r: 37 / 255, g: 99 / 255, b: 235 / 255, a: 1 }, visible: true }],
        },
      },
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.text_segments).not.toBeNull();
    expect(detail.text_segments).toHaveLength(2);

    // First segment: "Hello" with default dark color
    expect(detail.text_segments![0].text).toBe('Hello');
    expect(detail.text_segments![0].start).toBe(0);
    expect(detail.text_segments![0].end).toBe(5);
    expect(detail.text_segments![0].color_hex).toBe('#111827');
    expect(detail.text_segments![0].color_css).toBe('var(--color-text-dark)');

    // Second segment: "World" with brand-primary blue
    expect(detail.text_segments![1].text).toBe('World');
    expect(detail.text_segments![1].start).toBe(5);
    expect(detail.text_segments![1].end).toBe(10);
    expect(detail.text_segments![1].color_hex).toBe('#2563eb');
    expect(detail.text_segments![1].color_css).toBe('var(--color-brand-primary)');
  });

  it('returns null text_segments for TEXT nodes without characterStyleOverrides', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'Plain text',
      style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400 },
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true }],
    });

    const detail = mapNodeToDetail(node, tokens);
    expect(detail.text_segments).toBeNull();
  });

  it('returns null text_segments when all overrides are 0 (uniform style)', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'Same',
      style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400 },
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true }],
      characterStyleOverrides: [0, 0, 0, 0],
      styleOverrideTable: {},
    });

    const detail = mapNodeToDetail(node, tokens);
    expect(detail.text_segments).toBeNull();
  });

  it('returns null text_segments for non-TEXT nodes', () => {
    const node = makeNode({ type: 'FRAME' });
    const detail = mapNodeToDetail(node, tokens);
    expect(detail.text_segments).toBeNull();
  });

  it('includes font overrides per segment when styleOverrideTable has font properties', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'NormalBold',
      style: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 400,
      },
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true }],
      characterStyleOverrides: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
      styleOverrideTable: {
        '1': {
          fontWeight: 700,
          fontSize: 32,
          fills: [{ type: 'SOLID', color: { r: 37 / 255, g: 99 / 255, b: 235 / 255, a: 1 }, visible: true }],
        },
      },
    });

    const detail = mapNodeToDetail(node, tokens);

    expect(detail.text_segments).not.toBeNull();
    expect(detail.text_segments).toHaveLength(2);

    expect(detail.text_segments![0].font_weight).toBe(400);
    expect(detail.text_segments![0].font_size).toBe(16);

    expect(detail.text_segments![1].font_weight).toBe(700);
    expect(detail.text_segments![1].font_size).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// Tests — No tokens scenario
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — no tokens', () => {
  it('returns null css_variable for all properties when tokens are empty', () => {
    const node = makeNode({
      fills: [{ type: 'SOLID', color: { r: 37 / 255, g: 99 / 255, b: 235 / 255, a: 1 }, visible: true }],
      cornerRadius: 8,
    });

    const detail = mapNodeToDetail(node, emptyTokens);

    expect(detail.fills[0].css_variable).toBeNull();
    expect(detail.corner_radius!.css_variable).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — US1: Gradient fills (T008)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — gradient fills', () => {
  it('maps LINEAR gradient fill with css_value and fill_type', () => {
    const node = makeNode({
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          visible: true,
          gradientHandlePositions: [
            { x: 0, y: 0.5 },
            { x: 1, y: 0.5 },
            { x: 0, y: 0 },
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        },
      ],
    });

    const detail = mapNodeToDetail(node, emptyTokens);

    expect(detail.fills).toHaveLength(1);
    expect(detail.fills[0].fill_type).toBe('gradient');
    expect(detail.fills[0].gradient_type).toBe('LINEAR');
    expect(detail.fills[0].css_value).toMatch(/^linear-gradient\(/);
    expect(detail.fills[0].value_hex).toBeNull();
  });

  it('maps RADIAL gradient fill with css_value', () => {
    const node = makeNode({
      fills: [
        {
          type: 'GRADIENT_RADIAL',
          visible: true,
          gradientHandlePositions: [
            { x: 0.5, y: 0.5 },
            { x: 1, y: 0.5 },
            { x: 0.5, y: 0 },
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } },
          ],
        },
      ],
    });

    const detail = mapNodeToDetail(node, emptyTokens);

    expect(detail.fills).toHaveLength(1);
    expect(detail.fills[0].fill_type).toBe('gradient');
    expect(detail.fills[0].gradient_type).toBe('RADIAL');
    expect(detail.fills[0].css_value).toMatch(/^radial-gradient\(/);
  });

  it('maps ANGULAR gradient fill to conic-gradient', () => {
    const node = makeNode({
      fills: [
        {
          type: 'GRADIENT_ANGULAR',
          visible: true,
          gradientHandlePositions: [
            { x: 0.5, y: 0.5 },
            { x: 1, y: 0.5 },
            { x: 0.5, y: 0 },
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 1, b: 0, a: 1 } },
          ],
        },
      ],
    });

    const detail = mapNodeToDetail(node, emptyTokens);

    expect(detail.fills[0].fill_type).toBe('gradient');
    expect(detail.fills[0].gradient_type).toBe('ANGULAR');
    expect(detail.fills[0].css_value).toMatch(/^conic-gradient\(/);
  });

  it('maps DIAMOND gradient fill as radial-gradient approximation', () => {
    const node = makeNode({
      fills: [
        {
          type: 'GRADIENT_DIAMOND',
          visible: true,
          gradientHandlePositions: [
            { x: 0.5, y: 0.5 },
            { x: 1, y: 0.5 },
            { x: 0.5, y: 0 },
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 1, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        },
      ],
    });

    const detail = mapNodeToDetail(node, emptyTokens);

    expect(detail.fills[0].fill_type).toBe('gradient');
    expect(detail.fills[0].gradient_type).toBe('DIAMOND');
    expect(detail.fills[0].css_value).toMatch(/^radial-gradient\(/);
  });

  it('solid fills have fill_type: solid', () => {
    const node = makeNode({
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.fills[0].fill_type).toBe('solid');
  });

  it('preserves multi-fill stacking order (gradient + solid)', () => {
    const node = makeNode({
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          visible: true,
          gradientHandlePositions: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        },
        { type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true },
      ],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.fills).toHaveLength(2);
    expect(detail.fills[0].fill_type).toBe('gradient');
    expect(detail.fills[1].fill_type).toBe('solid');
  });
});

// ---------------------------------------------------------------------------
// Tests — US1: Image fills (T008)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — image fills', () => {
  it('maps IMAGE fill with FILL scale mode → cover', () => {
    const node = makeNode({
      fills: [{ type: 'IMAGE', visible: true, imageRef: 'abc123', scaleMode: 'FILL' }],
    });

    const detail = mapNodeToDetail(node, emptyTokens);

    expect(detail.fills).toHaveLength(1);
    expect(detail.fills[0].fill_type).toBe('image');
    expect(detail.fills[0].image_ref).toBe('abc123');
    expect(detail.fills[0].scale_mode).toBe('FILL');
    expect(detail.fills[0].scale_mode_css).toBe('cover');
  });

  it('maps IMAGE fill with FIT scale mode → contain', () => {
    const node = makeNode({
      fills: [{ type: 'IMAGE', visible: true, imageRef: 'img456', scaleMode: 'FIT' }],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.fills[0].scale_mode_css).toBe('contain');
  });

  it('maps IMAGE fill with TILE scale mode → repeat', () => {
    const node = makeNode({
      fills: [{ type: 'IMAGE', visible: true, imageRef: 'tile789', scaleMode: 'TILE' }],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.fills[0].scale_mode_css).toBe('repeat');
  });

  it('maps IMAGE fill with STRETCH scale mode → 100% 100%', () => {
    const node = makeNode({
      fills: [{ type: 'IMAGE', visible: true, imageRef: 'str000', scaleMode: 'STRETCH' }],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.fills[0].scale_mode_css).toBe('100% 100%');
  });

  it('handles missing imageRef with null and keeps fill', () => {
    const node = makeNode({
      fills: [{ type: 'IMAGE', visible: true, scaleMode: 'FILL' }],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.fills).toHaveLength(1);
    expect(detail.fills[0].fill_type).toBe('image');
    expect(detail.fills[0].image_ref).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — US1: Element opacity (T008)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — element opacity', () => {
  it('includes opacity field when not 1.0', () => {
    const node = makeNode({ opacity: 0.5 });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.opacity).toBe(0.5);
  });

  it('omits opacity (undefined) when 1.0', () => {
    const node = makeNode({ opacity: 1.0 });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.opacity).toBeUndefined();
  });

  it('omits opacity when not present on node', () => {
    const node = makeNode({});
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.opacity).toBeUndefined();
  });

  it('clamps opacity to [0, 1] — clamped to 1.0 is omitted', () => {
    const node = makeNode({ opacity: 1.5 });
    const detail = mapNodeToDetail(node, emptyTokens);
    // 1.5 clamps to 1.0, which is omitted per spec
    expect(detail.opacity).toBeUndefined();
  });

  it('clamps opacity below 0 to 0', () => {
    const node = makeNode({ opacity: -0.5 });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.opacity).toBe(0);
  });
});

describe('mapNodeToDetail — paint opacity', () => {
  it('combines solid fill opacity with color alpha but keeps node opacity separate', () => {
    const node = makeNode({
      opacity: 0.4,
      fills: [
        {
          type: 'SOLID',
          visible: true,
          opacity: 0.5,
          color: { r: 1, g: 0, b: 0, a: 0.5 },
        },
      ],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.opacity).toBe(0.4);
    expect(detail.fills[0]).toMatchObject({
      opacity: 0.25,
      value_hex: '#ff000040',
      css_value: 'rgba(255, 0, 0, 0.25)',
    });
  });

  it('combines stroke opacity with color alpha in exact CSS mapping', () => {
    const node = makeNode({
      strokes: [
        {
          type: 'SOLID',
          visible: true,
          opacity: 0.25,
          color: { r: 0, g: 0, b: 1, a: 0.8 },
        },
      ],
    });

    const stroke = mapNodeToDetail(node, emptyTokens).strokes[0];
    expect(stroke).toMatchObject({
      opacity: 0.2,
      value_hex: '#0000ff33',
      css_value: 'rgba(0, 0, 255, 0.2)',
    });
  });

  it('multiplies gradient paint opacity into every CSS stop alpha', () => {
    const node = makeNode({
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          visible: true,
          opacity: 0.4,
          gradientHandlePositions: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 0.5 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        },
      ],
    });

    const fill = mapNodeToDetail(node, emptyTokens).fills[0];
    expect(fill.opacity).toBe(0.4);
    expect(fill.css_value).toContain('rgba(255, 0, 0, 0.2) 0%');
    expect(fill.css_value).toContain('rgba(0, 0, 255, 0.4) 100%');
  });
});

// ---------------------------------------------------------------------------
// Tests — US1: Backdrop blur vs layer blur (T008)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — backdrop blur', () => {
  it('maps BACKGROUND_BLUR to css_property: backdrop-filter', () => {
    const node = makeNode({
      effects: [{ type: 'BACKGROUND_BLUR', visible: true, radius: 8 }],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.effects).toHaveLength(1);
    expect(detail.effects[0].css_property).toBe('backdrop-filter');
  });

  it('maps LAYER_BLUR to css_property: filter', () => {
    const node = makeNode({
      effects: [{ type: 'LAYER_BLUR', visible: true, radius: 4 }],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.effects[0].css_property).toBe('filter');
  });
});

// ---------------------------------------------------------------------------
// Tests — US2: Per-corner radii (T014)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — per-corner radii', () => {
  it('maps non-uniform rectangleCornerRadii to corner_radii array', () => {
    const node = makeNode({ rectangleCornerRadii: [16, 16, 0, 0] });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.corner_radii).toEqual([16, 16, 0, 0]);
  });

  it('returns null corner_radii when all zeros', () => {
    const node = makeNode({ rectangleCornerRadii: [0, 0, 0, 0] });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.corner_radii).toBeNull();
  });

  it('returns null corner_radii when all values equal cornerRadius', () => {
    const node = makeNode({ cornerRadius: 8, rectangleCornerRadii: [8, 8, 8, 8] });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.corner_radii).toBeNull();
  });

  it('returns null corner_radii when not present', () => {
    const node = makeNode({});
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.corner_radii).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — US2: Rotation (T014)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — rotation', () => {
  it('maps rotation value in degrees', () => {
    const node = makeNode({ rotation: 45 });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.rotation).toBe(45);
  });

  it('returns null rotation when 0', () => {
    const node = makeNode({ rotation: 0 });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.rotation).toBeNull();
  });

  it('returns null rotation when absent', () => {
    const node = makeNode({});
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.rotation).toBeNull();
  });

  it('reports rotation inside auto-layout frame', () => {
    const node = makeNode({
      rotation: 30,
      layoutMode: 'HORIZONTAL',
    });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.rotation).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Tests — US2: Blend mode (T014)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — blend mode', () => {
  it('maps MULTIPLY to multiply', () => {
    const node = makeNode({ blendMode: 'MULTIPLY' });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.blend_mode).toBe('MULTIPLY');
    expect(detail.blend_mode_css).toBe('multiply');
  });

  it('returns null for NORMAL', () => {
    const node = makeNode({ blendMode: 'NORMAL' });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.blend_mode).toBeNull();
    expect(detail.blend_mode_css).toBeNull();
  });

  it('returns null for PASS_THROUGH', () => {
    const node = makeNode({ blendMode: 'PASS_THROUGH' });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.blend_mode).toBeNull();
  });

  it('maps LINEAR_BURN to color-burn approximation', () => {
    const node = makeNode({ blendMode: 'LINEAR_BURN' });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.blend_mode_css).toBe('color-burn');
  });
});

// ---------------------------------------------------------------------------
// Tests — US2: Overflow (T014)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — overflow', () => {
  it('maps clipsContent: true to overflow: hidden', () => {
    const node = makeNode({ clipsContent: true });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.overflow).toBe('hidden');
  });

  it('defaults to overflow: visible when clipsContent absent', () => {
    const node = makeNode({});
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.overflow).toBe('visible');
  });
});

// ---------------------------------------------------------------------------
// Tests — US2: Sizing modes (T014)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — sizing modes', () => {
  it('maps FILL sizing horizontal', () => {
    const node = makeNode({
      layoutMode: 'HORIZONTAL',
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'HUG',
      paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
      itemSpacing: 0,
    });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.layout!.sizing_horizontal).toBe('FILL');
    expect(detail.layout!.sizing_vertical).toBe('HUG');
  });

  it('returns null sizing for non-auto-layout nodes', () => {
    const node = makeNode({});
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.layout).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — US2: Absolute positioning (T014)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — absolute positioning', () => {
  it('detects absolute positioning via layoutPositioning', () => {
    const node = makeNode({ layoutPositioning: 'ABSOLUTE' });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.position).toBe('absolute');
  });

  it('defaults to relative positioning', () => {
    const node = makeNode({});
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.position).toBe('relative');
  });
});

// ---------------------------------------------------------------------------
// Tests — US3: Stroke alignment and dash patterns (T021)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — stroke alignment', () => {
  it('maps INSIDE alignment with box-shadow-inset hint', () => {
    const node = makeNode({
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true }],
      strokeWeight: 1,
      strokeAlign: 'INSIDE',
    });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.strokes[0].alignment).toBe('INSIDE');
    expect(detail.strokes[0].alignment_css).toBe('box-shadow-inset');
  });

  it('maps CENTER alignment with border hint', () => {
    const node = makeNode({
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true }],
      strokeWeight: 1,
      strokeAlign: 'CENTER',
    });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.strokes[0].alignment).toBe('CENTER');
    expect(detail.strokes[0].alignment_css).toBe('border');
  });

  it('maps OUTSIDE alignment with outline hint', () => {
    const node = makeNode({
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true }],
      strokeWeight: 1,
      strokeAlign: 'OUTSIDE',
    });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.strokes[0].alignment).toBe('OUTSIDE');
    expect(detail.strokes[0].alignment_css).toBe('outline');
  });
});

describe('mapNodeToDetail — stroke dash pattern', () => {
  it('maps strokeDashPattern to dash_pattern array', () => {
    const node = makeNode({
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true }],
      strokeWeight: 1,
      strokeDashPattern: [8, 4],
    });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.strokes[0].dash_pattern).toEqual([8, 4]);
  });

  it('returns null dash_pattern for solid strokes', () => {
    const node = makeNode({
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true }],
      strokeWeight: 1,
    });
    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.strokes[0].dash_pattern).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — US4: Typography em units (T024)
// ---------------------------------------------------------------------------

describe('mapNodeToDetail — typography em units', () => {
  it('computes line_height_em from lineHeightPx / fontSize', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'Test',
      style: {
        fontFamily: 'Inter', fontSize: 16, fontWeight: 400,
        lineHeightPx: 24, letterSpacing: 0.8,
        textAlignHorizontal: 'LEFT', textCase: 'ORIGINAL', textDecoration: 'NONE',
      },
      fills: [],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.typography!.line_height_em).toBe('1.5em');
    expect(detail.typography!.letter_spacing_em).toBe('0.05em');
  });

  it('returns normal for Auto line-height', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'Test',
      style: {
        fontFamily: 'Inter', fontSize: 16, fontWeight: 400,
        letterSpacing: 0,
        textAlignHorizontal: 'LEFT', textCase: 'ORIGINAL', textDecoration: 'NONE',
      },
      fills: [],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.typography!.line_height).toBe('normal');
    expect(detail.typography!.line_height_em).toBe('normal');
  });

  it('handles zero fontSize gracefully', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'Test',
      style: {
        fontFamily: 'Inter', fontSize: 0, fontWeight: 400,
        lineHeightPx: 24, letterSpacing: 0.5,
        textAlignHorizontal: 'LEFT', textCase: 'ORIGINAL', textDecoration: 'NONE',
      },
      fills: [],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.typography!.line_height_em).toBe('normal');
    expect(detail.typography!.letter_spacing_em).toBe('0em');
  });

  it('preserves existing px fields', () => {
    const node = makeNode({
      type: 'TEXT',
      characters: 'Test',
      style: {
        fontFamily: 'Inter', fontSize: 20, fontWeight: 400,
        lineHeightPx: 30, letterSpacing: 1.0,
        textAlignHorizontal: 'LEFT', textCase: 'ORIGINAL', textDecoration: 'NONE',
      },
      fills: [],
    });

    const detail = mapNodeToDetail(node, emptyTokens);
    expect(detail.typography!.line_height).toBe('30px');
    expect(detail.typography!.letter_spacing).toBe(1.0);
    expect(detail.typography!.line_height_em).toBe('1.5em');
    expect(detail.typography!.letter_spacing_em).toBe('0.05em');
  });
});
