/**
 * T025 — JSON DTCG writer tests.
 *
 * Tests the generateJSON function which takes AllTokens and returns
 * a Record<string, string> where keys are filenames and values are
 * JSON strings in Design Token Community Group (DTCG) format.
 *
 * Also tests generateComponentsJSON for component output.
 *
 * Coverage:
 * - generateJSON returns map of filename -> JSON string
 * - Files include: colors.json, typography.json, spacing.json,
 *   border-radius.json, shadows.json, gradients.json
 * - Each file uses DTCG format: $type, $value, $extensions
 * - $extensions contains frameproof namespace with node_id and usage_count
 * - generateComponentsJSON returns valid JSON array
 * - Handle empty arrays (files still generated but with empty objects)
 * - All JSON is valid (JSON.parse doesn't throw)
 * - snake_case keys in $extensions
 */

import { describe, it, expect } from 'vitest';
import { generateJSON, generateComponentsJSON } from '../../../src/writers/json.js';
import type {
  AllTokens,
  ColorToken,
  GradientToken,
  TypographyToken,
  SpacingToken,
  RadiusToken,
  ShadowToken,
  ComponentInfo,
} from '../../../src/types/tokens.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Fully-populated AllTokens fixture. */
const fullTokens: AllTokens = {
  colors: [
    {
      name: 'brand-primary',
      node_id: '1:2',
      source_type: 'fill',
      value_hex: '#2563eb',
      value_rgba: { r: 37, g: 99, b: 235, a: 1 },
      opacity: 1,
      usage_count: 2,
      used_in_types: ['RECTANGLE'],
    },
    {
      name: 'text-dark',
      node_id: '1:3',
      source_type: 'fill',
      value_hex: '#111827',
      value_rgba: { r: 17, g: 24, b: 39, a: 1 },
      opacity: 1,
      usage_count: 1,
      used_in_types: ['TEXT'],
    },
  ],
  gradients: [
    {
      name: 'gradient-linear-1',
      node_id: '1:6',
      gradient_type: 'LINEAR',
      stops: [
        { position: 0, color_hex: '#2563eb', color_rgba: { r: 37, g: 99, b: 235, a: 1 } },
        { position: 1, color_hex: '#8e44f4', color_rgba: { r: 142, g: 68, b: 244, a: 1 } },
      ],
      handle_positions: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
    },
  ],
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
      sample_text: 'Welcome to Design System',
      usage_count: 1,
    },
  ],
  spacing: [
    { value: 8, source: 'padding', usage_count: 2 },
    { value: 16, source: 'padding', usage_count: 3 },
  ],
  radii: [
    { value: 4, is_per_corner: false, usage_count: 3 },
    { value: 8, is_per_corner: true, usage_count: 1 },
  ],
  shadows: [
    {
      name: 'shadow-drop-1',
      node_id: '1:2',
      shadow_type: 'DROP_SHADOW',
      offset_x: 0,
      offset_y: 2,
      blur: 4,
      spread: 0,
      color_hex: '#0000001a',
      color_rgba: { r: 0, g: 0, b: 0, a: 0.1 },
      css: '0px 2px 4px 0px rgba(0, 0, 0, 0.1)',
    },
  ],
  images: [],
  components: [],
};

/** AllTokens with all arrays empty. */
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

