# figma-scaler

Pixel-perfect Figma extraction, orchestration, and visual gate toolkit for AI-assisted React/Astro development.

## What It Does

- Extracts Figma tokens, CSS variables, node data, screenshots, assets, and page analysis.
- Exposes MCP tools/prompts for agents that implement UI from Figma.
- Provides `pixel_perfect_orchestrator` for continuous-until-pass React/Astro workflows.
- Provides `figma-scaler gate` to compare a live selector against Figma/reference screenshots with PNG RMSE, DOM checks, overflow checks, and strict final verdicts.

## Commands

```bash
npm run build
npm test
npm run lint
```

Parse Figma tokens:

```bash
figma-scaler parse "https://www.figma.com/design/FILE/Name"
```

Run a strict visual gate:

```bash
figma-scaler gate \
  --page-url "http://localhost:3000/pricing" \
  --selector ".pricing-hero" \
  --figma-url "https://www.figma.com/design/FILE/Name?node-id=1-2" \
  --real-flow \
  --fail-on-review
```

## Pixel-Perfect Protocol

See `docs/pixel-perfect-react-astro-system.md` and `.agents/skills/pixel-perfect-react-astro/SKILL.md`.
