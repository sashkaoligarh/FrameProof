/**
 * T016 — Tree traversal (parseDocumentTree) tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocumentTree } from '../../../src/pipeline/parse.js';
import type { ParseOptions } from '../../../src/pipeline/parse.js';
import type { Node } from '@figma/rest-api-spec';

// ---------------------------------------------------------------------------
// Load the fixture once
// ---------------------------------------------------------------------------

const fixturePath = resolve(
  import.meta.dirname!,
  '../../fixtures/api-responses/simple-file.json',
);

interface SimpleFileFixture {
  document: Node;
}

const fixture: SimpleFileFixture = JSON.parse(
  readFileSync(fixturePath, 'utf-8'),
) as SimpleFileFixture;

const doc = fixture.document;

// ---------------------------------------------------------------------------
// Default parse (excludes hidden)
// ---------------------------------------------------------------------------

describe('parseDocumentTree — default options', () => {
  const defaultOpts: ParseOptions = { includeHidden: false };
  const nodes = parseDocumentTree(doc, defaultOpts);

  it('returns a non-empty array of parsed nodes', () => {
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('excludes the hidden element (1:5)', () => {
    const ids = nodes.map((n) => n.node_id);
    expect(ids).not.toContain('1:5');
  });

  it('counts the correct number of visible nodes', () => {
    // Document structure (visible only):
    //   0:0 Document
    //     0:1 Page 1
    //       1:1 Colors Frame
    //         1:2 Primary Button
    //         1:3 Heading Text
    //         1:4 Body Text
    //         1:6 Gradient Card
    //         1:7 Auto Layout Row
    //           1:8 Duplicate Blue
    //           1:9 Image Fill
    //     0:2 Page 2
    //       2:1 Secondary Frame
    // Total: 12 visible nodes
    expect(nodes).toHaveLength(12);
  });

  it('sets parent_id to null for the root document node', () => {
    const root = nodes.find((n) => n.node_id === '0:0');
    expect(root).toBeDefined();
    expect(root!.parent_id).toBeNull();
  });

  it('sets correct parent_id for canvas → document', () => {
    const page1 = nodes.find((n) => n.node_id === '0:1');
    expect(page1).toBeDefined();
    expect(page1!.parent_id).toBe('0:0');
  });

  it('sets correct parent_id for frame → canvas', () => {
    const frame = nodes.find((n) => n.node_id === '1:1');
    expect(frame).toBeDefined();
    expect(frame!.parent_id).toBe('0:1');
  });

  it('sets correct parent_id for child → frame', () => {
    const button = nodes.find((n) => n.node_id === '1:2');
    expect(button).toBeDefined();
    expect(button!.parent_id).toBe('1:1');
  });

  it('tracks depth correctly: document=0, canvas=1, frame=2, children=3', () => {
    const document = nodes.find((n) => n.node_id === '0:0');
    const canvas = nodes.find((n) => n.node_id === '0:1');
    const frame = nodes.find((n) => n.node_id === '1:1');
    const child = nodes.find((n) => n.node_id === '1:2');

    expect(document!.depth).toBe(0);
    expect(canvas!.depth).toBe(1);
    expect(frame!.depth).toBe(2);
    expect(child!.depth).toBe(3);
  });

  it('preserves node_type from the Figma tree', () => {
    const document = nodes.find((n) => n.node_id === '0:0');
    const canvas = nodes.find((n) => n.node_id === '0:1');
    const frame = nodes.find((n) => n.node_id === '1:1');
    const rect = nodes.find((n) => n.node_id === '1:2');
    const text = nodes.find((n) => n.node_id === '1:3');

    expect(document!.node_type).toBe('DOCUMENT');
    expect(canvas!.node_type).toBe('CANVAS');
    expect(frame!.node_type).toBe('FRAME');
    expect(rect!.node_type).toBe('RECTANGLE');
    expect(text!.node_type).toBe('TEXT');
  });

  it('preserves names from the Figma tree', () => {
    const frame = nodes.find((n) => n.node_id === '1:1');
    expect(frame!.name).toBe('Colors Frame');
  });

  it('includes raw node reference', () => {
    const first = nodes[0];
    expect(first.raw).toBeDefined();
    expect(typeof first.raw).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// includeHidden = true
// ---------------------------------------------------------------------------

describe('parseDocumentTree — includeHidden', () => {
  const opts: ParseOptions = { includeHidden: true };
  const nodes = parseDocumentTree(doc, opts);

  it('includes the hidden element (1:5) when includeHidden is true', () => {
    const ids = nodes.map((n) => n.node_id);
    expect(ids).toContain('1:5');
  });

  it('has one more node than the default parse', () => {
    const defaultNodes = parseDocumentTree(doc, { includeHidden: false });
    expect(nodes.length).toBe(defaultNodes.length + 1);
  });
});

// ---------------------------------------------------------------------------
// pageFilter
// ---------------------------------------------------------------------------

describe('parseDocumentTree — pageFilter', () => {
  it('returns only Page 1 nodes when filtering by "Page 1"', () => {
    const opts: ParseOptions = { includeHidden: false, pageFilter: 'Page 1' };
    const nodes = parseDocumentTree(doc, opts);

    // Root should be the Page 1 canvas itself
    expect(nodes[0].node_id).toBe('0:1');
    expect(nodes[0].name).toBe('Page 1');

    // Should not contain Page 2 or its children
    const ids = nodes.map((n) => n.node_id);
    expect(ids).not.toContain('0:0'); // Document
    expect(ids).not.toContain('0:2'); // Page 2
    expect(ids).not.toContain('2:1'); // Secondary Frame
  });

  it('returns only Page 2 nodes when filtering by "Page 2"', () => {
    const opts: ParseOptions = { includeHidden: false, pageFilter: 'Page 2' };
    const nodes = parseDocumentTree(doc, opts);

    expect(nodes[0].node_id).toBe('0:2');
    expect(nodes[0].name).toBe('Page 2');

    const ids = nodes.map((n) => n.node_id);
    expect(ids).not.toContain('0:1');
    expect(ids).not.toContain('1:1');
  });

  it('returns empty array for non-existent page name', () => {
    const opts: ParseOptions = { includeHidden: false, pageFilter: 'No Such Page' };
    const nodes = parseDocumentTree(doc, opts);
    expect(nodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// nodeFilter
// ---------------------------------------------------------------------------

describe('parseDocumentTree — nodeFilter', () => {
  it('returns only the subtree rooted at node "1:7"', () => {
    const opts: ParseOptions = { includeHidden: false, nodeFilter: '1:7' };
    const nodes = parseDocumentTree(doc, opts);

    // Root is the Auto Layout Row
    expect(nodes[0].node_id).toBe('1:7');
    expect(nodes[0].name).toBe('Auto Layout Row');

    // Its children should be present
    const ids = nodes.map((n) => n.node_id);
    expect(ids).toContain('1:8');
    expect(ids).toContain('1:9');

    // But not siblings or parents
    expect(ids).not.toContain('1:1');
    expect(ids).not.toContain('0:1');
    expect(ids).not.toContain('1:2');
  });

  it('returns the correct count for the "1:7" subtree', () => {
    const opts: ParseOptions = { includeHidden: false, nodeFilter: '1:7' };
    const nodes = parseDocumentTree(doc, opts);
    // 1:7 (Auto Layout Row) + 1:8 (Duplicate Blue) + 1:9 (Image Fill) = 3
    expect(nodes).toHaveLength(3);
  });

  it('returns empty array for non-existent node ID', () => {
    const opts: ParseOptions = { includeHidden: false, nodeFilter: '99:99' };
    const nodes = parseDocumentTree(doc, opts);
    expect(nodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 6 — Page/Node filtering (additional coverage)
// ---------------------------------------------------------------------------

describe('parseDocumentTree — pageFilter (Phase 6 additions)', () => {
  it('"Page 1" filter includes only nodes belonging to Page 1', () => {
    const opts: ParseOptions = { includeHidden: false, pageFilter: 'Page 1' };
    const nodes = parseDocumentTree(doc, opts);

    // Should include Page 1 canvas + Colors Frame subtree
    const ids = nodes.map((n) => n.node_id);
    expect(ids).toContain('0:1');  // Page 1 canvas
    expect(ids).toContain('1:1');  // Colors Frame
    expect(ids).toContain('1:2');  // Primary Button
    expect(ids).toContain('1:3');  // Heading Text
    expect(ids).toContain('1:4');  // Body Text
    expect(ids).toContain('1:6');  // Gradient Card
    expect(ids).toContain('1:7');  // Auto Layout Row
    expect(ids).toContain('1:8');  // Duplicate Blue
    expect(ids).toContain('1:9');  // Image Fill

    // Hidden element excluded (includeHidden=false)
    expect(ids).not.toContain('1:5');
    // Page 2 nodes excluded
    expect(ids).not.toContain('0:2');
    expect(ids).not.toContain('2:1');
  });

  it('"Page 2" filter includes "Secondary Frame"', () => {
    const opts: ParseOptions = { includeHidden: false, pageFilter: 'Page 2' };
    const nodes = parseDocumentTree(doc, opts);

    const names = nodes.map((n) => n.name);
    expect(names).toContain('Page 2');
    expect(names).toContain('Secondary Frame');

    // Page 2 canvas + Secondary Frame = 2 nodes
    expect(nodes).toHaveLength(2);
  });

  it('non-existent page filter emits warning to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const opts: ParseOptions = { includeHidden: false, pageFilter: 'No Such Page' };
      const nodes = parseDocumentTree(doc, opts);

      expect(nodes).toHaveLength(0);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Page "No Such Page" not found'),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe('parseDocumentTree — nodeFilter (Phase 6 additions)', () => {
  it('filter to "1:1" returns Colors Frame and its children only', () => {
    const opts: ParseOptions = { includeHidden: false, nodeFilter: '1:1' };
    const nodes = parseDocumentTree(doc, opts);

    // Root of result is Colors Frame
    expect(nodes[0].node_id).toBe('1:1');
    expect(nodes[0].name).toBe('Colors Frame');
    expect(nodes[0].parent_id).toBeNull();
    expect(nodes[0].depth).toBe(0);

    // Children present
    const ids = nodes.map((n) => n.node_id);
    expect(ids).toContain('1:2'); // Primary Button
    expect(ids).toContain('1:3'); // Heading Text
    expect(ids).toContain('1:4'); // Body Text
    expect(ids).toContain('1:6'); // Gradient Card
    expect(ids).toContain('1:7'); // Auto Layout Row
    expect(ids).toContain('1:8'); // Duplicate Blue
    expect(ids).toContain('1:9'); // Image Fill

    // Hidden element excluded
    expect(ids).not.toContain('1:5');

    // Parents and siblings excluded
    expect(ids).not.toContain('0:0'); // Document
    expect(ids).not.toContain('0:1'); // Page 1
    expect(ids).not.toContain('0:2'); // Page 2
    expect(ids).not.toContain('2:1'); // Secondary Frame

    // 1:1 + 5 visible direct children + 1:7 frame + 2 children of 1:7 = 8
    expect(nodes).toHaveLength(8);
  });

  it('non-existent node ID filter emits warning to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const opts: ParseOptions = { includeHidden: false, nodeFilter: '99:99' };
      const nodes = parseDocumentTree(doc, opts);

      expect(nodes).toHaveLength(0);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Node "99:99" not found'),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
