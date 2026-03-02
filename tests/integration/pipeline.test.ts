/**
 * T042 — Integration snapshot tests for the full pipeline.
 * Runs parse → transform → writers on the simple-file.json fixture
 * and verifies output via toMatchFileSnapshot().
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Node } from '@figma/rest-api-spec';
import { parseDocumentTree } from '../../src/pipeline/parse.js';
import { extractAllTokens } from '../../src/pipeline/transform.js';
import { generateCSS } from '../../src/writers/css.js';
import { generateJSON, generateComponentsJSON } from '../../src/writers/json.js';
import { generateManifest } from '../../src/writers/manifest.js';
import type { StyleMeta, ComponentMeta, ComponentSetMeta } from '../../src/types/tokens.js';

const FIXTURE_PATH = join(__dirname, '../fixtures/api-responses/simple-file.json');
const SNAPSHOT_DIR = join(__dirname, '../fixtures/snapshots');

function loadFixture() {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
  return raw;
}

function normalizeStyles(raw: Record<string, Record<string, unknown>> | undefined): Record<string, StyleMeta> {
  if (!raw) return {};
  const result: Record<string, StyleMeta> = {};
  for (const [id, style] of Object.entries(raw)) {
    result[id] = {
      key: style.key as string,
      name: style.name as string,
      style_type: style.styleType as string,
      description: (style.description as string) ?? '',
    };
  }
  return result;
}

function normalizeComponentsMeta(raw: Record<string, Record<string, unknown>> | undefined): Record<string, ComponentMeta> {
  if (!raw) return {};
  const result: Record<string, ComponentMeta> = {};
  for (const [id, comp] of Object.entries(raw)) {
    result[id] = {
      key: comp.key as string,
      name: comp.name as string,
      description: (comp.description as string) ?? '',
      component_set_id: comp.componentSetId as string | undefined,
    };
  }
  return result;
}

function normalizeComponentSetsMeta(raw: Record<string, Record<string, unknown>> | undefined): Record<string, ComponentSetMeta> {
  if (!raw) return {};
  const result: Record<string, ComponentSetMeta> = {};
  for (const [id, set] of Object.entries(raw)) {
    result[id] = {
      key: set.key as string,
      name: set.name as string,
      description: (set.description as string) ?? '',
    };
  }
  return result;
}

describe('Full pipeline integration', () => {
  const fixture = loadFixture();
  const document = fixture.document as Node;
  const styles = normalizeStyles(fixture.styles);
  const componentsMeta = normalizeComponentsMeta(fixture.components);
  const componentSetsMeta = normalizeComponentSetsMeta(fixture.componentSets);

  const nodes = parseDocumentTree(document, { includeHidden: false });
  const tokens = extractAllTokens(nodes, styles, componentsMeta, componentSetsMeta);

  describe('Token extraction completeness', () => {
    it('extracts colors from the fixture', () => {
      expect(tokens.colors.length).toBeGreaterThan(0);
    });

    it('extracts gradients from the fixture', () => {
      expect(tokens.gradients.length).toBeGreaterThan(0);
    });

    it('extracts typography from the fixture', () => {
      expect(tokens.typography.length).toBeGreaterThan(0);
    });

    it('extracts spacing from the fixture', () => {
      expect(tokens.spacing.length).toBeGreaterThan(0);
    });

    it('extracts radii from the fixture', () => {
      expect(tokens.radii.length).toBeGreaterThan(0);
    });

    it('extracts shadows from the fixture', () => {
      expect(tokens.shadows.length).toBeGreaterThan(0);
    });

    it('extracts images from the fixture', () => {
      expect(tokens.images.length).toBeGreaterThan(0);
    });
  });

  describe('CSS writer snapshot', () => {
    it('matches CSS snapshot', async () => {
      const css = generateCSS(tokens, 'test-file-id');
      // Normalize the timestamp for deterministic snapshots
      const normalized = css.replace(
        /\/\* Generated: [^*]+\*\//,
        '/* Generated: 2026-01-01T00:00:00.000Z */',
      );
      await expect(normalized).toMatchFileSnapshot(join(SNAPSHOT_DIR, 'design-system.css'));
    });
  });

  describe('JSON writer snapshots', () => {
    const jsonFiles = generateJSON(tokens);

    it('matches colors.json snapshot', async () => {
      await expect(jsonFiles['colors.json']).toMatchFileSnapshot(
        join(SNAPSHOT_DIR, 'colors.json'),
      );
    });

    it('matches typography.json snapshot', async () => {
      await expect(jsonFiles['typography.json']).toMatchFileSnapshot(
        join(SNAPSHOT_DIR, 'typography.json'),
      );
    });

    it('matches spacing.json snapshot', async () => {
      await expect(jsonFiles['spacing.json']).toMatchFileSnapshot(
        join(SNAPSHOT_DIR, 'spacing.json'),
      );
    });

    it('matches border-radius.json snapshot', async () => {
      await expect(jsonFiles['border-radius.json']).toMatchFileSnapshot(
        join(SNAPSHOT_DIR, 'border-radius.json'),
      );
    });

    it('matches shadows.json snapshot', async () => {
      await expect(jsonFiles['shadows.json']).toMatchFileSnapshot(
        join(SNAPSHOT_DIR, 'shadows.json'),
      );
    });

    it('matches gradients.json snapshot', async () => {
      await expect(jsonFiles['gradients.json']).toMatchFileSnapshot(
        join(SNAPSHOT_DIR, 'gradients.json'),
      );
    });
  });

  describe('Components writer snapshot', () => {
    it('matches components.json snapshot', async () => {
      const componentsJson = generateComponentsJSON(tokens.components);
      await expect(componentsJson).toMatchFileSnapshot(
        join(SNAPSHOT_DIR, 'components.json'),
      );
    });
  });

  describe('Manifest writer snapshot', () => {
    it('matches manifest.json snapshot (with normalized timestamp)', async () => {
      const manifest = generateManifest(
        tokens,
        'test-file-id',
        'Test Design System',
        nodes.length,
        { page: undefined, node: undefined, includeHidden: false },
      );
      // Normalize the generated_at timestamp for deterministic snapshots
      const normalized = manifest.replace(
        /"generated_at": "[^"]+"/,
        '"generated_at": "2026-01-01T00:00:00.000Z"',
      );
      await expect(normalized).toMatchFileSnapshot(join(SNAPSHOT_DIR, 'manifest.json'));
    });
  });
});
