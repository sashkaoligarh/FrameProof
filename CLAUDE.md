# figma_scaler Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-27

## Active Technologies
- TypeScript 5.x (strict mode), ESM, Node.js >= 20 + `@modelcontextprotocol/sdk` ^1.27.0, `zod` ^3.22.0, existing figma-scaler modules (002-figma-mcp-server)
- In-memory cache (Map<string, CacheEntry>), no external storage (002-figma-mcp-server)
- TypeScript 5.x (strict mode), ESM + `@modelcontextprotocol/sdk` ^1.27.1, `zod` ^4.3.6, `@figma/rest-api-spec` (types, dev) (003-pixel-perfect-mcp)
- In-memory cache (TokenCache, Map-based, 30-min TTL) (003-pixel-perfect-mcp)
- TypeScript 5.x (strict mode), ESM, Node.js >= 20 + `commander` (CLI), `@modelcontextprotocol/sdk` ^1.27.1, `zod` ^4.3.6 (004-tinyjpg-compression)
- Filesystem (images saved to `output_dir/images/` or MCP `output_dir`) (004-tinyjpg-compression)

- TypeScript 5.x (strict mode), ESM, Node.js >= 20 + `commander` (CLI), `@figma/rest-api-spec` (типы, dev) (001-figma-design-parser)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (strict mode), ESM, Node.js >= 20: Follow standard conventions

## Recent Changes
- 004-tinyjpg-compression: Added TypeScript 5.x (strict mode), ESM, Node.js >= 20 + `commander` (CLI), `@modelcontextprotocol/sdk` ^1.27.1, `zod` ^4.3.6
- 003-pixel-perfect-mcp: Added TypeScript 5.x (strict mode), ESM + `@modelcontextprotocol/sdk` ^1.27.1, `zod` ^4.3.6, `@figma/rest-api-spec` (types, dev)
- 002-figma-mcp-server: Added TypeScript 5.x (strict mode), ESM, Node.js >= 20 + `@modelcontextprotocol/sdk` ^1.27.0, `zod` ^3.22.0, existing figma-scaler modules


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
