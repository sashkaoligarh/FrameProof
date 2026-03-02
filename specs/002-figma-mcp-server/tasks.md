# Tasks: Figma MCP Server for Claude Code

**Input**: Design documents from `/specs/002-figma-mcp-server/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per constitution principle IV (Test-Driven Parsing).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install MCP SDK, create directory structure, define types

- [X] T001 Install `@modelcontextprotocol/sdk` and `zod` dependencies via `npm install @modelcontextprotocol/sdk zod`
- [X] T002 Create MCP directory structure: `src/mcp/`, `src/mcp/tools/`, `src/mcp/prompts/`, `src/mcp/resources/`, `src/mcp/mappers/`, `tests/mcp/`, `tests/mcp/tools/`, `tests/mcp/mappers/`
- [X] T003 Define MCP-specific types (CacheEntry, NodeDetail, CSSMapped*, DocumentStructure, TokenSearchResult) in `src/types/mcp.ts` per data-model.md
- [X] T004 Add `"mcp": "./dist/mcp/server.js"` to `bin` in `package.json` and add `build:mcp` script

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cache and CSS mapper — used by ALL tools

**CRITICAL**: No tool implementation can begin until cache and mapper are ready

- [X] T005 [P] Write tests for TokenCache in `tests/mcp/cache.test.ts`: TTL expiry, force_refresh bypass, dedup of parallel requests, cache miss triggers fetch
- [X] T006 [P] Implement TokenCache class in `src/mcp/cache.ts`: Map<string, CacheEntry>, TTL 30min, `get()`, `set()`, `isExpired()`, `getOrFetch()` with dedup Promise tracking, `listCached()` for resource listing
- [X] T007 [P] Write tests for CSS mapper in `tests/mcp/mappers/css-mapper.test.ts`: color match, typography match, spacing match, radius match, shadow match, no-match returns null css_variable, depth limiting
- [X] T008 [P] Implement CSS mapper in `src/mcp/mappers/css-mapper.ts`: `mapNodeToDetail(rawNode, tokens, depth)` that converts raw Figma node to NodeDetail with inline css_variable + css_property fields. Match fills→ColorToken, typography→TypographyToken, spacing→SpacingToken, radius→RadiusToken, shadows→ShadowToken per research.md Decision 7
- [X] T009 Create MCP server skeleton in `src/mcp/server.ts`: McpServer init with name "figma-scaler" version from package.json, StdioServerTransport, FIGMA_TOKEN resolution from env, error handling. Server starts but registers no tools yet. Log to stderr only.

**Checkpoint**: Cache, mapper, and server skeleton ready — tool implementation can begin

---

## Phase 3: User Story 1 — Design Tokens via MCP (Priority: P1) MVP

**Goal**: Claude Code can extract all design tokens from a Figma file via MCP tool

**Independent Test**: Call `get_design_tokens` with a real Figma file ID and verify tokens match manual Figma inspection

### Tests for User Story 1

- [X] T010 [P] [US1] Write test for get_design_tokens handler in `tests/mcp/tools/get-design-tokens.test.ts`: successful extraction returns AllTokens + file_name + cached flag, cache hit returns cached=true, force_refresh bypasses cache, invalid file ID returns error text, missing FIGMA_TOKEN returns setup instructions

### Implementation for User Story 1

- [X] T011 [US1] Implement `get_design_tokens` tool in `src/mcp/tools/get-design-tokens.ts`: accept file_id (string), page (optional), node_id (optional), force_refresh (optional). Use cache.getOrFetch() → parseFileIdOrUrl → fetchAndParse → parseDocumentTree → extractAllTokens. Return JSON with all token arrays + file_name + node_count + cached flag. Handle FigmaApiError gracefully.
- [X] T012 [US1] Register `get_design_tokens` tool in `src/mcp/server.ts` with Zod schema per contracts/mcp-tools.md
- [X] T013 [US1] Verify end-to-end: build with `npm run build`, run server manually with `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/mcp/server.js` and confirm tool appears in listing

**Checkpoint**: `get_design_tokens` tool works. MVP complete — Claude Code can fetch all design tokens.

---

## Phase 4: User Story 2 — Node Inspection (Priority: P1)

**Goal**: Claude Code can inspect any Figma node with full CSS mappings

**Independent Test**: Call `get_node_info` for a component and verify response contains all visual properties with css_variable fields

### Tests for User Story 2

- [X] T014 [P] [US2] Write test for get_node_info handler in `tests/mcp/tools/get-node-info.test.ts`: frame node returns dimensions + layout + fills with css_variable, TEXT node returns typography with css mappings, depth limiting works, nonexistent node returns error
- [X] T015 [P] [US2] Write test for get_nodes_info handler in `tests/mcp/tools/get-nodes-info.test.ts`: batch of 2+ node IDs returns NodeDetail[], single invalid node in batch returns error for that node only, empty node_ids array returns empty result

### Implementation for User Story 2

- [X] T016 [US2] Implement `get_node_info` tool in `src/mcp/tools/get-node-info.ts`: accept file_id, node_id, depth (default 5). Use cache to get file data, find node by ID in parsed tree, call css-mapper.mapNodeToDetail() with cached tokens. Return NodeDetail JSON.
- [X] T017 [P] [US2] Implement `get_nodes_info` tool in `src/mcp/tools/get-nodes-info.ts`: accept file_id, node_ids (string[]), depth (default 3). Batch version — map each node_id through same logic. Return NodeDetail[].
- [X] T018 [US2] Register `get_node_info` and `get_nodes_info` tools in `src/mcp/server.ts` with Zod schemas per contracts/mcp-tools.md

**Checkpoint**: Node inspection with CSS mappings works. AI can read any component's full structure.

---

## Phase 5: User Story 3 — CSS Custom Properties (Priority: P2)

**Goal**: Claude Code can generate and optionally save CSS Custom Properties file

**Independent Test**: Call `get_css_variables`, verify output is valid CSS with all token categories

### Tests for User Story 3

- [X] T019 [P] [US3] Write test for get_css_variables handler in `tests/mcp/tools/get-css-variables.test.ts`: returns valid CSS string, save_to writes file to disk, uses cache

### Implementation for User Story 3

- [X] T020 [US3] Implement `get_css_variables` tool in `src/mcp/tools/get-css-variables.ts`: accept file_id, save_to (optional). Use cache → generateCSS(). If save_to provided, write to file and return confirmation. Else return CSS as text content.
- [X] T021 [US3] Register `get_css_variables` tool in `src/mcp/server.ts`

**Checkpoint**: CSS Custom Properties generation works via MCP.

---

## Phase 6: User Story 4 — Image Export (Priority: P2)

**Goal**: Claude Code can export any Figma node as SVG/PNG/JPG/PDF to disk

**Independent Test**: Call `export_node_image` for a node, verify file saved and correct format

### Tests for User Story 4

- [X] T022 [P] [US4] Write test for export_node_image handler in `tests/mcp/tools/export-node-image.test.ts`: SVG export returns file_path, PNG with scale=2 works, creates output_dir if missing, invalid node returns error

### Implementation for User Story 4

- [X] T023 [US4] Implement `export_node_image` tool in `src/mcp/tools/export-node-image.ts`: accept file_id, node_id, format (default png), scale (default 1), output_dir (default ./figma-assets). Use fetchFigmaImages() to get render URL, downloadImage() to fetch binary, write to disk with sanitized filename. Return { file_path, format, size_bytes }.
- [X] T024 [US4] Register `export_node_image` tool in `src/mcp/server.ts`

**Checkpoint**: Image export works. Developer can export icons (SVG) and rasters (PNG) via Claude Code.

---

## Phase 7: User Story 5 — Document Structure (Priority: P2)

**Goal**: Claude Code can overview a Figma file's pages, frames, and components

**Independent Test**: Call `get_document_structure`, verify pages and components listed

### Tests for User Story 5

- [X] T025 [P] [US5] Write test for get_document_structure handler in `tests/mcp/tools/get-document-structure.test.ts`: returns pages with top frames, includes component counts, uses cache

### Implementation for User Story 5

- [X] T026 [US5] Implement `get_document_structure` tool in `src/mcp/tools/get-document-structure.ts`: accept file_id. Use cache → traverse document.children for pages, extract top-level frames (name, node_id, width, height), count components and component_sets. Return DocumentStructure JSON.
- [X] T027 [US5] Register `get_document_structure` tool in `src/mcp/server.ts`

**Checkpoint**: Document overview works. Developer can navigate large files via Claude Code.

---

## Phase 8: User Story 6 — AI Design Context (Priority: P3)

**Goal**: Claude Code gets a compact, AI-optimized design system summary

**Independent Test**: Call `get_design_context`, verify markdown contains top colors, spacing scale, typography, usage rules

### Tests for User Story 6

- [X] T028 [P] [US6] Write test for get_design_context handler in `tests/mcp/tools/get-design-context.test.ts`: returns markdown with color table, spacing list, typography, rules section, uses cache

### Implementation for User Story 6

- [X] T029 [US6] Implement `get_design_context` tool in `src/mcp/tools/get-design-context.ts`: accept file_id. Use cache → generateMarkdown() from existing writer. Return markdown as text content.
- [X] T030 [US6] Register `get_design_context` tool in `src/mcp/server.ts`

**Checkpoint**: AI context generation works. One call gives Claude Code full design system knowledge.

---

## Phase 9: User Story 7 — Token Search (Priority: P3)

**Goal**: Claude Code can find design tokens by value (hex color, number, font name)

**Independent Test**: Call `search_token` with a hex color, verify correct CSS variable returned

### Tests for User Story 7

- [X] T031 [P] [US7] Write test for search_token handler in `tests/mcp/tools/search-token.test.ts`: exact color match returns distance=0, approximate color returns closest matches, number matches spacing/radius/font-size, category filter works, max 5 results

### Implementation for User Story 7

- [X] T032 [US7] Implement `search_token` tool in `src/mcp/tools/search-token.ts`: accept file_id, query (string), category (optional). Parse query: detect hex color vs number vs string. Search cached tokens by category. For colors: compute color distance (Euclidean in RGB). For numbers: exact match across spacing/radius/font-size. For strings: substring match on font_family. Return TokenSearchResult with up to 5 matches sorted by distance.
- [X] T033 [US7] Register `search_token` tool in `src/mcp/server.ts`

**Checkpoint**: Token search works. No more manual digging for CSS variable names.

---

## Phase 10: MCP Prompts & Resources

**Purpose**: Add MCP prompts for AI guidance and resource for token access

- [X] T034 [P] Implement `layout_strategy` prompt in `src/mcp/prompts/layout-strategy.ts` per contracts/mcp-prompts.md. Register in server.ts.
- [X] T035 [P] Implement `read_design_strategy` prompt in `src/mcp/prompts/read-design-strategy.ts` per contracts/mcp-prompts.md. Register in server.ts.
- [X] T036 [P] Implement `token_usage_rules` prompt in `src/mcp/prompts/token-usage-rules.ts` per contracts/mcp-prompts.md. Register in server.ts.
- [X] T037 Implement `figma://tokens/{file_id}` resource in `src/mcp/resources/figma-tokens.ts` using ResourceTemplate. `list()` returns cached file IDs. Read handler returns cached AllTokens JSON. Register in server.ts.

