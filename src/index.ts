/**
 * Public API for FrameProof.
 * Exports key functions for use as a library.
 */

// Core pipeline
export { parseDocumentTree } from './pipeline/parse.js';
export type { ParseOptions } from './pipeline/parse.js';
export { extractAllTokens } from './pipeline/transform.js';
export { fetchAndParse, parseFileIdOrUrl } from './pipeline/fetch.js';
export { writeOutput } from './pipeline/output.js';
export type { OutputResult } from './pipeline/output.js';
export { downloadImages } from './pipeline/images.js';
export type { ImageDownloadResult } from './pipeline/images.js';

// Writers
export { generateCSS } from './writers/css.js';
export { generateJSON, generateComponentsJSON } from './writers/json.js';
export { generateManifest } from './writers/manifest.js';

// Extractors
export { extractColors } from './extractors/colors.js';
export { extractGradients } from './extractors/gradients.js';
export { extractTypography } from './extractors/typography.js';
export { extractSpacing } from './extractors/spacing.js';
export { extractRadius } from './extractors/radius.js';
export { extractShadows } from './extractors/shadows.js';
export { extractImages } from './extractors/images.js';

// Utilities
export { rgbaToHex, rgbaToCSS, hslFromRgba, figmaRgbaToInt } from './utils/color.js';
export { toKebabCase, toSnakeCase, autoNameColor, sanitizeStyleName, sanitizeNodeId } from './utils/naming.js';
export { parseVariantName } from './utils/variant-parser.js';

// API client
export { fetchFigmaFile, fetchFigmaNodes, fetchFigmaImages, downloadImage, maskToken, FigmaApiError } from './api/client.js';
export type { FetchOptions, ImageExportOptions } from './api/client.js';

// MCP modules
export { TokenCache } from './mcp/cache.js';
export type { FetchResult, FetchCallback } from './mcp/cache.js';
export { mapNodeToDetail } from './mcp/mappers/css-mapper.js';
export { linearGradientCSS, radialGradientCSS, conicGradientCSS, diamondGradientCSS } from './mcp/mappers/gradient-css.js';
export type { GradientHandlePositions, FigmaGradientStop } from './mcp/mappers/gradient-css.js';
export { deduplicateStyles, deduplicateStylesArray } from './mcp/utils/style-dedup.js';
export { collapseSvgGroups } from './mcp/utils/svg-collapse.js';

// Visual audit and pixel-perfect gate
export { comparePngRmse, identifyPng } from './visual/image.js';
export { captureLiveViewport, launchChromium, findChromeExecutable } from './visual/browser.js';
export { exportFigmaReference, copyImageReference, createFigmaFetch } from './visual/figma-reference.js';
export { runVisualGate } from './visual/gate.js';
export type {
  GateVerdict,
  GateCheck,
  GateReport,
  GateViewportResult,
  ViewportPreset,
  ImageSize,
} from './visual/types.js';
export type { VisualGateOptions } from './visual/gate.js';

// MCP types
export type {
  CacheEntry,
  NodeDetail,
  TextSegment,
  CSSMappedFill,
  CSSMappedStroke,
  CSSMappedEffect,
  CSSMappedValue,
  CSSMappedTypography,
  LayoutInfo,
  ComponentRef,
  DocumentStructure,
  PageSummary,
  FrameSummary,
  TokenSearchResult,
  TokenMatch,
  GradientStop,
  SharedStyleRef,
  SharedStylesMap,
  NodeDetailDeduped,
} from './types/mcp.js';

// Types
export type {
  ParseContext,
  FigmaFile,
  ParsedNode,
  RGBA,
  ColorToken,
  GradientToken,
  GradientStop as GradientTokenStop,
  TypographyToken,
  SpacingToken,
  RadiusToken,
  ShadowToken,
  ImageToken,
  ComponentInfo,
  ComponentChild,
  VariantInfo,
  AllTokens,
  OutputManifest,
  StyleMeta,
  ComponentMeta,
  ComponentSetMeta,
} from './types/tokens.js';
