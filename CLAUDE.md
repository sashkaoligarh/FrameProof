# figma_scaler Development Guidelines

## Active Technologies
- TypeScript 5.x in strict mode with ESM.
- Node.js `^20.19.0` or `>=22.12.0`; Node.js 21 and 22.0-22.11 are unsupported.
- `@modelcontextprotocol/sdk`, `commander`, `zod`, and `@figma/rest-api-spec` types.
- In-memory `TokenCache` with a 30-minute TTL and no external storage.
- Filesystem output for parser, MCP export, and visual-gate artifacts.

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (strict mode), ESM: follow standard conventions.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
