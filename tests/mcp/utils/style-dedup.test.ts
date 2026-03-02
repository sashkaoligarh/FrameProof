import { describe, it, expect } from 'vitest';
import { deduplicateStyles, deduplicateStylesArray } from '../../../src/mcp/utils/style-dedup.js';
import type { NodeDetail, CSSMappedFill, CSSMappedStroke, CSSMappedEffect } from '../../../src/types/mcp.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFill(hex: string): CSSMappedFill {
  return {
    fill_type: 'solid',
    value_hex: hex,
    opacity: 1,
    css_variable: null,
    css_property: 'background-color',
    css_value: null,
    gradient_type: null,
    image_ref: null,
    scale_mode: null,
    scale_mode_css: null,
  };
}

function makeStroke(hex: string): CSSMappedStroke {
  return {
    value_hex: hex,
    weight: 1,
    css_variable: null,
    css_property: 'border-color',
    alignment: 'CENTER',
    alignment_css: 'border',
    dash_pattern: null,
  };
}

function makeEffect(blur: number): CSSMappedEffect {
  return {
    effect_type: 'LAYER_BLUR',
    css_value: `blur(${blur}px)`,
    css_variable: null,
    css_property: 'filter',
  };
}

function makeNode(overrides: Partial<NodeDetail> = {}): NodeDetail {
  return {
    node_id: '0:1',
    name: 'test',
    node_type: 'FRAME',
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    visible: true,
    fills: [],
    strokes: [],
    effects: [],
    corner_radius: null,
    corner_radii: null,
    rotation: null,
    blend_mode: null,
    blend_mode_css: null,
    overflow: 'visible',
    position: 'relative',
    layout: null,
    typography: null,
    text_content: null,
    text_segments: null,
    children: [],
    component_info: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — deduplicateStyles
// ---------------------------------------------------------------------------

describe('deduplicateStyles', () => {
  it('identical fills produce same hash ref', () => {
    const fill = makeFill('#ff0000');
    const node = makeNode({
      fills: [fill, { ...fill }],
    });

    const result = deduplicateStyles(node);

    // Both fills should have the same ref
    expect(result.fills).toHaveLength(2);
    expect(typeof result.fills[0]).toBe('string');
    expect(result.fills[0]).toBe(result.fills[1]);
    expect((result.fills[0] as string).startsWith('f_')).toBe(true);
  });

  it('different fills produce different refs', () => {
    const node = makeNode({
      fills: [makeFill('#ff0000'), makeFill('#00ff00')],
    });

    const result = deduplicateStyles(node);

    expect(result.fills[0]).not.toBe(result.fills[1]);
  });

  it('strokes use s_ prefix', () => {
    const node = makeNode({
      strokes: [makeStroke('#000000')],
    });

    const result = deduplicateStyles(node);

    expect(typeof result.strokes[0]).toBe('string');
    expect((result.strokes[0] as string).startsWith('s_')).toBe(true);
  });

  it('effects use e_ prefix', () => {
    const node = makeNode({
      effects: [makeEffect(8)],
    });

    const result = deduplicateStyles(node);

    expect(typeof result.effects[0]).toBe('string');
    expect((result.effects[0] as string).startsWith('e_')).toBe(true);
  });

  it('_shared_styles contains all unique styles', () => {
    const node = makeNode({
      fills: [makeFill('#ff0000'), makeFill('#ff0000'), makeFill('#00ff00')],
      strokes: [makeStroke('#000000')],
      effects: [makeEffect(4)],
    });

    const result = deduplicateStyles(node);

    expect(result._shared_styles).toBeDefined();
    const keys = Object.keys(result._shared_styles!);
    // 2 unique fills + 1 stroke + 1 effect = 4 entries
    expect(keys).toHaveLength(4);
    expect(keys.filter((k) => k.startsWith('f_'))).toHaveLength(2);
    expect(keys.filter((k) => k.startsWith('s_'))).toHaveLength(1);
    expect(keys.filter((k) => k.startsWith('e_'))).toHaveLength(1);
  });

  it('deduplicates across children', () => {
    const sharedFill = makeFill('#ff0000');
    const child1 = makeNode({ node_id: 'c1', fills: [sharedFill] });
    const child2 = makeNode({ node_id: 'c2', fills: [{ ...sharedFill }] });

    const parent = makeNode({
      fills: [{ ...sharedFill }],
      children: [child1, child2],
    });

    const result = deduplicateStyles(parent);

    // All three should resolve to the same ref
    const parentRef = result.fills[0];
    const child1Ref = result.children[0].fills[0];
    const child2Ref = result.children[1].fills[0];
    expect(parentRef).toBe(child1Ref);
    expect(parentRef).toBe(child2Ref);

    // Only 1 unique fill in shared styles
    const fillKeys = Object.keys(result._shared_styles!).filter((k) => k.startsWith('f_'));
    expect(fillKeys).toHaveLength(1);
  });

  it('achieves significant size reduction on repeated styles', () => {
    // Build a tree with 20 nodes sharing the same fill
    const fill = makeFill('#336699');
    const children = Array.from({ length: 20 }, (_, i) =>
      makeNode({ node_id: `child-${i}`, fills: [{ ...fill }] }),
    );
    const root = makeNode({ fills: [{ ...fill }], children });

    const originalSize = JSON.stringify(root).length;
    const dedupResult = deduplicateStyles(root);
    const dedupSize = JSON.stringify(dedupResult).length;

    const reduction = 1 - dedupSize / originalSize;
    expect(reduction).toBeGreaterThan(0.3); // At least 30% reduction
  });

  it('hash is deterministic across calls', () => {
    const node1 = makeNode({ fills: [makeFill('#abcdef')] });
    const node2 = makeNode({ fills: [makeFill('#abcdef')] });

    const result1 = deduplicateStyles(node1);
    const result2 = deduplicateStyles(node2);

    expect(result1.fills[0]).toBe(result2.fills[0]);
  });
});

// ---------------------------------------------------------------------------
// Tests — deduplicateStylesArray
// ---------------------------------------------------------------------------

describe('deduplicateStylesArray', () => {
  it('shares styles across nodes in batch', () => {
    const fill = makeFill('#ff0000');
    const node1 = makeNode({ node_id: 'a', fills: [fill] });
    const node2 = makeNode({ node_id: 'b', fills: [{ ...fill }] });

    const result = deduplicateStylesArray([node1, node2]);

    expect(result).toHaveLength(2);
    expect(result[0].fills[0]).toBe(result[1].fills[0]);
  });

  it('attaches _shared_styles to first node only', () => {
    const node1 = makeNode({ node_id: 'a', fills: [makeFill('#ff0000')] });
    const node2 = makeNode({ node_id: 'b', fills: [makeFill('#00ff00')] });

    const result = deduplicateStylesArray([node1, node2]);

    expect(result[0]._shared_styles).toBeDefined();
    expect(result[1]._shared_styles).toBeUndefined();
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateStylesArray([])).toEqual([]);
  });
});
