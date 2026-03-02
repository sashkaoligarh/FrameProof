# Research: Figma MCP Server

## Decision 1: MCP SDK Version & API

- **Decision**: Use `@modelcontextprotocol/sdk` v1.x (latest 1.27.1) with high-level `McpServer` class
- **Rationale**: v1.x is production-stable. v2 is pre-alpha (split into `@modelcontextprotocol/server` + `@modelcontextprotocol/client`), not ready for production as of March 2026.
- **Alternatives considered**:
  - v2 SDK (`@modelcontextprotocol/server`) — rejected: pre-alpha, API unstable
  - Low-level `Server` class from v1.x — rejected: `McpServer` is simpler, recommended by docs

## Decision 2: Tool Registration Pattern

- **Decision**: Use `server.tool(name, description, zodSchema, handler)` pattern (same as cursor-talk-to-figma)
- **Rationale**: Proven pattern, cursor-talk uses it successfully. `server.registerTool()` also works but `server.tool()` is more concise.
- **Key patterns**:
  - Handler returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
  - Error returns same shape with error message in text
  - Zod schemas as plain objects (SDK wraps in `z.object()`)

## Decision 3: Resource Template for Tokens

- **Decision**: Use `ResourceTemplate("figma://tokens/{file_id}")` for dynamic token access
- **Rationale**: MCP resources allow Claude Code to access tokens without explicit tool call. `list()` callback returns cached file IDs.
- **Alternatives considered**:
  - Static resources only — rejected: file_id is dynamic
  - No resources (tools only) — rejected: resources are better for "reference data" pattern

## Decision 4: Prompt Definition Pattern

- **Decision**: Use `server.prompt(name, description, handler)` with `role: "assistant"` messages
- **Rationale**: cursor-talk pattern works well. Prompts with `role: "assistant"` inject instructions the AI should follow.
- **Key detail**: No Zod args needed for strategy prompts — they're static instruction blocks.

## Decision 5: Reuse Strategy

- **Decision**: Import figma-scaler functions directly as library code. No subprocess, no duplication.
- **Rationale**: All pipeline functions are already exported from `src/index.ts`. MCP server is a new entry point (`src/mcp/server.ts`) that imports the same modules.
- **Key functions to reuse**:
  - `parseFileIdOrUrl` — parse URL/ID input
  - `fetchAndParse` — full file fetch + normalize
  - `fetchFigmaNodes` — specific nodes (for get_node_info)
  - `fetchFigmaImages` — image export URLs
  - `parseDocumentTree` — flatten document tree
  - `extractAllTokens` — extract all token types
  - `generateCSS` — CSS custom properties
  - `generateMarkdown` — AI context
  - Individual extractors for fine-grained access

## Decision 6: Cache Implementation

- **Decision**: In-memory `Map<string, CacheEntry>` with 30-min TTL
- **Rationale**: Simple, no external dependencies. Sufficient for single-user local MCP server. Cache stores `FigmaFile`, `ParsedNode[]`, and `AllTokens` per file_id.
- **Alternatives considered**:
  - Disk cache (SQLite/JSON files) — rejected: over-engineering for local tool, complicates cleanup
  - No cache — rejected: Figma API calls take 2-10s, repeat calls would be painful
  - LRU with size limit — deferred: can add if memory becomes an issue

## Decision 7: CSS Mapping Strategy

- **Decision**: Match node property values against cached tokens to produce inline `css_variable` + `css_property` fields
- **Rationale**: Tokens are already extracted with names and CSS variable names. When inspecting a node, match its fill color hex to ColorToken.value_hex, its font size to TypographyToken.font_size, etc.
- **Matching rules**:
  - Colors: exact hex match → `--color-{name}`
  - Typography: match font_family+font_size+font_weight → `--font-family-{x}`, `--font-size-{x}`, `--font-weight-{x}`
  - Spacing: match padding/gap values → `--spacing-{value}`
  - Radius: match cornerRadius → `--radius-{value}`
  - Shadows: match CSS string → `--{shadow_name}`

## Decision 8: New Dependencies

- **Decision**: Add `@modelcontextprotocol/sdk` ^1.27.0 and `zod` ^3.22.0 to dependencies
- **Rationale**: Required for MCP protocol. Zod is a peer dependency of the SDK.
- **Note**: `zod` moves from implicit (not listed) to explicit dependency.

## Decision 9: Image Export via MCP

- **Decision**: Use `fetchFigmaImages` + `downloadImage` from existing API client. Save file to user-specified directory.
- **Rationale**: Figma Images API (`GET /v1/images/:key`) returns render URLs. Tool downloads binary and saves to disk.
- **Key**: MCP tool returns file path (not binary data) — Claude Code can then reference the file.

## Decision 10: Transport & Configuration

- **Decision**: stdio transport. Config via env vars (`FIGMA_TOKEN`) and MCP server args.
- **Rationale**: Claude Code uses stdio for local MCP servers. Token via env var is already the figma-scaler pattern.
- **Claude Code config**: `.mcp.json` at project root or `claude mcp add` command.
