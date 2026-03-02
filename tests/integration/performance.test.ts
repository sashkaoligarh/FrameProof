/**
 * T069 — Performance test.
 * Generates a fixture with 5000+ nodes, measures parse + extract time.
 * MUST complete in < 30 seconds (SC-004).
 */

import { describe, it, expect } from 'vitest';
import type { Node } from '@figma/rest-api-spec';
import { parseDocumentTree } from '../../src/pipeline/parse.js';
import { extractAllTokens } from '../../src/pipeline/transform.js';

function generateLargeFixture(nodeCount: number): Node {
  const children: Record<string, unknown>[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const nodeType = i % 5;
    let node: Record<string, unknown>;

    switch (nodeType) {
      case 0:
        // RECTANGLE with solid fill
        node = {
          id: `${100 + Math.floor(i / 10)}:${i}`,
          name: `rect-${i}`,
          type: 'RECTANGLE',
          visible: true,
          absoluteBoundingBox: { x: 0, y: i * 50, width: 200, height: 48 },
          fills: [{
            type: 'SOLID',
            color: { r: (i % 256) / 255, g: ((i * 3) % 256) / 255, b: ((i * 7) % 256) / 255, a: 1 },
            opacity: 1,
            visible: true,
          }],
          strokes: [],
          effects: i % 20 === 0 ? [{
            type: 'DROP_SHADOW',
            visible: true,
            color: { r: 0, g: 0, b: 0, a: 0.1 },
            offset: { x: 0, y: 2 },
            radius: 4,
            spread: 0,
          }] : [],
          cornerRadius: i % 3 === 0 ? 8 : 0,
        };
        break;
      case 1:
        // TEXT node
        node = {
          id: `${100 + Math.floor(i / 10)}:${i}`,
          name: `text-${i}`,
          type: 'TEXT',
          visible: true,
          absoluteBoundingBox: { x: 0, y: i * 50, width: 300, height: 24 },
          fills: [{
            type: 'SOLID',
            color: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
            opacity: 1,
            visible: true,
          }],
          strokes: [],
          effects: [],
          characters: `Sample text ${i}`,
          style: {
            fontFamily: i % 3 === 0 ? 'Inter' : i % 3 === 1 ? 'Roboto' : 'Open Sans',
            fontSize: 12 + (i % 5) * 4,
            fontWeight: i % 2 === 0 ? 400 : 700,
            fontPostScriptName: 'Inter-Regular',
            lineHeightPx: 20 + (i % 5) * 4,
            lineHeightUnit: 'PIXELS',
            letterSpacing: 0,
            textCase: 'ORIGINAL',
            textDecoration: 'NONE',
            textAlignHorizontal: 'LEFT',
          },
        };
        break;
      case 2:
        // FRAME with auto-layout
        node = {
          id: `${100 + Math.floor(i / 10)}:${i}`,
          name: `frame-${i}`,
          type: 'FRAME',
          visible: true,
          absoluteBoundingBox: { x: 0, y: i * 50, width: 400, height: 200 },
          fills: [],
          strokes: [],
          effects: [],
          layoutMode: i % 2 === 0 ? 'HORIZONTAL' : 'VERTICAL',
          paddingTop: 8 + (i % 4) * 4,
          paddingRight: 8 + (i % 4) * 4,
          paddingBottom: 8 + (i % 4) * 4,
          paddingLeft: 8 + (i % 4) * 4,
          itemSpacing: 4 + (i % 6) * 4,
          counterAxisSpacing: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          children: [],
        };
        break;
      case 3:
        // RECTANGLE with gradient
        node = {
          id: `${100 + Math.floor(i / 10)}:${i}`,
          name: `gradient-${i}`,
          type: 'RECTANGLE',
          visible: true,
          absoluteBoundingBox: { x: 0, y: i * 50, width: 200, height: 100 },
          fills: [{
            type: 'GRADIENT_LINEAR',
            visible: true,
            opacity: 1,
            gradientHandlePositions: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
            gradientStops: [
              { position: 0, color: { r: (i % 256) / 255, g: 0.3, b: 0.9, a: 1 } },
              { position: 1, color: { r: 0.9, g: 0.3, b: (i % 256) / 255, a: 1 } },
            ],
          }],
          strokes: [],
          effects: [],
        };
        break;
      default:
        // ELLIPSE with image fill
        node = {
          id: `${100 + Math.floor(i / 10)}:${i}`,
          name: `image-${i}`,
          type: 'RECTANGLE',
          visible: true,
          absoluteBoundingBox: { x: 0, y: i * 50, width: 100, height: 100 },
          fills: [{
            type: 'IMAGE',
            visible: true,
            opacity: 1,
            imageRef: `hash-${i}`,
            scaleMode: 'FILL',
          }],
          strokes: [],
          effects: [],
        };
        break;
    }

    children.push(node);
  }

  // Nest nodes into frames to create depth
  const frames: Record<string, unknown>[] = [];
  const chunkSize = 50;
  for (let i = 0; i < children.length; i += chunkSize) {
    const chunk = children.slice(i, i + chunkSize);
    frames.push({
      id: `frame-group:${i}`,
      name: `Group ${Math.floor(i / chunkSize)}`,
      type: 'FRAME',
      visible: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 1000 },
      fills: [],
      strokes: [],
      effects: [],
      children: chunk,
    });
  }

  return {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [{
      id: '0:1',
      name: 'Performance Test Page',
      type: 'CANVAS',
      children: frames,
    }],
  } as unknown as Node;
}

describe('Performance test', () => {
  it('parses and extracts 5000+ nodes in under 30 seconds (SC-004)', () => {
    const NODE_COUNT = 5000;
    const document = generateLargeFixture(NODE_COUNT);

    const start = performance.now();

    const nodes = parseDocumentTree(document, { includeHidden: false });
    const tokens = extractAllTokens(nodes);

    const elapsed = performance.now() - start;
    const elapsedSeconds = elapsed / 1000;

    // Verify we actually processed enough nodes
    expect(nodes.length).toBeGreaterThanOrEqual(NODE_COUNT);

    // Verify tokens were extracted
    expect(tokens.colors.length).toBeGreaterThan(0);
    expect(tokens.typography.length).toBeGreaterThan(0);
    expect(tokens.spacing.length).toBeGreaterThan(0);
    expect(tokens.gradients.length).toBeGreaterThan(0);
    expect(tokens.images.length).toBeGreaterThan(0);

    // Performance assertion: must complete in under 30 seconds
    expect(elapsedSeconds).toBeLessThan(30);

    // Log performance info
    process.stderr.write(
      `Performance: ${nodes.length} nodes parsed + extracted in ${elapsedSeconds.toFixed(2)}s\n`,
    );
  });
});