**Checkpoint**: All prompts and resources registered. Claude Code can use prompts for guided workflow.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, error handling, and validation

- [X] T038 Add token validation guard to all tools in `src/mcp/server.ts`: if FIGMA_TOKEN not set, return clear setup instructions with link to Figma API docs
- [X] T039 Verify HTTP 429 rate limit handling per FR-011: check that `src/api/client.ts` respects Retry-After header with up to 3 retries. If not implemented, add retry wrapper in `src/mcp/cache.ts` getOrFetch(). Add test in `tests/mcp/cache.test.ts` for retry behavior
- [X] T040 Update `src/index.ts` to export MCP-specific modules (cache, mapper, types)
- [X] T041 Add `mcp:start` script to `package.json`: `"node dist/mcp/server.js"`
- [X] T042 Run full test suite: `npm test` — ensure all existing tests still pass and new MCP tests pass
- [X] T043 Build and verify: `npm run build` — ensure `dist/mcp/server.js` is generated with correct shebang
- [X] T044 Run quickstart.md validation: connect MCP server to Claude Code, call each tool, verify responses match contracts. Include smoke test with a large file (1000+ nodes) to validate performance target (<30s first fetch, <1s cached)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types + deps installed)
- **User Stories (Phases 3-9)**: All depend on Phase 2 (cache + mapper + server skeleton)
  - US1 and US2 are both P1 — implement sequentially (US1 first as MVP)
  - US3, US4, US5 are P2 — can parallelize after US1/US2
  - US6, US7 are P3 — can parallelize after US1/US2