/** Sample ComponentInfo fixtures. */
const sampleComponents: ComponentInfo[] = [
  {
    node_id: '10:1',
    name: 'Button/Primary',
    component_type: 'COMPONENT',
    width: 120,
    height: 40,
    description: 'Primary button component',
    layout_mode: 'HORIZONTAL',
    padding: { top: 8, right: 16, bottom: 8, left: 16 },
    item_spacing: 8,
    clips_content: false,
    corner_radius: 4,
    children: [],
  },
  {
    node_id: '10:2',
    name: 'Card/Default',
    component_type: 'COMPONENT',
    width: 320,
    height: 200,
    description: 'Default card component',
    padding: { top: 16, right: 16, bottom: 16, left: 16 },
    clips_content: true,
    corner_radius: 8,
    children: [
      { node_id: '10:3', node_type: 'TEXT', name: 'Title' },
      { node_id: '10:4', node_type: 'TEXT', name: 'Description' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helper to check snake_case
// ---------------------------------------------------------------------------

function isSnakeCase(key: string): boolean {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(key);
}

// ---------------------------------------------------------------------------
// Tests — generateJSON return type
// ---------------------------------------------------------------------------

describe('generateJSON — return type', () => {
  const result = generateJSON(fullTokens);

  it('returns an object (Record<string, string>)', () => {
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('all values are strings', () => {
    for (const value of Object.values(result)) {
      expect(typeof value).toBe('string');
    }
  });

  it('returns exactly 6 file entries', () => {
    expect(Object.keys(result)).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Tests — expected file keys
// ---------------------------------------------------------------------------

describe('generateJSON — expected file keys', () => {
  const result = generateJSON(fullTokens);
  const expectedFiles = [
    'colors.json',
    'typography.json',
    'spacing.json',
    'border-radius.json',
    'shadows.json',
    'gradients.json',
  ];

  for (const file of expectedFiles) {
    it(`contains "${file}" key`, () => {
      expect(result).toHaveProperty(file);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests — all JSON is valid (JSON.parse doesn't throw)
// ---------------------------------------------------------------------------

describe('generateJSON — valid JSON values', () => {
  const result = generateJSON(fullTokens);

  it('colors.json is valid JSON', () => {
    expect(() => JSON.parse(result['colors.json'])).not.toThrow();
  });

  it('typography.json is valid JSON', () => {
    expect(() => JSON.parse(result['typography.json'])).not.toThrow();
  });

  it('spacing.json is valid JSON', () => {
    expect(() => JSON.parse(result['spacing.json'])).not.toThrow();
  });

  it('border-radius.json is valid JSON', () => {
    expect(() => JSON.parse(result['border-radius.json'])).not.toThrow();
  });

  it('shadows.json is valid JSON', () => {
    expect(() => JSON.parse(result['shadows.json'])).not.toThrow();
  });

  it('gradients.json is valid JSON', () => {
    expect(() => JSON.parse(result['gradients.json'])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests — colors.json DTCG format
// ---------------------------------------------------------------------------

describe('generateJSON — colors.json DTCG format', () => {
  const result = generateJSON(fullTokens);
  const colors = JSON.parse(result['colors.json']) as Record<string, unknown>;

  it('has entries for each color token', () => {
    const keys = Object.keys(colors);
    expect(keys.length).toBe(fullTokens.colors.length);
  });

  it('color entries have $type: "color"', () => {
    for (const value of Object.values(colors)) {
      const entry = value as Record<string, unknown>;
      expect(entry.$type).toBe('color');
    }
  });

  it('color entries have $value as a hex string', () => {
    for (const value of Object.values(colors)) {
      const entry = value as Record<string, unknown>;
      expect(typeof entry.$value).toBe('string');
      expect(entry.$value as string).toMatch(/^#[0-9a-fA-F]{6,8}$/);
    }
  });

  it('brand-primary $value is #2563eb', () => {
    const entry = colors['brand-primary'] as Record<string, unknown>;
    expect(entry.$value).toBe('#2563eb');
  });

  it('color entries have $extensions with frameproof namespace', () => {
    for (const value of Object.values(colors)) {
      const entry = value as Record<string, unknown>;
      expect(entry.$extensions).toBeDefined();
      const extensions = entry.$extensions as Record<string, unknown>;
      expect(extensions.frameproof).toBeDefined();
    }
  });

  it('frameproof extension contains node_id and usage_count', () => {
    for (const value of Object.values(colors)) {
      const entry = value as Record<string, unknown>;
      const frameproof = (entry.$extensions as Record<string, unknown>)[
        'frameproof'
      ] as Record<string, unknown>;
      expect(frameproof).toHaveProperty('node_id');
      expect(frameproof).toHaveProperty('usage_count');
    }
  });

  it('frameproof extension contains rgba data', () => {
    const entry = colors['brand-primary'] as Record<string, unknown>;
    const frameproof = (entry.$extensions as Record<string, unknown>)[
      'frameproof'
    ] as Record<string, unknown>;
    expect(frameproof).toHaveProperty('rgba');
  });
});

// ---------------------------------------------------------------------------
// Tests — typography.json DTCG format
// ---------------------------------------------------------------------------

describe('generateJSON — typography.json DTCG format', () => {
  const result = generateJSON(fullTokens);
  const typography = JSON.parse(result['typography.json']) as Record<string, unknown>;

  it('has entries for typography tokens', () => {
    const keys = Object.keys(typography);
    expect(keys.length).toBe(fullTokens.typography.length);
  });

  it('typography entries have $type: "typography"', () => {
    for (const value of Object.values(typography)) {
      const entry = value as Record<string, unknown>;
      expect(entry.$type).toBe('typography');
    }
  });

  it('$value contains font_family, font_size, font_weight, line_height, letter_spacing', () => {
    const entry = typography['heading-xl'] as Record<string, unknown>;
    const val = entry.$value as Record<string, unknown>;
    expect(val).toHaveProperty('font_family');
    expect(val).toHaveProperty('font_size');
    expect(val).toHaveProperty('font_weight');
    expect(val).toHaveProperty('line_height');
    expect(val).toHaveProperty('letter_spacing');
  });

  it('font_size has px suffix', () => {
    const entry = typography['heading-xl'] as Record<string, unknown>;
    const val = entry.$value as Record<string, unknown>;
    expect(val.font_size).toBe('32px');
  });

  it('$extensions.frameproof contains node_id and usage_count', () => {
    const entry = typography['heading-xl'] as Record<string, unknown>;
    const frameproof = (entry.$extensions as Record<string, unknown>)[
      'frameproof'
    ] as Record<string, unknown>;
    expect(frameproof).toHaveProperty('node_id');
    expect(frameproof).toHaveProperty('usage_count');
  });

  it('$extensions.frameproof includes font_style, text_case, text_decoration, sample_text', () => {
    const entry = typography['heading-xl'] as Record<string, unknown>;
    const frameproof = (entry.$extensions as Record<string, unknown>)[
      'frameproof'
    ] as Record<string, unknown>;
    expect(frameproof).toHaveProperty('font_style');
    expect(frameproof).toHaveProperty('text_case');
    expect(frameproof).toHaveProperty('text_decoration');
    expect(frameproof).toHaveProperty('sample_text');
  });
});

// ---------------------------------------------------------------------------
// Tests — spacing.json DTCG format
// ---------------------------------------------------------------------------

describe('generateJSON — spacing.json DTCG format', () => {
  const result = generateJSON(fullTokens);
  const spacing = JSON.parse(result['spacing.json']) as Record<string, unknown>;

  it('has entries for spacing tokens', () => {
    const keys = Object.keys(spacing);
    expect(keys.length).toBe(fullTokens.spacing.length);
  });

  it('spacing entries have $type: "dimension"', () => {
    for (const value of Object.values(spacing)) {
      const entry = value as Record<string, unknown>;
      expect(entry.$type).toBe('dimension');
    }
  });

  it('$value has px suffix', () => {
    const entry = spacing['spacing-8'] as Record<string, unknown>;
    expect(entry.$value).toBe('8px');
  });

  it('$extensions.frameproof contains source and usage_count', () => {
    const entry = spacing['spacing-8'] as Record<string, unknown>;
    const frameproof = (entry.$extensions as Record<string, unknown>)[
      'frameproof'
    ] as Record<string, unknown>;
    expect(frameproof).toHaveProperty('source');
    expect(frameproof).toHaveProperty('usage_count');
  });
});

// ---------------------------------------------------------------------------
// Tests — border-radius.json DTCG format
// ---------------------------------------------------------------------------

describe('generateJSON — border-radius.json DTCG format', () => {
  const result = generateJSON(fullTokens);
  const radii = JSON.parse(result['border-radius.json']) as Record<string, unknown>;

  it('has entries for radius tokens', () => {
    const keys = Object.keys(radii);
    expect(keys.length).toBe(fullTokens.radii.length);
  });

  it('radius entries have $type: "dimension"', () => {
    for (const value of Object.values(radii)) {
      const entry = value as Record<string, unknown>;
      expect(entry.$type).toBe('dimension');
    }
  });

  it('$value has px suffix', () => {
    const entry = radii['radius-4'] as Record<string, unknown>;
    expect(entry.$value).toBe('4px');
  });

  it('$extensions.frameproof contains is_per_corner and usage_count', () => {
    const entry = radii['radius-4'] as Record<string, unknown>;
    const frameproof = (entry.$extensions as Record<string, unknown>)[
      'frameproof'
    ] as Record<string, unknown>;
    expect(frameproof).toHaveProperty('is_per_corner');
    expect(frameproof).toHaveProperty('usage_count');
  });

  it('is_per_corner value matches source token', () => {
    const entry4 = radii['radius-4'] as Record<string, unknown>;
    const fs4 = (entry4.$extensions as Record<string, unknown>)[
      'frameproof'
    ] as Record<string, unknown>;
    expect(fs4.is_per_corner).toBe(false);

    const entry8 = radii['radius-8'] as Record<string, unknown>;
    const fs8 = (entry8.$extensions as Record<string, unknown>)[
      'frameproof'
    ] as Record<string, unknown>;
    expect(fs8.is_per_corner).toBe(true);
  });
});

describe('generateJSON — collision handling', () => {
  it('retains typography tokens with the same generated name', () => {
    const duplicateNameTokens: AllTokens = {
      ...emptyTokens,
      typography: [
        fullTokens.typography[0],
        {
          ...fullTokens.typography[0],
          node_id: '1:99',
          line_height: '48px',
          line_height_px: 48,
        },
      ],
    };

    const typography = JSON.parse(
      generateJSON(duplicateNameTokens)['typography.json'],
    ) as Record<string, { $value: { line_height: string } }>;

    expect(Object.keys(typography)).toEqual(['heading-xl', 'heading-xl-2']);
    expect(typography['heading-xl'].$value.line_height).toBe('40px');
    expect(typography['heading-xl-2'].$value.line_height).toBe('48px');
  });

  it('retains uniform and per-corner radii with the same value', () => {
    const duplicateValueTokens: AllTokens = {
      ...emptyTokens,
      radii: [
        { value: 8, is_per_corner: false, usage_count: 2 },
        { value: 8, is_per_corner: true, usage_count: 1 },
      ],
    };

    const radii = JSON.parse(
      generateJSON(duplicateValueTokens)['border-radius.json'],
    ) as Record<string, unknown>;

    expect(Object.keys(radii)).toEqual(['radius-8-uniform', 'radius-8-per-corner']);
  });
});

// ---------------------------------------------------------------------------
// Tests — shadows.json DTCG format
// ---------------------------------------------------------------------------

describe('generateJSON — shadows.json DTCG format', () => {
  const result = generateJSON(fullTokens);
  const shadows = JSON.parse(result['shadows.json']) as Record<string, unknown>;

  it('has entries for shadow tokens', () => {
    const keys = Object.keys(shadows);
    expect(keys.length).toBe(fullTokens.shadows.length);
  });

  it('shadow entries have $type: "shadow"', () => {
    for (const value of Object.values(shadows)) {
      const entry = value as Record<string, unknown>;
      expect(entry.$type).toBe('shadow');
    }
  });

  it('$value contains offset_x, offset_y, blur, spread, color', () => {
    const entry = shadows['shadow-drop-1'] as Record<string, unknown>;
    const val = entry.$value as Record<string, unknown>;
    expect(val).toHaveProperty('offset_x');
    expect(val).toHaveProperty('offset_y');
    expect(val).toHaveProperty('blur');
    expect(val).toHaveProperty('spread');
    expect(val).toHaveProperty('color');
  });

  it('offset and blur values have px suffix', () => {
    const entry = shadows['shadow-drop-1'] as Record<string, unknown>;
    const val = entry.$value as Record<string, unknown>;
    expect(val.offset_x).toBe('0px');
    expect(val.offset_y).toBe('2px');
    expect(val.blur).toBe('4px');
    expect(val.spread).toBe('0px');
  });

  it('$extensions.frameproof contains node_id, shadow_type, css', () => {
    const entry = shadows['shadow-drop-1'] as Record<string, unknown>;
    const frameproof = (entry.$extensions as Record<string, unknown>)[
      'frameproof'
    ] as Record<string, unknown>;
    expect(frameproof).toHaveProperty('node_id');
    expect(frameproof).toHaveProperty('shadow_type');
    expect(frameproof).toHaveProperty('css');
  });
});

// ---------------------------------------------------------------------------
// Tests — gradients.json DTCG format
// ---------------------------------------------------------------------------

describe('generateJSON — gradients.json DTCG format', () => {
  const result = generateJSON(fullTokens);
  const gradients = JSON.parse(result['gradients.json']) as Record<string, unknown>;

  it('has entries for gradient tokens', () => {
    const keys = Object.keys(gradients);
    expect(keys.length).toBe(fullTokens.gradients.length);
  });

  it('gradient entries have $type: "gradient"', () => {
    for (const value of Object.values(gradients)) {
      const entry = value as Record<string, unknown>;
      expect(entry.$type).toBe('gradient');
    }
  });

  it('$value contains type and stops array', () => {
    const entry = gradients['gradient-linear-1'] as Record<string, unknown>;
    const val = entry.$value as Record<string, unknown>;
    expect(val).toHaveProperty('type');
    expect(val).toHaveProperty('stops');
    expect(Array.isArray(val.stops)).toBe(true);
  });

  it('gradient type matches source token', () => {
    const entry = gradients['gradient-linear-1'] as Record<string, unknown>;
    const val = entry.$value as Record<string, unknown>;
    expect(val.type).toBe('LINEAR');
  });

  it('stops have position and color_hex', () => {
    const entry = gradients['gradient-linear-1'] as Record<string, unknown>;
    const val = entry.$value as Record<string, unknown>;
    const stops = val.stops as { position: number; color: string }[];
    expect(stops).toHaveLength(2);
    for (const stop of stops) {
      expect(stop).toHaveProperty('position');
      expect(stop).toHaveProperty('color');
    }
  });

  it('$extensions.frameproof contains node_id, handle_positions, stops_rgba', () => {
    const entry = gradients['gradient-linear-1'] as Record<string, unknown>;
    const frameproof = (entry.$extensions as Record<string, unknown>)[
      'frameproof'
    ] as Record<string, unknown>;
    expect(frameproof).toHaveProperty('node_id');
    expect(frameproof).toHaveProperty('handle_positions');
    expect(frameproof).toHaveProperty('stops_rgba');
  });
});

// ---------------------------------------------------------------------------
// Tests — snake_case keys in $extensions
// ---------------------------------------------------------------------------

describe('generateJSON — snake_case keys in $extensions', () => {
  const result = generateJSON(fullTokens);

  /**
   * Recursively collect all keys in the frameproof extension objects
   * across all files and verify they are snake_case.
   */
  function collectFrameproofKeys(parsed: Record<string, unknown>): string[] {
    const keys: string[] = [];
    for (const value of Object.values(parsed)) {
      const entry = value as Record<string, unknown>;
      if (entry.$extensions) {
        const ext = entry.$extensions as Record<string, unknown>;
        const fs = ext.frameproof as Record<string, unknown> | undefined;
        if (fs) {
          keys.push(...Object.keys(fs));
        }
      }
    }
    return keys;
  }

  it('colors.json frameproof extension keys are snake_case', () => {
    const parsed = JSON.parse(result['colors.json']) as Record<string, unknown>;
    const keys = collectFrameproofKeys(parsed);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(isSnakeCase(key)).toBe(true);
    }
  });

  it('typography.json frameproof extension keys are snake_case', () => {
    const parsed = JSON.parse(result['typography.json']) as Record<string, unknown>;
    const keys = collectFrameproofKeys(parsed);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(isSnakeCase(key)).toBe(true);
    }
  });

  it('spacing.json frameproof extension keys are snake_case', () => {
    const parsed = JSON.parse(result['spacing.json']) as Record<string, unknown>;
    const keys = collectFrameproofKeys(parsed);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(isSnakeCase(key)).toBe(true);
    }
  });

  it('border-radius.json frameproof extension keys are snake_case', () => {
    const parsed = JSON.parse(result['border-radius.json']) as Record<string, unknown>;
    const keys = collectFrameproofKeys(parsed);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(isSnakeCase(key)).toBe(true);
    }
  });

  it('shadows.json frameproof extension keys are snake_case', () => {
    const parsed = JSON.parse(result['shadows.json']) as Record<string, unknown>;
    const keys = collectFrameproofKeys(parsed);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(isSnakeCase(key)).toBe(true);
    }
  });

  it('gradients.json frameproof extension keys are snake_case', () => {
    const parsed = JSON.parse(result['gradients.json']) as Record<string, unknown>;
    const keys = collectFrameproofKeys(parsed);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(isSnakeCase(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — empty tokens (files still generated but with empty objects)
// ---------------------------------------------------------------------------

describe('generateJSON — empty tokens', () => {
  const result = generateJSON(emptyTokens);

  it('still returns all expected file keys', () => {
    expect(result).toHaveProperty('colors.json');
    expect(result).toHaveProperty('typography.json');
    expect(result).toHaveProperty('spacing.json');
    expect(result).toHaveProperty('border-radius.json');
    expect(result).toHaveProperty('shadows.json');
    expect(result).toHaveProperty('gradients.json');
  });

  it('all values are valid JSON even when empty', () => {
    for (const value of Object.values(result)) {
      expect(() => JSON.parse(value)).not.toThrow();
    }
  });

  it('empty token files parse to empty objects', () => {
    for (const value of Object.values(result)) {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      expect(Object.keys(parsed)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — generateComponentsJSON
// ---------------------------------------------------------------------------

describe('generateComponentsJSON — return type', () => {
  it('returns a string', () => {
    const result = generateComponentsJSON(sampleComponents);
    expect(typeof result).toBe('string');
  });

  it('returns valid JSON', () => {
    const result = generateComponentsJSON(sampleComponents);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('parsed result is an array', () => {
    const result = generateComponentsJSON(sampleComponents);
    const parsed = JSON.parse(result) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('array length matches input components count', () => {
    const result = generateComponentsJSON(sampleComponents);
    const parsed = JSON.parse(result) as unknown[];
    expect(parsed).toHaveLength(sampleComponents.length);
  });
});

describe('generateComponentsJSON — component data', () => {
  const result = generateComponentsJSON(sampleComponents);
  const parsed = JSON.parse(result) as Record<string, unknown>[];

  it('each component has node_id', () => {
    for (const component of parsed) {
      expect(component).toHaveProperty('node_id');
    }
  });

  it('each component has name', () => {
    for (const component of parsed) {
      expect(component).toHaveProperty('name');
    }
  });

  it('preserves component values correctly', () => {
    const button = parsed.find((c) => c.name === 'Button/Primary');
    expect(button).toBeDefined();
    expect(button!.node_id).toBe('10:1');
    expect(button!.width).toBe(120);
    expect(button!.height).toBe(40);
  });

  it('preserves children structure', () => {
    const card = parsed.find((c) => c.name === 'Card/Default');
    expect(card).toBeDefined();
    expect(Array.isArray(card!.children)).toBe(true);
    const children = card!.children as Record<string, unknown>[];
    expect(children).toHaveLength(2);
  });
});

describe('generateComponentsJSON — empty array', () => {
  it('returns valid JSON for empty component array', () => {
    const result = generateComponentsJSON([]);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('returns a JSON array representation', () => {
    const result = generateComponentsJSON([]);
    const parsed = JSON.parse(result) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('empty array has length 0', () => {
    const result = generateComponentsJSON([]);
    const parsed = JSON.parse(result) as unknown[];
    expect(parsed).toHaveLength(0);
  });
});
