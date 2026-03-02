/**
 * Gradient CSS mapper — converts Figma gradient handle positions to CSS gradient syntax.
 *
 * Pure function module with no side effects and no imports from other project files.
 * Handles linear, radial, conic (angular), and diamond gradient types.
 */

export interface GradientHandlePositions {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
}

export interface FigmaGradientStop {
  position: number;
  color: { r: number; g: number; b: number; a: number };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert Figma linear gradient handles + stops to a CSS `linear-gradient(...)` string.
 *
 * angle = atan2(p1.y - p0.y, p1.x - p0.x) * (180/PI) + 90
 */
export function linearGradientCSS(
  handles: GradientHandlePositions,
  stops: FigmaGradientStop[],
): string {
  if (isSingleStop(stops)) {
    return formatSolidColor(stops[0]);
  }

  const angle = computeAngle(handles);
  const stopsStr = formatStops(stops);
  return `linear-gradient(${round1(angle)}deg, ${stopsStr})`;
}

/**
 * Convert Figma radial gradient handles + stops to a CSS `radial-gradient(...)` string.
 *
 * center = (p0.x * 100)%, (p0.y * 100)%
 * rx = distance(p0, p1) * 100
 * ry = distance(p0, p2) * 100
 */
export function radialGradientCSS(
  handles: GradientHandlePositions,
  stops: FigmaGradientStop[],
): string {
  if (isSingleStop(stops)) {
    return formatSolidColor(stops[0]);
  }

  const { cx, cy, rx, ry } = computeRadialParams(handles);
  const stopsStr = formatStops(stops);
  return `radial-gradient(ellipse ${round1(rx)}% ${round1(ry)}% at ${round1(cx)}% ${round1(cy)}%, ${stopsStr})`;
}

/**
 * Convert Figma angular (conic) gradient handles + stops to a CSS `conic-gradient(...)` string.
 *
 * center = (p0.x * 100)%, (p0.y * 100)%
 * angle = atan2(p1.y - p0.y, p1.x - p0.x) * (180/PI) + 90
 */
export function conicGradientCSS(
  handles: GradientHandlePositions,
  stops: FigmaGradientStop[],
): string {
  if (isSingleStop(stops)) {
    return formatSolidColor(stops[0]);
  }

  const cx = round1(handles.p0.x * 100);
  const cy = round1(handles.p0.y * 100);
  const angle = computeAngle(handles);
  const stopsStr = formatStops(stops);
  return `conic-gradient(from ${round1(angle)}deg at ${cx}% ${cy}%, ${stopsStr})`;
}

/**
 * Convert Figma diamond gradient handles + stops to a CSS `radial-gradient(...)` string.
 *
 * CSS has no native diamond gradient, so we approximate with an ellipse (same as radial).
 */
export function diamondGradientCSS(
  handles: GradientHandlePositions,
  stops: FigmaGradientStop[],
): string {
  if (isSingleStop(stops)) {
    return formatSolidColor(stops[0]);
  }

  const { cx, cy, rx, ry } = computeRadialParams(handles);
  const stopsStr = formatStops(stops);
  return `radial-gradient(ellipse ${round1(rx)}% ${round1(ry)}% at ${round1(cx)}% ${round1(cy)}%, ${stopsStr})`;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Format an array of Figma gradient stops into a CSS stop list string.
 * Colors are formatted as `rgba(R, G, B, A)` with R,G,B as 0-255 integers and A as 0-1 float.
 * Stop positions are clamped to [0%, 100%] and rounded to 1 decimal place.
 */
function formatStops(stops: FigmaGradientStop[]): string {
  return stops
    .map((s) => {
      const r = Math.round(s.color.r * 255);
      const g = Math.round(s.color.g * 255);
      const b = Math.round(s.color.b * 255);
      const a = round1(s.color.a);
      const pos = round1(clamp(s.position, 0, 1) * 100);
      return `rgba(${r}, ${g}, ${b}, ${a}) ${pos}%`;
    })
    .join(', ');
}

/**
 * Compute the gradient angle from handle positions.
 * angle = atan2(p1.y - p0.y, p1.x - p0.x) * (180 / PI) + 90
 * Falls back to 0 when p0 === p1 (zero-length vector).
 */
function computeAngle(handles: GradientHandlePositions): number {
  const dx = handles.p1.x - handles.p0.x;
  const dy = handles.p1.y - handles.p0.y;

  // Zero-length gradient vector: fallback to 0deg
  if (dx === 0 && dy === 0) {
    return 0;
  }

  const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  return normalizeAngle(angle);
}

/**
 * Compute radial gradient parameters (center, rx, ry) from handle positions.
 */
function computeRadialParams(handles: GradientHandlePositions): {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
} {
  const cx = handles.p0.x * 100;
  const cy = handles.p0.y * 100;
  const rx = distance(handles.p0, handles.p1) * 100;
  const ry = distance(handles.p0, handles.p2) * 100;
  return { cx, cy, rx, ry };
}

/**
 * Euclidean distance between two 2D points.
 */
function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalize an angle to the [0, 360) range.
 */
function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Clamp a numeric value to [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round a number to 1 decimal place.
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Check if stops array has a single entry (or is empty).
 */
function isSingleStop(stops: FigmaGradientStop[]): stops is [FigmaGradientStop] {
  return stops.length === 1;
}

/**
 * Format a single stop as a solid rgba color (no gradient needed).
 */
function formatSolidColor(stop: FigmaGradientStop): string {
  const r = Math.round(stop.color.r * 255);
  const g = Math.round(stop.color.g * 255);
  const b = Math.round(stop.color.b * 255);
  const a = round1(stop.color.a);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
