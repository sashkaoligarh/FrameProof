export type GateVerdict = 'PASS' | 'REVIEW' | 'FAIL';

export interface ViewportPreset {
  name: string;
  referenceName?: string;
  width: number;
  height: number;
  preserveWidth?: boolean;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface GateCheck {
  check: string;
  verdict: GateVerdict;
  notes: string;
  figmaSource?: string;
  liveSource?: string;
}

export interface GateViewportResult {
  viewport: ViewportPreset;
  verdict: GateVerdict;
  checks: GateCheck[];
  referencePath?: string;
  livePath?: string;
  domPath?: string;
}

export interface GateReport {
  verdict: GateVerdict;
  outputDir: string;
  reportPath: string;
  jsonPath: string;
  pageUrl: string;
  selector: string;
  threshold: number;
  sizeTolerance: number;
  viewports: GateViewportResult[];
}

export const DEFAULT_VIEWPORTS: ViewportPreset[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 1366 },
  { name: 'mobile', width: 390, height: 844 },
];

export const REAL_FLOW_VIEWPORTS: ViewportPreset[] = [
  { name: 'desktop', width: 1920, height: 900 },
  { name: 'tablet', width: 1024, height: 1366 },
  { name: 'mobile', width: 375, height: 844 },
  { name: 'ultrawide', referenceName: 'desktop', width: 2412, height: 1000, preserveWidth: true },
];

export function worstVerdict(verdicts: GateVerdict[]): GateVerdict {
  if (verdicts.includes('FAIL')) return 'FAIL';
  if (verdicts.includes('REVIEW')) return 'REVIEW';
  return 'PASS';
}