- **Prompts & Resources (Phase 10)**: Can start after Phase 2 (independent of tool implementations)
- **Polish (Phase 11)**: After all desired phases complete

### User Story Dependencies

- **US1 (get_design_tokens)**: Foundation only — no other story deps. **MVP target.**
- **US2 (get_node_info)**: Foundation + CSS mapper. Independent of US1.
- **US3 (get_css_variables)**: Needs tokens cached (US1 or direct cache). Independent.
- **US4 (export_node_image)**: Foundation only. Fully independent.
- **US5 (get_document_structure)**: Foundation only. Fully independent.
- **US6 (get_design_context)**: Needs tokens cached. Independent.
- **US7 (search_token)**: Needs tokens cached. Independent.

### Within Each User Story

- Test → Implementation → Registration → Checkpoint
- Tests MUST fail before implementation begins

### Parallel Opportunities

- T003/T004 can parallel with T001/T002 (after T001 completes)
- T005/T007 can parallel (cache and mapper tests are independent files)
- T006/T008 can parallel (cache and mapper implementations are independent)
- T010/T014/T015 can parallel (test files in different directories)
- T034/T035/T036/T037 can all parallel (independent prompt/resource files)
- Phase 10 can parallel with Phases 5-9

---

## Parallel Example: Foundation Phase

