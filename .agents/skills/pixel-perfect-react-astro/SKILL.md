# Pixel-Perfect React/Astro Orchestrator

Use this skill when the user provides a Figma link or screenshot and wants React, Next, or Astro implementation/fixes with strict pixel-perfect verification.

## Trigger

- "implement this Figma" for React/Astro/Next
- "make it pixel-perfect"
- "fix layout against Figma"
- "strict visual gate"
- Any request that identifies this source checkout as the orchestration source
- A bare Figma link plus a route/page URL. Treat this as a full-page task, not a request for one block.

## Required Behavior

- Work continuously until strict gates pass or a concrete blocker is proven.
- Do not stop after a plan, first pass, or subjective visual similarity.
- Use `figma_scaler` MCP tools for measurements and assets; do not infer sizes from screenshots alone.
- Save Figma artifacts under `.figma/` and verification artifacts under `.pixel-perfect/`.
- Read project context and design-system files before editing: `CLAUDE.md`, `AGENTS.md`, `README`, docs, package scripts, style/theme/token files, shared UI/components.
- Preserve existing architecture. Prefer Feature-Sliced Design layering when introducing new structure.
- One Figma link is enough. Do not ask the user to send every section separately.
- If the Figma file contains multiple pages, top-level frames, or desktop/tablet/mobile variants, inventory and process them all unless the user explicitly narrows scope.

## MCP Sequence

1. Load prompt `pixel_perfect_orchestration`.
2. Call `plan_pixel_perfect_workflow` with the Figma URL, target route/page URL, framework, and project root. This creates an inventory and runbook only; known selectors are optional and must be discovered during implementation when missing.
3. Load prompts `read_design_strategy` and `layout_strategy`.
4. Run `get_document_structure`, `get_screenshot`, `get_design_tokens`, `get_css_variables`, `get_frame_overview`, `batch_screenshots`, per-section/per-breakpoint `get_node_info`, `export_node_image`, and `export_page_analysis`.
5. Implement section by section.
6. Run `figma-scaler gate --real-flow --fail-on-review` for every stable edited selector.
7. If the gate fails, inspect artifacts, fix, and rerun. Repeat until PASS.

## Full-Page Discovery

- Parse every relevant top-level Figma frame/page automatically.
- Detect breakpoint variants by names and widths: desktop/web, tablet, mobile/phone and common widths like 1920, 1440, 1024, 390, 375.
- When a root frame contains desktop/tablet/mobile children, treat those children as breakpoint variants of one page or component.
- When each breakpoint frame contains child sections, group sections across breakpoints by section name and process every variant.
- When a Figma node describes a single functional block, still process all desktop/tablet/mobile variants inside it.
- Generate or discover live selectors per section; do not require the user to provide block links/selectors up front.

## Four-Pass Section Loop

1. Geometry/layout: dimensions, container, padding, gap, alignment, order, clipping, constraints.
2. Typography/tokens: font family, size, weight, line-height, letter-spacing, wrapping, colors, mixed text.
3. Assets/styling: exact SVG/PNG, gradients, image crop, borders, radii, shadows, opacity, blend modes.
4. Responsive/behavior: desktop/tablet/mobile nodes, overflow, semantic visibility, interaction states, stale CSS/assets.

## Design System Rules

- Use existing fonts, CSS variables, theme files, shared UI, and public assets before adding new values.
- Treat `token_hints` as non-authoritative suggestions derived from observed values.
- Preserve the exact Figma value unless an authoritative Figma variable or verified project token intentionally replaces it.
- For Astro page work, do not mutate shared `Header`, `Footer`, or global UI for one route unless explicitly global.
- For React/Next, add variants/props to shared components instead of forking component families.
- Do not invent responsive layouts when Figma has breakpoint-specific frames.

## Final Acceptance

The task is incomplete while any edited selector/breakpoint has `FAIL` or final `REVIEW`. Only close with fresh artifacts from the last edit. Residuals must be classified as `renderer_only_drift`, `content_drift`, `asset_blocker`, `access_blocker`, or `implementation_blocker`.
