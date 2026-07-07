# Pixel-Perfect React/Astro System

`figma_scaler` is now the control plane for strict Figma-to-code work in React, Next, and Astro projects. The intended use is not a one-shot screenshot glance. It is a continuous loop: extract exact design data, implement section by section, capture live UI, compare, fix, and repeat until the strict gate passes.

## Core Contract

- Do not stop at analysis, first implementation, or subjective similarity.
- Final closure requires fresh post-edit screenshots and `figma-scaler gate` PASS.
- `FAIL` and final `REVIEW` are not acceptable closure states.
- Save Figma artifacts in `.figma/` and visual audit artifacts in `.pixel-perfect/`.
- Use project tokens, fonts, shared components, and assets before adding raw values.
- Follow Feature-Sliced Design by default: `shared`, `entities`, `features`, `widgets`, `pages`, `app`.
- For Astro projects, map this to the actual project structure when it already exists, for example `components/ui`, `components/sections`, `components/pages`, `styles`, `layouts`, `pages`.
- One Figma link is treated as a full-page/full-scope source. The agent must discover every relevant frame, section, and breakpoint variant automatically.

## Mandatory MCP Sequence

Use these before writing UI code:

1. `pixel_perfect_orchestration` prompt
2. `pixel_perfect_orchestrator` tool
3. `read_design_strategy` prompt
4. `layout_strategy` prompt
5. `get_document_structure`
6. `get_screenshot` for each root frame/breakpoint
7. `get_design_tokens` with `save_to=".figma/tokens.json"`
8. `get_css_variables` with `save_to=".figma/design-system.css"`
9. `get_frame_overview` for each root frame/breakpoint
10. `batch_screenshots` for every section list
11. `get_node_info` per section and breakpoint with `save_to`
12. `export_node_image` for exact SVG/PNG assets
13. `export_page_analysis` with `output_path=".figma/page-analysis.md"`

## Full-Page Discovery

- Do not ask the user for each block separately.
- If the Figma file has multiple pages or top-level frames, inventory them all first.
- Detect desktop/tablet/mobile variants by names and widths.
- If a root frame contains desktop/tablet/mobile children, group them as one page/component scope.
- If breakpoint frames contain child sections, group those sections across breakpoints by name and process every variant.
- If the Figma node describes one functional block, treat that block as the full scope and still inspect every breakpoint variant inside it.
- Selectors are optional user input. When missing, discover or create stable live selectors for each section during implementation.

## Section Loop

For every section and breakpoint, repeat these passes until the gate passes:

1. Geometry/layout: frame size, container, padding, gap, alignment, order, clipping, constraints.
2. Typography/tokens: font family, size, weight, line-height, letter-spacing, wrapping, colors, mixed text.
3. Assets/styling: exact icons/images, gradients, crop, borders, radii, shadows, opacity, blend modes.
4. Responsive/behavior: desktop/tablet/mobile nodes, overflow, semantic visibility, interaction states, stale CSS/assets.

## CLI Gate

Use the gate from the target project root after building this package:

```bash
figma-scaler gate \
  --page-url "http://localhost:3000/pricing" \
  --selector ".pricing-hero" \
  --figma-url "https://www.figma.com/design/FILE/Name?node-id=1-2" \
  --real-flow \
  --fail-on-review
```

Per-breakpoint references:

```bash
figma-scaler gate \
  --route "/pricing" \
  --base-url "http://localhost:3000" \
  --selector ".pricing-hero" \
  --figma-url-desktop "<desktop-node-url>" \
  --figma-url-tablet "<tablet-node-url>" \
  --figma-url-mobile "<mobile-node-url>" \
  --real-flow \
  --fail-on-review
```

The gate writes `REPORT.md`, `summary.json`, live screenshots, Figma references, DOM reports, and diff PNGs under `.pixel-perfect/figma-gate/`.

## Closure Rules

- Use `--real-flow --fail-on-review` for final block gates.
- Do not use `--soft-size-mismatch` for final closure.
- Match selector scope to Figma node scope. Do not compare a live section to a Figma node that also contains shared header/footer unless the live selector includes that same scope.
- If a Figma node is already an exact section node, do not auto-adapt to child breakpoint nodes unless explicitly intended.
- Classify unavoidable residuals as `renderer_only_drift`, `content_drift`, `asset_blocker`, `access_blocker`, or `implementation_blocker` with artifact evidence.

## Anti-Hardcode Rules

- Use `token_hints`, `applied_styles`, and existing project token files before adding raw values.
- If delta is `<= 2px`, use the nearest token by default.
- If delta is `> 2px`, raw value is allowed only when documented in the audit artifact.
- Exact assets beat approximations: export real SVG icons and PNG images from Figma.
- Exact screenshot overlays are diagnostic or last-resort; semantic markup plus exact assets is the default.
