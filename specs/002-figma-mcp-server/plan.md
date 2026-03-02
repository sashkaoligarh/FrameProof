# Implementation Plan: Figma MCP Server

**Branch**: `002-figma-mcp-server` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-figma-mcp-server/spec.md`

## Summary

Build an MCP server on top of the existing figma-scaler library that exposes
design token extraction, node inspection, image export, and AI-optimized
context generation as MCP tools for Claude Code. Includes 3 MCP prompts
for guiding AI toward pixel-perfect layout, 1 MCP resource for token access,
and an in-memory cache with 30-minute TTL.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), ESM, Node.js >= 20
**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.27.0, `zod` ^3.22.0, existing figma-scaler modules
**Storage**: In-memory cache (Map<string, CacheEntry>), no external storage
**Testing**: vitest (existing), fixture-based tests for MCP handlers
**Target Platform**: Local Node.js process, stdio transport
**Project Type**: MCP server (extension of existing CLI library)
**Performance Goals**: <1s for cached responses, <30s for first fetch of 5000-node file
**Constraints**: Single-process, in-memory only, no external services beyond Figma API
**Scale/Scope**: Single user, 1-5 concurrent Figma files in cache

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Parsing Fidelity | PASS | Reuses existing extractors, no data loss |
| II. AI-Optimized Output | PASS | NodeDetail with inline CSS mappings, design context, MCP prompts |
| III. Data Integrity | PASS | Errors surfaced as MCP error responses, not silently dropped |
| IV. Test-Driven Parsing | PASS | MCP handlers tested with Figma API fixtures |
| V. Simplicity & Predictability | PASS | No new abstractions beyond cache + MCP wrappers. Deterministic: same input → same output |

**Data Quality Standards**:
- Completeness: All figma-scaler token types exposed via MCP
- Accuracy: Values pass through unmodified from extractors
- Consistency: JSON output snake_case, CSS output kebab-case (existing convention)
- Traceability: node_id preserved in all responses
- Error reporting: FigmaApiError caught and formatted as MCP error text

**Post-Phase 1 re-check**: PASS — NodeDetail format adds CSS mappings but preserves raw values. No lossy transformations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/002-figma-mcp-server/
├── plan.md              # This file
├── research.md          # Phase 0: MCP SDK research, reuse strategy
├── data-model.md        # Phase 1: CacheEntry, NodeDetail, CSS mapping types
├── quickstart.md        # Phase 1: Setup and usage guide
├── contracts/
│   ├── mcp-tools.md     # Phase 1: Tool parameter/response contracts
│   └── mcp-prompts.md   # Phase 1: Prompt content contracts
└── tasks.md             # Phase 2: Task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── mcp/
│   ├── server.ts        # MCP server entry point (McpServer + tools + prompts + resources)
│   ├── cache.ts         # In-memory cache with TTL and dedup
│   ├── tools/
│   │   ├── get-design-tokens.ts
│   │   ├── get-node-info.ts
│   │   ├── get-nodes-info.ts
│   │   ├── get-css-variables.ts
│   │   ├── export-node-image.ts
│   │   ├── get-document-structure.ts
│   │   ├── get-design-context.ts
│   │   └── search-token.ts
│   ├── prompts/
│   │   ├── layout-strategy.ts
│   │   ├── read-design-strategy.ts
│   │   └── token-usage-rules.ts
│   ├── resources/
│   │   └── figma-tokens.ts
│   └── mappers/
│       └── css-mapper.ts    # Maps node properties to CSS variables
├── api/
│   └── client.ts        # (existing) — no changes
├── extractors/          # (existing) — no changes
├── pipeline/            # (existing) — no changes
├── writers/             # (existing) — no changes
├── types/
│   ├── tokens.ts        # (existing) — no changes
│   └── mcp.ts           # New MCP-specific types (NodeDetail, CacheEntry, etc.)
├── utils/               # (existing) — no changes
├── cli.ts               # (existing) — no changes
└── index.ts             # (existing) — add MCP exports

tests/
├── mcp/
│   ├── cache.test.ts
│   ├── tools/
│   │   ├── get-design-tokens.test.ts
│   │   ├── get-node-info.test.ts
│   │   ├── get-nodes-info.test.ts
│   │   ├── get-css-variables.test.ts
│   │   ├── export-node-image.test.ts
│   │   ├── get-document-structure.test.ts
│   │   ├── get-design-context.test.ts
│   │   └── search-token.test.ts
│   └── mappers/
│       └── css-mapper.test.ts
├── fixtures/            # (existing) — add MCP-specific fixtures
└── ...                  # (existing tests unchanged)
```

**Structure Decision**: Single project layout (Option 1). MCP server is a new
`src/mcp/` module within the existing codebase, sharing all extractors, pipeline,
and writers. New entry point at `src/mcp/server.ts` alongside existing `src/cli.ts`.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
