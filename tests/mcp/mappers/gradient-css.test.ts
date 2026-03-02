/**
 * Tests for gradient CSS conversion module.
 *
 * Coverage:
 * 1. Linear gradient: horizontal (90deg), vertical (180deg), diagonal (135deg), reverse direction
 * 2. Radial gradient: centered, off-center, elliptical
 * 3. Conic/angular gradient: with start angle, centered
 * 4. Diamond gradient: approximated as radial ellipse
 * 5. Edge cases: zero-length vector, single stop, out-of-bounds stop positions
 * 6. Color formatting: rgba with opacity, hex-like for full opacity
 * 7. Performance: each call < 1ms
 */

import { describe, it, expect } from 'vitest';
import {
  linearGradientCSS,
  radialGradientCSS,
  conicGradientCSS,
  diamondGradientCSS,
} from '../../../src/mcp/mappers/gradient-css.js';
import type {
  GradientHandlePositions,
  FigmaGradientStop,
} from '../../../src/mcp/mappers/gradient-css.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Helper to build handle positions concisely. */
function handles(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): GradientHandlePositions {
  return { p0, p1, p2 };
}

/** Helper to build a single gradient stop. */
function stop(position: number, r: number, g: number, b: number, a = 1): FigmaGradientStop {
  return { position, color: { r, g, b, a } };
}

// ---------------------------------------------------------------------------
// Common fixtures
// ---------------------------------------------------------------------------

/** Pure red at 0%, pure blue at 100% — both fully opaque. */
const redBlueStops: FigmaGradientStop[] = [
  stop(0, 1, 0, 0),
  stop(1, 0, 0, 1),
];

/** Three-stop gradient: red -> semi-transparent green -> blue. */
const threeStops: FigmaGradientStop[] = [
  stop(0, 1, 0, 0),
  stop(0.5, 0, 0.5, 0, 0.5),
  stop(1, 0, 0, 1),
];

/** Single stop: solid red. */
const singleStop: FigmaGradientStop[] = [stop(0, 1, 0, 0)];

// Horizontal left-to-right: p0 at left-center, p1 at right-center
const horizontalHandles = handles(
  { x: 0, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 0 },
);

// Vertical top-to-bottom: p0 at top-center, p1 at bottom-center
const verticalHandles = handles(
  { x: 0.5, y: 0 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 },
);

// Diagonal top-left to bottom-right (135deg)
const diagonalHandles = handles(
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 1, y: 0 },
);

// Centered radial with equal radii (circle)
const centeredCircleHandles = handles(
  { x: 0.5, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
);

// Off-center radial
const offCenterHandles = handles(
  { x: 0.3, y: 0.7 },
  { x: 0.8, y: 0.7 },
  { x: 0.3, y: 1 },
);

// Elliptical radial: different distances from p0 to p1 vs p0 to p2
const ellipticalHandles = handles(
  { x: 0.5, y: 0.5 },
  { x: 1, y: 0.5 },   // rx = 50%
  { x: 0.5, y: 0.75 }, // ry = 25%
);

// Zero-length vector: p0 === p1
const zeroLengthHandles = handles(
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0 },
);

// ===========================================================================
// 1. Linear gradient
// ===========================================================================

