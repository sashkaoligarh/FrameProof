export const PIXEL_PERFECT_ORCHESTRATION_NAME = 'pixel_perfect_orchestration';
export const PIXEL_PERFECT_ORCHESTRATION_DESCRIPTION =
  'Continuous React/Astro pixel-perfect implementation protocol with strict visual gates';

export const PIXEL_PERFECT_ORCHESTRATION_MESSAGE = `Use this protocol when a user asks to implement or fix React/Astro UI from Figma with strict pixel-perfect requirements.

## Operating Mode

- Work in continuous_until_pass mode: do not stop at analysis, first implementation, or partial similarity.
- Stop only when fresh post-edit visual gates pass, or when a concrete blocker is proven and classified.
- Never claim pixel-perfect from screenshots captured before the last code change.
- Treat a single Figma link as full-page/full-scope input. Do not ask the user for every block link.

## Mandatory Setup

1. Read project context files: CLAUDE.md, AGENTS.md, README, docs, package scripts, style/theme/token files.
2. Identify framework and architecture: Astro, React, Next, Feature-Sliced Design, or project-native layering.
3. Discover existing design system: fonts, colors, spacing, typography, shadows, radii, shared UI, public assets.
4. Call pixel_perfect_orchestrator to create the full-page inventory, runbook, and final gate commands.
5. Save Figma artifacts in .figma/ and validation artifacts in .pixel-perfect/.

## Full-Page Discovery

- Inventory every relevant page, top-level frame, and direct child section before editing.
- Detect desktop/tablet/mobile variants by frame names and widths.
- If a root frame contains breakpoint children, group them as variants of one page/component.
- If breakpoint frames contain sections, group sections across breakpoints and process every variant.
- If the Figma node describes one functional block, treat it as the full scope and still inspect all breakpoint variants inside it.
- Selectors are optional; discover or create stable live selectors per section when the user did not provide them.

## Figma Extraction Order

1. read_design_strategy
2. layout_strategy
3. get_document_structure
4. get_screenshot for every root frame/breakpoint
5. get_design_tokens save_to=".figma/tokens.json"
6. get_css_variables save_to=".figma/design-system.css"
7. get_frame_overview for every root frame/breakpoint
8. batch_screenshots for every section list
9. get_node_info per section/breakpoint with save_to
10. export_node_image for exact SVG/PNG assets
11. export_page_analysis save_to=".figma/page-analysis.md"

## Edit Loop

For each section and each available breakpoint, run these passes until the visual gate passes:

1. Geometry/layout: dimensions, container, padding, gap, alignment, order, clipping, constraints.
2. Typography/tokens: font family, size, weight, line-height, letter-spacing, wrapping, colors, mixed text.
3. Assets/styling: exact icons/images, gradients, image crop, borders, radii, shadows, opacity, blend modes.
4. Responsive/behavior: tablet/mobile nodes, overflow, semantic visibility, interaction states, stale served CSS/assets.

After each substantive edit, run a fresh capture and compare. If the gate fails, inspect artifacts, fix the root cause, and rerun.

## Design-System Rules

- Use existing project tokens/classes/components before introducing new raw values.
- If Figma token_hints delta <= 2px, prefer the token.
- If delta > 2px, raw px is allowed only when documented in the run artifact.
- Preserve Feature-Sliced boundaries: shared/ui, shared/assets, entities, features, widgets/sections, pages/app.
- For Astro, keep one-page fixes inside page sections unless the task is explicitly global.
- For React/Next, extend shared components with variants instead of duplicating component families.
- Do not invent tablet/mobile layouts when Figma has breakpoint-specific nodes.
- Use exact Figma assets for icons/illustrations/backgrounds; approximations are visual bugs.

## Final Closure

Run figma-scaler gate with --real-flow --fail-on-review for every stable selector. Any FAIL or REVIEW is non-closable unless classified as renderer_only_drift, content_drift, asset_blocker, access_blocker, or implementation_blocker with artifact evidence.`;
