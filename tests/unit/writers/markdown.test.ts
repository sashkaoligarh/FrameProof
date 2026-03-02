/**
 * T053 — Markdown writer tests.
 *
 * Tests the generateMarkdown function which takes AllTokens, fileId,
 * and fileName and produces a Markdown string for CONTEXT.md.
 *
 * Coverage:
 * - Contains all required sections: Colors, Typography, Spacing, Components
 * - Tables use | delimiters (proper markdown table format)
 * - Contains "How to use" section with CSS variable usage rules
 * - Contains Source section with file ID and generation date
 * - Handles empty tokens gracefully
 * - Colors table shows CSS var name, hex value, usage count
 * - Typography table shows family, size, weight, line-height
 */

import { describe, it, expect } from 'vitest';
import { generateMarkdown } from '../../../src/writers/markdown.js';
import type {
  AllTokens,
  ComponentInfo,
} from '../../../src/types/tokens.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Fully-populated AllTokens fixture for testing all sections. */
const fullTokens: AllTokens = {
  colors: [
    {
      name: 'brand-primary',
      node_id: '1:2',
      source_type: 'fill',
      value_hex: '#2563eb',
      value_rgba: { r: 37, g: 99, b: 235, a: 1 },
      opacity: 1,
      usage_count: 5,
      used_in_types: ['RECTANGLE'],
    },
    {
      name: 'text-dark',
      node_id: '1:3',
      source_type: 'fill',
      value_hex: '#111827',
      value_rgba: { r: 17, g: 24, b: 39, a: 1 },
      opacity: 1,
      usage_count: 3,
      used_in_types: ['TEXT'],
    },
    {
      name: 'surface-light',
      node_id: '1:4',
      source_type: 'fill',
      value_hex: '#f9fafb',
      value_rgba: { r: 249, g: 250, b: 251, a: 1 },
      opacity: 1,
      usage_count: 8,
      used_in_types: ['FRAME'],
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
    {
      name: 'body-regular',
      node_id: '1:4',
      font_family: 'Roboto',
      font_size: 16,
      font_weight: 400,
      font_style: 'normal',
      line_height: '24px',
      line_height_px: 24,
      letter_spacing: 0,
      text_align_horizontal: 'LEFT',
      text_case: 'ORIGINAL',
      text_decoration: 'NONE',
      sample_text: 'Body text example',
      usage_count: 3,
    },
  ],
  spacing: [
    { value: 8, source: 'padding', usage_count: 2 },
    { value: 12, source: 'item_spacing', usage_count: 1 },
    { value: 16, source: 'padding', usage_count: 3 },
  ],
  radii: [
    { value: 4, is_per_corner: false, usage_count: 3 },
    { value: 8, is_per_corner: false, usage_count: 1 },
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
    children: [],
  },
];

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

// ---------------------------------------------------------------------------
// Tests — required sections
// ---------------------------------------------------------------------------

describe('generateMarkdown — required sections', () => {
  const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');

  it('contains Colors section', () => {
    expect(md).toContain('## Colors');
  });

  it('contains Typography section', () => {
    expect(md).toContain('## Typography');
  });

  it('contains Spacing section', () => {
    expect(md).toContain('## Spacing');
  });

  it('contains Shadows section', () => {
    expect(md).toContain('## Shadows');
  });

  it('contains Border Radius section', () => {
    expect(md).toContain('## Border Radius');
  });

  it('includes Components section when components are present', () => {
    const tokensWithComponents: AllTokens = {
      ...fullTokens,
      components: sampleComponents,
    };
    const mdWithComp = generateMarkdown(tokensWithComponents, 'abc123', 'My Design System');
    expect(mdWithComp).toContain('## Components');
  });

  it('omits Components section when no components exist', () => {
    // fullTokens has components: []
    expect(md).not.toContain('## Components');
  });
});

// ---------------------------------------------------------------------------
// Tests — table format with | delimiters
// ---------------------------------------------------------------------------

describe('generateMarkdown — markdown table format', () => {
  const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');

  it('Colors table uses | delimiters', () => {
    const colorsSection = md.split('## Colors')[1].split('##')[0];
    const tableLines = colorsSection.split('\n').filter((l) => l.startsWith('|'));
    expect(tableLines.length).toBeGreaterThan(0);
    for (const line of tableLines) {
      expect(line).toMatch(/^\|.*\|$/);
    }
  });

  it('Typography table uses | delimiters', () => {
    const typoSection = md.split('## Typography')[1].split('##')[0];
    const tableLines = typoSection.split('\n').filter((l) => l.startsWith('|'));
    expect(tableLines.length).toBeGreaterThan(0);
    for (const line of tableLines) {
      expect(line).toMatch(/^\|.*\|$/);
    }
  });

  it('Shadows table uses | delimiters', () => {
    const shadowSection = md.split('## Shadows')[1].split('##')[0];
    const tableLines = shadowSection.split('\n').filter((l) => l.startsWith('|'));
    expect(tableLines.length).toBeGreaterThan(0);
    for (const line of tableLines) {
      expect(line).toMatch(/^\|.*\|$/);
    }
  });

  it('Colors table has header separator row with ---', () => {
    const colorsSection = md.split('## Colors')[1].split('##')[0];
    expect(colorsSection).toContain('| --- |');
  });

  it('Typography table has header separator row with ---', () => {
    const typoSection = md.split('## Typography')[1].split('##')[0];
    expect(typoSection).toContain('| --- |');
  });

  it('Components table uses | delimiters when components are present', () => {
    const tokensWithComponents: AllTokens = {
      ...fullTokens,
      components: sampleComponents,
    };
    const mdWithComp = generateMarkdown(tokensWithComponents, 'abc123', 'My Design System');
    const compSection = mdWithComp.split('## Components')[1];
    const tableLines = compSection.split('\n').filter((l) => l.startsWith('|'));
    expect(tableLines.length).toBeGreaterThan(0);
    for (const line of tableLines) {
      expect(line).toMatch(/^\|.*\|$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — How to use section
// ---------------------------------------------------------------------------

describe('generateMarkdown — How to use section', () => {
  const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');

  it('contains "How to use" heading', () => {
    expect(md).toContain('## How to use');
  });

  it('contains CSS import instruction', () => {
    expect(md).toContain('design-system.css');
  });

  it('contains rule about never hardcoding values', () => {
    expect(md).toMatch(/[Nn]ever hardcode/);
  });

  it('contains rule about using CSS variables', () => {
    expect(md).toMatch(/[Aa]lways use CSS variables/);
  });

  it('contains rule about semantic variable names', () => {
    expect(md).toMatch(/semantic/i);
  });
});

// ---------------------------------------------------------------------------
// Tests — Source section
// ---------------------------------------------------------------------------

describe('generateMarkdown — Source section', () => {
  const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');

  it('contains Source heading', () => {
    expect(md).toContain('## Source');
  });

  it('contains the file ID', () => {
    expect(md).toContain('abc123');
  });

  it('contains the file name', () => {
    expect(md).toContain('My Design System');
  });

  it('contains a generation date in ISO format', () => {
    expect(md).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// Tests — empty tokens handled gracefully
// ---------------------------------------------------------------------------

describe('generateMarkdown — empty tokens', () => {
  const md = generateMarkdown(emptyTokens, 'empty-file', 'Empty Design');

  it('still contains all section headings', () => {
    expect(md).toContain('## Colors');
    expect(md).toContain('## Typography');
    expect(md).toContain('## Spacing');
    expect(md).toContain('## Shadows');
    expect(md).toContain('## Border Radius');
  });

  it('does not contain Components section for empty components', () => {
    expect(md).not.toContain('## Components');
  });

  it('shows "No color tokens extracted" for empty colors', () => {
    expect(md).toContain('No color tokens extracted');
  });

  it('shows "No typography tokens extracted" for empty typography', () => {
    expect(md).toContain('No typography tokens extracted');
  });

  it('shows "No spacing tokens extracted" for empty spacing', () => {
    expect(md).toContain('No spacing tokens extracted');
  });

  it('shows "No shadow tokens extracted" for empty shadows', () => {
    expect(md).toContain('No shadow tokens extracted');
  });

  it('shows "No border radius tokens extracted" for empty radii', () => {
    expect(md).toContain('No border radius tokens extracted');
  });

  it('does not throw on empty tokens', () => {
    expect(() => generateMarkdown(emptyTokens, 'id', 'name')).not.toThrow();
  });

  it('still contains Source and How to use sections', () => {
    expect(md).toContain('## Source');
    expect(md).toContain('## How to use');
  });
});

// ---------------------------------------------------------------------------
// Tests — Colors table content
// ---------------------------------------------------------------------------

describe('generateMarkdown — Colors table content', () => {
  const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');
  const colorsSection = md.split('## Colors')[1].split('##')[0];

  it('Colors table header has CSS Variable column', () => {
    expect(colorsSection).toContain('CSS Variable');
  });

  it('Colors table header has Hex column', () => {
    expect(colorsSection).toContain('Hex');
  });

  it('Colors table header has Usage Count column', () => {
    expect(colorsSection).toContain('Usage Count');
  });

  it('Colors table header has Node ID column', () => {
    expect(colorsSection).toContain('Node ID');
  });

  it('shows CSS variable name with --color- prefix', () => {
    expect(colorsSection).toContain('--color-brand-primary');
  });

  it('shows hex value', () => {
    expect(colorsSection).toContain('#2563eb');
  });

  it('shows usage count for a color', () => {
    // surface-light has highest usage_count (8)
    expect(colorsSection).toContain('8');
  });

  it('colors are sorted by usage_count descending', () => {
    const dataLines = colorsSection.split('\n').filter(
      (l) => l.startsWith('|') && !l.includes('---') && !l.includes('CSS Variable'),
    );
    // Order should be: surface-light(8), brand-primary(5), text-dark(3)
    expect(dataLines.length).toBe(3);
    expect(dataLines[0]).toContain('surface-light');
    expect(dataLines[1]).toContain('brand-primary');
    expect(dataLines[2]).toContain('text-dark');
  });
});

// ---------------------------------------------------------------------------
// Tests — Typography table content
// ---------------------------------------------------------------------------

describe('generateMarkdown — Typography table content', () => {
  const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');
  const typoSection = md.split('## Typography')[1].split('##')[0];

  it('Typography table header has Family column', () => {
    expect(typoSection).toContain('Family');
  });

  it('Typography table header has Size column', () => {
    expect(typoSection).toContain('Size');
  });

  it('Typography table header has Weight column', () => {
    expect(typoSection).toContain('Weight');
  });

  it('Typography table header has Line Height column', () => {
    expect(typoSection).toContain('Line Height');
  });

  it('shows font family', () => {
    expect(typoSection).toContain('Inter');
    expect(typoSection).toContain('Roboto');
  });

  it('shows font size with px suffix', () => {
    expect(typoSection).toContain('32px');
    expect(typoSection).toContain('16px');
  });

  it('shows font weight', () => {
    expect(typoSection).toContain('700');
    expect(typoSection).toContain('400');
  });

  it('shows line height', () => {
    expect(typoSection).toContain('40px');
    expect(typoSection).toContain('24px');
  });

  it('typography rows are sorted by usage_count descending', () => {
    const dataLines = typoSection.split('\n').filter(
      (l) => l.startsWith('|') && !l.includes('---') && !l.includes('Family'),
    );
    // body-regular (usage_count=3) should come before heading-xl (usage_count=1)
    expect(dataLines.length).toBe(2);
    expect(dataLines[0]).toContain('Roboto');
    expect(dataLines[1]).toContain('Inter');
  });
});

// ---------------------------------------------------------------------------
// Tests — Spacing scale list
// ---------------------------------------------------------------------------

describe('generateMarkdown — Spacing scale list', () => {
  const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');
  const spacingSection = md.split('## Spacing')[1].split('##')[0];

  it('lists spacing values as bullet points', () => {
    expect(spacingSection).toContain('- `--spacing-8`: 8px');
    expect(spacingSection).toContain('- `--spacing-12`: 12px');
    expect(spacingSection).toContain('- `--spacing-16`: 16px');
  });

  it('spacing values are sorted ascending by value', () => {
    const bulletLines = spacingSection.split('\n').filter((l) => l.startsWith('- '));
    expect(bulletLines.length).toBe(3);
    expect(bulletLines[0]).toContain('--spacing-8');
    expect(bulletLines[1]).toContain('--spacing-12');
    expect(bulletLines[2]).toContain('--spacing-16');
  });
});

// ---------------------------------------------------------------------------
// Tests — Border Radius scale list
// ---------------------------------------------------------------------------

describe('generateMarkdown — Border Radius scale list', () => {
  const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');
  const radiusSection = md.split('## Border Radius')[1].split('##')[0];

  it('lists radius values as bullet points', () => {
    expect(radiusSection).toContain('- `--radius-4`: 4px');
    expect(radiusSection).toContain('- `--radius-8`: 8px');
  });

  it('radius values are sorted ascending by value', () => {
    const bulletLines = radiusSection.split('\n').filter((l) => l.startsWith('- '));
    expect(bulletLines.length).toBe(2);
    expect(bulletLines[0]).toContain('--radius-4');
    expect(bulletLines[1]).toContain('--radius-8');
  });
});

// ---------------------------------------------------------------------------
// Tests — Shadows table content
// ---------------------------------------------------------------------------

describe('generateMarkdown — Shadows table content', () => {
  const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');
  const shadowSection = md.split('## Shadows')[1].split('##')[0];

  it('Shadows table header has Name column', () => {
    expect(shadowSection).toContain('Name');
  });

  it('Shadows table header has CSS Value column', () => {
    expect(shadowSection).toContain('CSS Value');
  });

  it('shows shadow variable name', () => {
    expect(shadowSection).toContain('--shadow-drop-1');
  });

  it('shows shadow CSS value', () => {
    expect(shadowSection).toContain('0px 2px 4px 0px rgba(0, 0, 0, 0.1)');
  });
});

// ---------------------------------------------------------------------------
// Tests — Components table content
// ---------------------------------------------------------------------------

describe('generateMarkdown — Components table content', () => {
  const tokensWithComponents: AllTokens = {
    ...fullTokens,
    components: sampleComponents,
  };
  const md = generateMarkdown(tokensWithComponents, 'abc123', 'My Design System');
  const compSection = md.split('## Components')[1];

  it('Components table header has Name column', () => {
    expect(compSection).toContain('Name');
  });

  it('Components table header has Node ID column', () => {
    expect(compSection).toContain('Node ID');
  });

  it('Components table header has Dimensions column', () => {
    expect(compSection).toContain('Dimensions');
  });

  it('Components table header has Layout column', () => {
    expect(compSection).toContain('Layout');
  });

  it('shows component name', () => {
    expect(compSection).toContain('Button/Primary');
    expect(compSection).toContain('Card/Default');
  });

  it('shows component dimensions as WxH', () => {
    expect(compSection).toContain('120x40');
    expect(compSection).toContain('320x200');
  });

  it('shows layout mode', () => {
    expect(compSection).toContain('HORIZONTAL');
  });

  it('shows NONE for components without layout_mode', () => {
    expect(compSection).toContain('NONE');
  });
});

// ---------------------------------------------------------------------------
// Tests — output is a string
// ---------------------------------------------------------------------------

describe('generateMarkdown — output format', () => {
  it('returns a string', () => {
    const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');
    expect(typeof md).toBe('string');
  });

  it('starts with a markdown heading', () => {
    const md = generateMarkdown(fullTokens, 'abc123', 'My Design System');
    expect(md.trimStart().startsWith('#')).toBe(true);
  });
});
