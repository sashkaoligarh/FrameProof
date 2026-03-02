# figma_scaler Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-27

## Active Technologies
- TypeScript 5.x (strict mode), ESM, Node.js >= 20 + `@modelcontextprotocol/sdk` ^1.27.0, `zod` ^3.22.0, existing figma-scaler modules (002-figma-mcp-server)
- In-memory cache (Map<string, CacheEntry>), no external storage (002-figma-mcp-server)

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
- 002-figma-mcp-server: Added TypeScript 5.x (strict mode), ESM, Node.js >= 20 + `@modelcontextprotocol/sdk` ^1.27.0, `zod` ^3.22.0, existing figma-scaler modules

- 001-figma-design-parser: Added TypeScript 5.x (strict mode), ESM, Node.js >= 20 + `commander` (CLI), `@figma/rest-api-spec` (типы, dev)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
