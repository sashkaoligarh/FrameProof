import { describe, it, expect } from 'vitest';
import { collapseSvgGroups } from '../../../src/mcp/utils/svg-collapse.js';
import type { NodeDetail } from '../../../src/types/mcp.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeVector(name: string, type = 'VECTOR'): NodeDetail {
  return makeNode({ node_id: name, name, node_type: type, children: [] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('collapseSvgGroups', () => {
  it('collapses pure-vector GROUP to IMAGE_SVG', () => {
    const group = makeNode({
      node_type: 'GROUP',
      children: [
        makeVector('path1'),
        makeVector('path2'),
        makeVector('circle1', 'ELLIPSE'),
      ],
    });

    const result = collapseSvgGroups(group);

    expect(result.node_type).toBe('IMAGE_SVG');
    expect(result.children).toEqual([]);
    expect(result.collapsed_children_count).toBe(3);
  });

  it('does NOT collapse mixed group (vector + text)', () => {
    const group = makeNode({
      node_type: 'GROUP',
      children: [
        makeVector('path1'),
        makeNode({ node_id: 'label', name: 'label', node_type: 'TEXT' }),
      ],
    });

    const result = collapseSvgGroups(group);

    expect(result.node_type).toBe('GROUP');
    expect(result.children).toHaveLength(2);
    expect(result.collapsed_children_count).toBeUndefined();
  });

  it('collapses FRAME with all vector children', () => {
    const frame = makeNode({
      node_type: 'FRAME',
      children: [
        makeVector('line1', 'LINE'),
        makeVector('star1', 'STAR'),
        makeVector('poly1', 'REGULAR_POLYGON'),
      ],
    });

    const result = collapseSvgGroups(frame);

    expect(result.node_type).toBe('IMAGE_SVG');
    expect(result.collapsed_children_count).toBe(3);
  });

  it('preserves bounding box and name after collapse', () => {
    const group = makeNode({
      node_type: 'GROUP',
      name: 'icon-star',
      width: 24,
      height: 24,
      x: 10,
      y: 20,
      children: [makeVector('v1')],
    });

    const result = collapseSvgGroups(group);

    expect(result.name).toBe('icon-star');
    expect(result.width).toBe(24);
    expect(result.height).toBe(24);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
  });

  it('counts collapsed children accurately', () => {
    const group = makeNode({
      node_type: 'GROUP',
      children: [
        makeVector('v1', 'VECTOR'),
        makeVector('v2', 'BOOLEAN_OPERATION'),
        makeVector('v3', 'LINE'),
        makeVector('v4', 'STAR'),
        makeVector('v5', 'ELLIPSE'),
      ],
    });

    const result = collapseSvgGroups(group);
    expect(result.collapsed_children_count).toBe(5);
  });

  it('collapses nested all-vector groups', () => {
    const innerGroup = makeNode({
      node_id: 'inner',
      node_type: 'GROUP',
      children: [makeVector('v1'), makeVector('v2')],
    });

    const outerFrame = makeNode({
      node_type: 'FRAME',
      children: [
        innerGroup,
        makeNode({ node_id: 'text', node_type: 'TEXT' }),
      ],
    });

    const result = collapseSvgGroups(outerFrame);

    // Outer should NOT collapse (has TEXT child)
    expect(result.node_type).toBe('FRAME');
    expect(result.children).toHaveLength(2);

    // Inner group should collapse
    expect(result.children[0].node_type).toBe('IMAGE_SVG');
    expect(result.children[0].collapsed_children_count).toBe(2);
  });

  it('does not collapse empty groups', () => {
    const group = makeNode({ node_type: 'GROUP', children: [] });
    const result = collapseSvgGroups(group);
    expect(result.node_type).toBe('GROUP');
  });

  it('does not collapse TEXT or RECTANGLE nodes', () => {
    const text = makeNode({
      node_type: 'TEXT',
      children: [],
    });
    const rect = makeNode({
      node_type: 'RECTANGLE',
      children: [makeVector('v1')],
    });

    expect(collapseSvgGroups(text).node_type).toBe('TEXT');
    expect(collapseSvgGroups(rect).node_type).toBe('RECTANGLE');
  });
});
