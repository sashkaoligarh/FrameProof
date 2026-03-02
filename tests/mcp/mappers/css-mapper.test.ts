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