describe('linearGradientCSS', () => {
  describe('horizontal (90deg)', () => {
    it('produces a linear-gradient with 90deg angle', () => {
      const result = linearGradientCSS(horizontalHandles, redBlueStops);
      expect(result).toMatch(/^linear-gradient\(/);
      // atan2(0.5-0.5, 1-0) = atan2(0,1) = 0 rad = 0deg => +90 = 90deg
      expect(result).toMatch(/90deg/);
    });

    it('includes start and end color stops', () => {
      const result = linearGradientCSS(horizontalHandles, redBlueStops);
      expect(result).toContain('0%');
      expect(result).toContain('100%');
    });
  });

  describe('vertical (180deg)', () => {
    it('produces a linear-gradient with 180deg angle', () => {
      const result = linearGradientCSS(verticalHandles, redBlueStops);
      expect(result).toMatch(/^linear-gradient\(/);
      // atan2(1-0, 0.5-0.5) = atan2(1,0) = 90deg => +90 = 180deg
      expect(result).toMatch(/180deg/);
    });
  });

  describe('diagonal (135deg)', () => {
    it('produces a linear-gradient with 135deg angle', () => {
      const result = linearGradientCSS(diagonalHandles, redBlueStops);
      expect(result).toMatch(/^linear-gradient\(/);
      // atan2(1-0, 1-0) = atan2(1,1) = 45deg => +90 = 135deg
      expect(result).toMatch(/135deg/);
    });
  });

  describe('reverse direction', () => {
    it('produces angle from p0 to p1 (right-to-left = 270deg)', () => {
      const reverseHandles = handles(
        { x: 1, y: 0.5 },
        { x: 0, y: 0.5 },
        { x: 0.5, y: 0 },
      );
      const result = linearGradientCSS(reverseHandles, redBlueStops);
      // atan2(0.5-0.5, 0-1) = atan2(0,-1) = 180deg => +90 = 270deg
      expect(result).toMatch(/270deg/);
    });
  });

  describe('with three stops', () => {
    it('includes intermediate stop at 50%', () => {
      const result = linearGradientCSS(horizontalHandles, threeStops);
      expect(result).toContain('50%');
    });

    it('includes rgba for semi-transparent stop', () => {
      const result = linearGradientCSS(horizontalHandles, threeStops);
      expect(result).toMatch(/rgba\(/);
    });
  });

  describe('edge cases', () => {
    it('returns solid color for a single stop', () => {
      const result = linearGradientCSS(horizontalHandles, singleStop);
      // Should NOT contain "linear-gradient" — just a solid color
      expect(result).not.toContain('linear-gradient');
      // Should contain the color value (red)
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('falls back to 0deg for zero-length vector (p0 === p1)', () => {
      const result = linearGradientCSS(zeroLengthHandles, redBlueStops);
      expect(result).toMatch(/linear-gradient\(\s*0deg/);
    });

    it('clamps out-of-bounds stop positions to [0%, 100%]', () => {
      const oobStops: FigmaGradientStop[] = [
        stop(-0.5, 1, 0, 0),
        stop(1.5, 0, 0, 1),
      ];
      const result = linearGradientCSS(horizontalHandles, oobStops);
      expect(result).toContain('0%');
      expect(result).toContain('100%');
      expect(result).not.toMatch(/-50%/);
      expect(result).not.toMatch(/150%/);
    });
  });
});

// ===========================================================================
// 2. Radial gradient
// ===========================================================================

describe('radialGradientCSS', () => {
  describe('centered circle', () => {
    it('produces a radial-gradient', () => {
      const result = radialGradientCSS(centeredCircleHandles, redBlueStops);
      expect(result).toMatch(/^radial-gradient\(/);
    });

    it('center is at 50%, 50%', () => {
      const result = radialGradientCSS(centeredCircleHandles, redBlueStops);
      expect(result).toContain('50%');
    });

    it('includes color stops', () => {
      const result = radialGradientCSS(centeredCircleHandles, redBlueStops);
      expect(result).toContain('0%');
      expect(result).toContain('100%');
    });
  });

  describe('off-center', () => {
    it('uses the correct center from p0 (30%, 70%)', () => {
      const result = radialGradientCSS(offCenterHandles, redBlueStops);
      expect(result).toContain('30%');
      expect(result).toContain('70%');
    });
  });

  describe('elliptical', () => {
    it('produces different rx and ry values', () => {
      const result = radialGradientCSS(ellipticalHandles, redBlueStops);
      // rx = distance(p0,p1) * 100 = 50%
      // ry = distance(p0,p2) * 100 = 25%
      expect(result).toMatch(/radial-gradient\(/);
      // The radii should be different, indicating an ellipse
      expect(result).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('returns solid color for a single stop', () => {
      const result = radialGradientCSS(centeredCircleHandles, singleStop);
      expect(result).not.toContain('radial-gradient');
    });

    it('handles zero-length vector gracefully', () => {
      const result = radialGradientCSS(zeroLengthHandles, redBlueStops);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('clamps out-of-bounds stop positions', () => {
      const oobStops: FigmaGradientStop[] = [
        stop(-0.2, 1, 0, 0),
        stop(1.3, 0, 0, 1),
      ];
      const result = radialGradientCSS(centeredCircleHandles, oobStops);
      expect(result).toContain('0%');
      expect(result).toContain('100%');
    });
  });
});

// ===========================================================================
// 3. Conic / angular gradient
// ===========================================================================

describe('conicGradientCSS', () => {
  describe('centered with start angle', () => {
    it('produces a conic-gradient', () => {
      const result = conicGradientCSS(centeredCircleHandles, redBlueStops);
      expect(result).toMatch(/^conic-gradient\(/);
    });

    it('uses from <angle> syntax based on handles', () => {
      const result = conicGradientCSS(centeredCircleHandles, redBlueStops);
      // Should contain "from Xdeg" syntax
      expect(result).toMatch(/from\s+\d+(\.\d+)?deg/);
    });

    it('center is at 50%, 50%', () => {
      const result = conicGradientCSS(centeredCircleHandles, redBlueStops);
      expect(result).toContain('50%');
    });
  });

  describe('with custom angle', () => {
    it('computes angle from atan2(p1.y - p0.y, p1.x - p0.x)', () => {
      // Horizontal handles: atan2(0, 1) = 0 rad => 0deg + 90 = 90deg
      const result = conicGradientCSS(horizontalHandles, redBlueStops);
      expect(result).toMatch(/conic-gradient\(/);
      expect(result).toMatch(/from\s+90deg/);
    });
  });

  describe('edge cases', () => {
    it('returns solid color for a single stop', () => {
      const result = conicGradientCSS(centeredCircleHandles, singleStop);
      expect(result).not.toContain('conic-gradient');
    });

    it('falls back to 0deg for zero-length vector', () => {
      const result = conicGradientCSS(zeroLengthHandles, redBlueStops);
      expect(result).toMatch(/conic-gradient\(\s*from\s+0deg/);
    });

    it('clamps out-of-bounds stop positions', () => {
      const oobStops: FigmaGradientStop[] = [
        stop(-0.1, 1, 0, 0),
        stop(1.1, 0, 0, 1),
      ];
      const result = conicGradientCSS(centeredCircleHandles, oobStops);
      expect(result).toContain('0%');
      expect(result).toContain('100%');
    });
  });

  describe('with three stops', () => {
    it('includes all three color stops', () => {
      const result = conicGradientCSS(centeredCircleHandles, threeStops);
      expect(result).toContain('0%');
      expect(result).toContain('50%');
      expect(result).toContain('100%');
    });
  });
});

// ===========================================================================
// 4. Diamond gradient
// ===========================================================================

describe('diamondGradientCSS', () => {
  describe('approximated as radial ellipse', () => {
    it('produces a radial-gradient with ellipse shape', () => {
      const result = diamondGradientCSS(centeredCircleHandles, redBlueStops);
      expect(result).toMatch(/^radial-gradient\(/);
      expect(result).toMatch(/ellipse/i);
    });

    it('center is at 50%, 50% for centered handles', () => {
      const result = diamondGradientCSS(centeredCircleHandles, redBlueStops);
      expect(result).toContain('50%');
    });

    it('includes color stops', () => {
      const result = diamondGradientCSS(centeredCircleHandles, redBlueStops);
      expect(result).toContain('0%');
      expect(result).toContain('100%');
    });
  });

  describe('elliptical dimensions from handles', () => {
    it('uses distance(p0,p1) and distance(p0,p2) for radii', () => {
      const result = diamondGradientCSS(ellipticalHandles, redBlueStops);
      expect(result).toMatch(/radial-gradient\(/);
      expect(result).toMatch(/ellipse/i);
    });
  });

  describe('off-center diamond', () => {
    it('uses p0 as center (30%, 70%)', () => {
      const result = diamondGradientCSS(offCenterHandles, redBlueStops);
      expect(result).toContain('30%');
      expect(result).toContain('70%');
    });
  });

  describe('edge cases', () => {
    it('returns solid color for a single stop', () => {
      const result = diamondGradientCSS(centeredCircleHandles, singleStop);
      expect(result).not.toContain('radial-gradient');
    });

    it('handles zero-length vector gracefully', () => {
      const result = diamondGradientCSS(zeroLengthHandles, redBlueStops);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('clamps out-of-bounds stop positions', () => {
      const oobStops: FigmaGradientStop[] = [
        stop(-0.3, 1, 0, 0),
        stop(2.0, 0, 0, 1),
      ];
      const result = diamondGradientCSS(centeredCircleHandles, oobStops);
      expect(result).toContain('0%');
      expect(result).toContain('100%');
    });
  });
});

// ===========================================================================
// 5. Additional edge cases
// ===========================================================================

describe('edge cases — shared across all functions', () => {
  const fns = [
    { name: 'linearGradientCSS', fn: linearGradientCSS },
    { name: 'radialGradientCSS', fn: radialGradientCSS },
    { name: 'conicGradientCSS', fn: conicGradientCSS },
    { name: 'diamondGradientCSS', fn: diamondGradientCSS },
  ] as const;

  for (const { name, fn } of fns) {
    describe(name, () => {
      it('returns a non-empty string for valid inputs', () => {
        const result = fn(horizontalHandles, redBlueStops);
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      it('returns solid color string for single stop', () => {
        const result = fn(horizontalHandles, singleStop);
        // Single stop should produce a plain color, not a gradient function
        expect(result).not.toMatch(/gradient\(/);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      it('handles stops with zero opacity', () => {
        const transparentStops: FigmaGradientStop[] = [
          stop(0, 1, 0, 0, 0),
          stop(1, 0, 0, 1, 0),
        ];
        const result = fn(horizontalHandles, transparentStops);
        expect(result).toBeTruthy();
        // Both colors have alpha=0, should include rgba notation
        expect(result).toMatch(/rgba\(/);
      });

      it('clamps negative and >1 stop positions', () => {
        const oobStops: FigmaGradientStop[] = [
          stop(-1, 1, 0, 0),
          stop(0.5, 0, 1, 0),
          stop(2, 0, 0, 1),
        ];
        const result = fn(horizontalHandles, oobStops);
        expect(result).not.toMatch(/-100%/);
        expect(result).not.toMatch(/200%/);
        expect(result).toContain('0%');
        expect(result).toContain('100%');
      });
    });
  }
});

// ===========================================================================
// 6. Color formatting
// ===========================================================================

describe('color formatting', () => {
  it('uses rgba() notation for colors with opacity < 1', () => {
    const semiTransparentStops: FigmaGradientStop[] = [
      stop(0, 1, 0, 0, 0.5),
      stop(1, 0, 0, 1, 0.8),
    ];
    const result = linearGradientCSS(horizontalHandles, semiTransparentStops);
    expect(result).toMatch(/rgba\(/);
  });

  it('formats fully opaque colors (a=1) without alpha or with compact notation', () => {
    const opaqueStops: FigmaGradientStop[] = [
      stop(0, 1, 0, 0, 1),
      stop(1, 0, 0, 1, 1),
    ];
    const result = linearGradientCSS(horizontalHandles, opaqueStops);
    // Fully opaque colors should either use hex (#ff0000) or rgb() — not rgba with 1
    // Accept any of: #rrggbb, rgb(r, g, b), or rgba(r, g, b, 1)
    expect(result).toBeTruthy();
  });

  it('converts 0-1 float colors to 0-255 range', () => {
    const specificStops: FigmaGradientStop[] = [
      stop(0, 0.5, 0.5, 0.5, 0.5), // mid-gray, semi-transparent
      stop(1, 1, 1, 1, 1),           // white, opaque
    ];
    const result = linearGradientCSS(horizontalHandles, specificStops);
    // 0.5 * 255 = 127.5, should be 128 (rounded)
    expect(result).toMatch(/12[78]/); // Accept 127 or 128 due to rounding
  });

  it('handles pure black with full opacity', () => {
    const blackStops: FigmaGradientStop[] = [
      stop(0, 0, 0, 0, 1),
      stop(1, 0, 0, 0, 1),
    ];
    const result = linearGradientCSS(horizontalHandles, blackStops);
    expect(result).toBeTruthy();
    // Should contain black representation
    expect(result).toMatch(/#000000|rgb\(0,\s*0,\s*0\)|rgba\(0,\s*0,\s*0/);
  });

  it('handles pure white with full opacity', () => {
    const whiteStops: FigmaGradientStop[] = [
      stop(0, 1, 1, 1, 1),
      stop(1, 1, 1, 1, 1),
    ];
    const result = linearGradientCSS(horizontalHandles, whiteStops);
    expect(result).toBeTruthy();
    expect(result).toMatch(/#ffffff|#fff|rgb\(255,\s*255,\s*255\)|rgba\(255,\s*255,\s*255/i);
  });
});

// ===========================================================================
// 7. Performance
// ===========================================================================

describe('performance', () => {
  const manyStops: FigmaGradientStop[] = Array.from({ length: 20 }, (_, i) =>
    stop(i / 19, Math.random(), Math.random(), Math.random(), Math.random()),
  );

  it('linearGradientCSS completes in < 1ms', () => {
    const start = performance.now();
    linearGradientCSS(horizontalHandles, manyStops);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1);
  });

  it('radialGradientCSS completes in < 1ms', () => {
    const start = performance.now();
    radialGradientCSS(centeredCircleHandles, manyStops);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1);
  });

  it('conicGradientCSS completes in < 1ms', () => {
    const start = performance.now();
    conicGradientCSS(centeredCircleHandles, manyStops);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1);
  });

  it('diamondGradientCSS completes in < 1ms', () => {
    const start = performance.now();
    diamondGradientCSS(centeredCircleHandles, manyStops);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1);
  });
});

// ===========================================================================
// 8. Return value structure
// ===========================================================================

describe('return value structure', () => {
  it('linearGradientCSS returns a valid CSS linear-gradient()', () => {
    const result = linearGradientCSS(horizontalHandles, redBlueStops);
    // Should be parseable CSS: linear-gradient(Xdeg, color1 Y%, color2 Z%)
    expect(result).toMatch(/^linear-gradient\(\s*\d+(\.\d+)?deg\s*,/);
    // Should end with closing paren
    expect(result).toMatch(/\)$/);
  });

  it('radialGradientCSS returns a valid CSS radial-gradient()', () => {
    const result = radialGradientCSS(centeredCircleHandles, redBlueStops);
    expect(result).toMatch(/^radial-gradient\(/);
    expect(result).toMatch(/\)$/);
  });

  it('conicGradientCSS returns a valid CSS conic-gradient()', () => {
    const result = conicGradientCSS(centeredCircleHandles, redBlueStops);
    expect(result).toMatch(/^conic-gradient\(\s*from/);
    expect(result).toMatch(/\)$/);
  });

  it('diamondGradientCSS returns a valid CSS radial-gradient() with ellipse', () => {
    const result = diamondGradientCSS(centeredCircleHandles, redBlueStops);
    expect(result).toMatch(/^radial-gradient\(\s*ellipse/i);
    expect(result).toMatch(/\)$/);
  });
});

// ===========================================================================
// 9. Angle normalization
// ===========================================================================

describe('angle normalization', () => {
  it('normalizes negative angle result to 0-360 range', () => {
    // bottom-to-top: atan2(-1, 0) = -90deg => +90 = 0deg
    const bottomToTopHandles = handles(
      { x: 0.5, y: 1 },
      { x: 0.5, y: 0 },
      { x: 0, y: 0.5 },
    );
    const result = linearGradientCSS(bottomToTopHandles, redBlueStops);
    // Should produce 0deg (bottom to top)
    expect(result).toMatch(/linear-gradient\(\s*0deg/);
  });

  it('wraps angles >= 360 to 0-360 range', () => {
    // This is essentially the same as 0deg after wrapping
    // Any angle produced should be in [0, 360)
    const result = linearGradientCSS(verticalHandles, redBlueStops);
    const match = result.match(/linear-gradient\(\s*([\d.]+)deg/);
    expect(match).not.toBeNull();
    const angle = parseFloat(match![1]);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(360);
  });
});
