/**
 * T044 — Component extractor tests.
 *
 * Uses the component-set-variants.json and deep-nesting.json fixtures
 * parsed via parseDocumentTree, then validates that extractComponents
 * produces correct ComponentInfo[].
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocumentTree } from '../../../src/pipeline/parse.js';
import { extractComponents } from '../../../src/extractors/components.js';
import type { Node } from '@figma/rest-api-spec';
import type {
  ParsedNode,
  ComponentMeta,
  ComponentSetMeta,
  ComponentInfo,
} from '../../../src/types/tokens.js';

// ---------------------------------------------------------------------------
// Load fixtures
// ---------------------------------------------------------------------------

const variantsFixturePath = resolve(
  import.meta.dirname!,
  '../../fixtures/api-responses/component-set-variants.json',
);

const deepNestingFixturePath = resolve(
  import.meta.dirname!,
  '../../fixtures/api-responses/deep-nesting.json',
);

interface FixtureFile {
  document: Node;
  components: Record<string, { key: string; name: string; description: string; componentSetId?: string }>;
  componentSets: Record<string, { key: string; name: string; description: string }>;
}

function loadFixture(path: string): FixtureFile {
  return JSON.parse(readFileSync(path, 'utf-8')) as FixtureFile;
}

function normalizeComponentsMeta(
  raw: Record<string, { key: string; name: string; description: string; componentSetId?: string }>,
): Record<string, ComponentMeta> {
  const result: Record<string, ComponentMeta> = {};
  for (const [id, entry] of Object.entries(raw)) {
    result[id] = {
      key: entry.key,
      name: entry.name,
      description: entry.description,
      component_set_id: entry.componentSetId,
    };
  }
  return result;
}

function normalizeComponentSetsMeta(
  raw: Record<string, { key: string; name: string; description: string }>,
): Record<string, ComponentSetMeta> {
  const result: Record<string, ComponentSetMeta> = {};
  for (const [id, entry] of Object.entries(raw)) {
    result[id] = {
      key: entry.key,
      name: entry.name,
      description: entry.description,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Variants fixture
// ---------------------------------------------------------------------------

const variantsFixture = loadFixture(variantsFixturePath);
const variantsNodes = parseDocumentTree(variantsFixture.document as Node, { includeHidden: false });
const componentsMeta = normalizeComponentsMeta(variantsFixture.components);
const componentSetsMeta = normalizeComponentSetsMeta(variantsFixture.componentSets);

// ---------------------------------------------------------------------------
// Deep nesting fixture
// ---------------------------------------------------------------------------

const deepFixture = loadFixture(deepNestingFixturePath);
const deepNodes = parseDocumentTree(deepFixture.document as Node, { includeHidden: false });
const deepComponentsMeta = normalizeComponentsMeta(deepFixture.components);
const deepComponentSetsMeta = normalizeComponentSetsMeta(deepFixture.componentSets);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractComponents — COMPONENT and COMPONENT_SET extraction', () => {
  const components = extractComponents(variantsNodes, componentsMeta, componentSetsMeta);

  it('returns an array', () => {
    expect(Array.isArray(components)).toBe(true);
  });

  it('extracts COMPONENT and COMPONENT_SET nodes (SC-003)', () => {
    // The fixture has:
    // - 1 COMPONENT_SET (Button, id 10:1)
    // - 6 COMPONENT variants inside it (should NOT be counted as standalone)
    // - 1 standalone COMPONENT (IconButton, id 11:1)
    // Total expected: 2 (1 COMPONENT_SET + 1 standalone COMPONENT)
    expect(components).toHaveLength(2);
  });

  it('identifies the COMPONENT_SET correctly', () => {
    const set = components.find((c) => c.component_type === 'COMPONENT_SET');
    expect(set).toBeDefined();
    expect(set!.name).toBe('Button');
    expect(set!.node_id).toBe('10:1');
  });

  it('identifies the standalone COMPONENT correctly', () => {
    const comp = components.find(
      (c) => c.component_type === 'COMPONENT' && c.node_id === '11:1',
    );
    expect(comp).toBeDefined();
    expect(comp!.name).toBe('IconButton');
  });

  it('does not include COMPONENT variants as standalone entries', () => {
    const variantIds = ['10:2', '10:3', '10:4', '10:5', '10:6', '10:7'];
    for (const id of variantIds) {
      const found = components.find((c) => c.node_id === id);
      expect(found).toBeUndefined();
    }
  });
});

describe('extractComponents — dimensions from absoluteBoundingBox', () => {
  const components = extractComponents(variantsNodes, componentsMeta, componentSetsMeta);

  it('captures width and height from COMPONENT_SET', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.width).toBe(600);
    expect(set.height).toBe(400);
  });

  it('captures width and height from standalone COMPONENT', () => {
    const comp = components.find((c) => c.node_id === '11:1')!;
    expect(comp.width).toBe(48);
    expect(comp.height).toBe(48);
  });
});

describe('extractComponents — layout properties', () => {
  const components = extractComponents(variantsNodes, componentsMeta, componentSetsMeta);

  it('captures layoutMode', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.layout_mode).toBe('HORIZONTAL');
  });

  it('captures padding (top, right, bottom, left)', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.padding).toEqual({ top: 24, right: 24, bottom: 24, left: 24 });
  });

  it('captures itemSpacing', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.item_spacing).toBe(16);
  });

  it('captures counterAxisSpacing', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.counter_axis_spacing).toBe(12);
  });

  it('captures primaryAxisAlignItems', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.primary_axis_align).toBe('MIN');
  });

  it('captures counterAxisAlignItems', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.counter_axis_align).toBe('MIN');
  });

  it('captures layoutWrap', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.layout_wrap).toBe('WRAP');
  });

  it('captures clipsContent', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.clips_content).toBe(true);

    const comp = components.find((c) => c.node_id === '11:1')!;
    expect(comp.clips_content).toBe(true);
  });

  it('captures layout properties for standalone COMPONENT', () => {
    const comp = components.find((c) => c.node_id === '11:1')!;
    expect(comp.layout_mode).toBe('HORIZONTAL');
    expect(comp.padding).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    expect(comp.item_spacing).toBe(0);
    expect(comp.primary_axis_align).toBe('CENTER');
    expect(comp.counter_axis_align).toBe('CENTER');
  });
});

describe('extractComponents — cornerRadius / cornerRadii', () => {
  const components = extractComponents(variantsNodes, componentsMeta, componentSetsMeta);

  it('captures cornerRadius from COMPONENT_SET', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.corner_radius).toBe(8);
  });

  it('captures rectangleCornerRadii as corner_radii', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.corner_radii).toEqual([8, 8, 8, 8]);
  });

  it('captures cornerRadius from standalone COMPONENT', () => {
    const comp = components.find((c) => c.node_id === '11:1')!;
    expect(comp.corner_radius).toBe(24);
  });
});

describe('extractComponents — description from metadata', () => {
  const components = extractComponents(variantsNodes, componentsMeta, componentSetsMeta);

  it('gets description for COMPONENT_SET from componentSetsMeta', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.description).toBe('Primary action button with multiple sizes and states');
  });

  it('gets description for standalone COMPONENT from componentsMeta', () => {
    const comp = components.find((c) => c.node_id === '11:1')!;
    expect(comp.description).toBe('Circular icon-only button');
  });
});

describe('extractComponents — variants for COMPONENT_SET', () => {
  const components = extractComponents(variantsNodes, componentsMeta, componentSetsMeta);
  const set = components.find((c) => c.node_id === '10:1')!;

  it('extracts variants array for COMPONENT_SET', () => {
    expect(set.variants).toBeDefined();
    expect(Array.isArray(set.variants)).toBe(true);
  });

  it('has the correct number of variants (6 COMPONENT children)', () => {
    expect(set.variants!).toHaveLength(6);
  });

  it('parses variant properties using parseVariantName', () => {
    const smallDefault = set.variants!.find((v) => v.node_id === '10:2')!;
    expect(smallDefault.name).toBe('Size=S, State=Default');
    expect(smallDefault.properties).toEqual({ Size: 'S', State: 'Default' });
  });

  it('captures variant dimensions from absoluteBoundingBox', () => {
    const smallDefault = set.variants!.find((v) => v.node_id === '10:2')!;
    expect(smallDefault.width).toBe(80);
    expect(smallDefault.height).toBe(32);

    const mediumDefault = set.variants!.find((v) => v.node_id === '10:3')!;
    expect(mediumDefault.width).toBe(120);
    expect(mediumDefault.height).toBe(40);

    const largeDefault = set.variants!.find((v) => v.node_id === '10:4')!;
    expect(largeDefault.width).toBe(160);
    expect(largeDefault.height).toBe(48);
  });

  it('does not have variants on a standalone COMPONENT', () => {
    const comp = components.find((c) => c.node_id === '11:1')!;
    expect(comp.variants).toBeUndefined();
  });
});

describe('extractComponents — children hierarchy as ComponentChild[]', () => {
  const components = extractComponents(variantsNodes, componentsMeta, componentSetsMeta);

  it('builds children hierarchy for COMPONENT_SET', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    expect(set.children.length).toBe(6); // 6 COMPONENT variants
    expect(set.children[0].node_type).toBe('COMPONENT');
  });

  it('builds nested children hierarchy for standalone COMPONENT', () => {
    const comp = components.find((c) => c.node_id === '11:1')!;
    expect(comp.children).toHaveLength(1);
    expect(comp.children[0].name).toBe('Icon');
    expect(comp.children[0].node_type).toBe('RECTANGLE');
  });

  it('builds nested children for COMPONENT_SET variant children', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    // First variant (Size=S, State=Default, id 10:2) has Icon (FRAME) and Label (TEXT)
    const firstVariant = set.children.find((c) => c.node_id === '10:2')!;
    expect(firstVariant.children).toBeDefined();
    expect(firstVariant.children!).toHaveLength(2);
    expect(firstVariant.children![0].name).toBe('Icon');
    expect(firstVariant.children![0].node_type).toBe('FRAME');
    expect(firstVariant.children![1].name).toBe('Label');
    expect(firstVariant.children![1].node_type).toBe('TEXT');
  });

  it('builds deeply nested children (FRAME > RECTANGLE)', () => {
    const set = components.find((c) => c.node_id === '10:1')!;
    const firstVariant = set.children.find((c) => c.node_id === '10:2')!;
    const iconFrame = firstVariant.children![0];
    expect(iconFrame.children).toBeDefined();
    expect(iconFrame.children!).toHaveLength(1);
    expect(iconFrame.children![0].name).toBe('Icon Shape');
    expect(iconFrame.children![0].node_type).toBe('RECTANGLE');
  });
});

describe('extractComponents — deep nesting (6+ levels)', () => {
  const components = extractComponents(deepNodes, deepComponentsMeta, deepComponentSetsMeta);

  it('extracts the deeply nested component', () => {
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe('DeepCard');
    expect(components[0].node_id).toBe('20:1');
  });

  it('captures layout properties for the deep component', () => {
    const comp = components[0];
    expect(comp.layout_mode).toBe('VERTICAL');
    expect(comp.padding).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    expect(comp.item_spacing).toBe(8);
    expect(comp.clips_content).toBe(true);
    expect(comp.corner_radius).toBe(12);
    expect(comp.corner_radii).toEqual([12, 12, 12, 12]);
  });

  it('builds a 6-level deep children hierarchy', () => {
    const comp = components[0];
    // Level 1: COMPONENT > children
    expect(comp.children).toHaveLength(1);
    const outerFrame = comp.children[0]; // Level 2: FRAME (Outer Frame)
    expect(outerFrame.name).toBe('Outer Frame');
    expect(outerFrame.node_type).toBe('FRAME');

    const innerFrame = outerFrame.children![0]; // Level 3: FRAME (Inner Frame)
    expect(innerFrame.name).toBe('Inner Frame');
    expect(innerFrame.node_type).toBe('FRAME');

    const group = innerFrame.children![0]; // Level 4: GROUP (Content Group)
    expect(group.name).toBe('Content Group');
    expect(group.node_type).toBe('GROUP');

    const detailFrame = group.children![0]; // Level 5: FRAME (Detail Frame)
    expect(detailFrame.name).toBe('Detail Frame');
    expect(detailFrame.node_type).toBe('FRAME');

    // Level 6: RECTANGLE + TEXT
    expect(detailFrame.children!).toHaveLength(2);
    expect(detailFrame.children![0].name).toBe('Background');
    expect(detailFrame.children![0].node_type).toBe('RECTANGLE');
    expect(detailFrame.children![1].name).toBe('Title');
    expect(detailFrame.children![1].node_type).toBe('TEXT');
  });

  it('leaf nodes have no children property', () => {
    const comp = components[0];
    const leaf = comp.children[0].children![0].children![0].children![0].children![0];
    // RECTANGLE leaf node — should not have children
    expect(leaf.children).toBeUndefined();
  });
});

describe('extractComponents — description from deep nesting metadata', () => {
  const components = extractComponents(deepNodes, deepComponentsMeta, deepComponentSetsMeta);

  it('gets description for the deep component from componentsMeta', () => {
    const comp = components[0];
    expect(comp.description).toBe('A card component with deeply nested structure');
  });
});

describe('extractComponents — empty input', () => {
  it('returns empty array for empty nodes', () => {
    const result = extractComponents([], {}, {});
    expect(result).toEqual([]);
  });

  it('returns empty array when no COMPONENT or COMPONENT_SET nodes exist', () => {
    const nodes: ParsedNode[] = [
      {
        node_id: 'frame:1',
        node_type: 'FRAME',
        name: 'Regular Frame',
        parent_id: null,
        depth: 0,
        raw: { type: 'FRAME' } as unknown as Node,
      },
    ];
    const result = extractComponents(nodes, {}, {});
    expect(result).toEqual([]);
  });
});

describe('extractComponents — defaults for missing properties', () => {
  it('defaults width/height to 0 when absoluteBoundingBox is missing', () => {
    const nodes: ParsedNode[] = [
      {
        node_id: 'comp:1',
        node_type: 'COMPONENT',
        name: 'NoBBox',
        parent_id: null,
        depth: 0,
        raw: { type: 'COMPONENT' } as unknown as Node,
      },
    ];
    const result = extractComponents(nodes, {}, {});
    expect(result).toHaveLength(1);
    expect(result[0].width).toBe(0);
    expect(result[0].height).toBe(0);
  });

  it('defaults padding to all zeros when not specified', () => {
    const nodes: ParsedNode[] = [
      {
        node_id: 'comp:2',
        node_type: 'COMPONENT',
        name: 'NoPadding',
        parent_id: null,
        depth: 0,
        raw: { type: 'COMPONENT' } as unknown as Node,
      },
    ];
    const result = extractComponents(nodes, {}, {});
    expect(result[0].padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('defaults clipsContent to false when not specified', () => {
    const nodes: ParsedNode[] = [
      {
        node_id: 'comp:3',
        node_type: 'COMPONENT',
        name: 'NoClips',
        parent_id: null,
        depth: 0,
        raw: { type: 'COMPONENT' } as unknown as Node,
      },
    ];
    const result = extractComponents(nodes, {}, {});
    expect(result[0].clips_content).toBe(false);
  });

  it('defaults description to empty string when not in metadata', () => {
    const nodes: ParsedNode[] = [
      {
        node_id: 'comp:4',
        node_type: 'COMPONENT',
        name: 'NoMeta',
        parent_id: null,
        depth: 0,
        raw: { type: 'COMPONENT' } as unknown as Node,
      },
    ];
    const result = extractComponents(nodes, {}, {});
    expect(result[0].description).toBe('');
  });
});
