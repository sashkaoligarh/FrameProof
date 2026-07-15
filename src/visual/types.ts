export type GateVerdict = 'PASS' | 'REVIEW' | 'FAIL';
export type GateCheckVerdict = GateVerdict | 'SKIP';
export type ComparisonMode = 'exact-frame' | 'responsive-flow';

export interface ViewportPreset {
  name: string;
  referenceName?: string;
  width: number;
  height: number;
  comparisonMode?: ComparisonMode;
  preserveWidth?: boolean;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface GateCheck {
  check: string;
  verdict: GateCheckVerdict;
  notes: string;
  figmaSource?: string;
  liveSource?: string;
}

export interface GateCaptureDiagnostics {
  status: number | null;
  ok: boolean;
  fullPath?: string;
  consoleMessages: Array<{
    type: string;
    text: string;
    location?: { url: string; lineNumber: number; columnNumber: number };
  }>;
  failedRequests: Array<{ method: string; url: string; failure: string }>;
  pageErrors: string[];
}

export interface GateViewportResult {
  viewport: ViewportPreset;
  verdict: GateVerdict;
  checks: GateCheck[];
  referencePath?: string;
  livePath?: string;
  domPath?: string;
  diagnostics: GateCaptureDiagnostics;
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
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 1366 },
  { name: 'mobile', width: 375, height: 844 },
  { name: 'ultrawide', referenceName: 'desktop', width: 2412, height: 1000, comparisonMode: 'responsive-flow' },
];

export function worstVerdict(verdicts: GateCheckVerdict[]): GateVerdict {
  if (verdicts.includes('FAIL')) return 'FAIL';
  if (verdicts.includes('REVIEW')) return 'REVIEW';
  return 'PASS';
}