```bash
# After T001-T004 complete, launch cache and mapper TESTS in parallel (TDD: tests first):
Task T005: "Tests for TokenCache in tests/mcp/cache.test.ts"
Task T007: "Tests for CSS mapper in tests/mcp/mappers/css-mapper.test.ts"

# Then implementations in parallel (tests must fail first):
Task T006: "Implement TokenCache in src/mcp/cache.ts"
Task T008: "Implement CSS mapper in src/mcp/mappers/css-mapper.ts"
```

## Parallel Example: Prompts (Phase 10)

```bash
# All prompts can be created simultaneously:
Task T034: "layout_strategy prompt in src/mcp/prompts/layout-strategy.ts"
Task T035: "read_design_strategy prompt in src/mcp/prompts/read-design-strategy.ts"
Task T036: "token_usage_rules prompt in src/mcp/prompts/token-usage-rules.ts"
Task T037: "figma://tokens resource in src/mcp/resources/figma-tokens.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundation — cache + mapper + server skeleton (T005-T009)
3. Complete Phase 3: US1 — get_design_tokens (T010-T013)
4. **STOP and VALIDATE**: Connect to Claude Code, call `get_design_tokens` for a real file
5. This alone delivers core value: Claude Code can access all design tokens

### Incremental Delivery

1. Setup + Foundation → Server skeleton running
2. Add US1 (get_design_tokens) → **MVP! Core token access**
3. Add US2 (get_node_info) → Full component inspection with CSS mappings
4. Add US3-US5 (CSS/images/structure) → Complete tool suite
5. Add US6-US7 (context/search) → Enhanced AI workflow
6. Add Prompts (Phase 10) → **Key differentiator: AI always uses tokens correctly**
7. Polish (Phase 11) → Production-ready

### Suggested MVP Scope

**Phases 1-3 only** (T001-T013): Setup → Foundation → get_design_tokens tool. This gives Claude Code the ability to fetch all design tokens — the foundational capability everything else builds on.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Constitution requires tests with Figma API fixtures (principle IV)
- All logging to stderr (never stdout — stdout is MCP transport)
- Reuse existing figma-scaler functions — no duplication (principle V)
- Token MUST NEVER appear in tool responses (FR-010)
