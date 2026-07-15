# figma-scaler

`figma-scaler` is a TypeScript toolkit for extracting Figma design data, exposing it to MCP clients, and comparing live React/Astro UI with Figma or local image references.

This is a source repository. The quick start below builds and runs the checked-out source and does not assume that an npm package has been published.

## Capabilities

- **CLI parser:** exports tokens, CSS, context, manifests, components, and optional images.
- **MCP server:** exposes 26 tools, five prompts, and one cached-token resource over stdio, including a plan-only pixel-perfect workflow planner.
- **Visual gate:** captures a live selector in Chromium and compares it with Figma or local PNG references using dimensions, normalized RMSE, DOM, console, request, and overflow checks.
- **Figma writes:** MCP tools can mutate variables, dev resources, and comments when the supplied token has the required scopes.

## Security Warning

The MCP server registers remote write tools, but remote mutations are blocked by default. They run only when `FIGMA_SCALER_ENABLE_WRITES` is exactly `1` in the server process. Use a least-privilege, read-only Figma token unless writes are intentional, review tool calls in your MCP client, and do not connect an untrusted agent. Enabling writes is process-wide, not approval for a specific operation.

MCP file-producing parameters such as `save_to`, `output_dir`, and `output_path` are confined to `FIGMA_SCALER_OUTPUT_ROOT`, which defaults to the server's current working directory. Filesystem-root and user-home roots, relative traversal, and symlink escapes are rejected. The parser and gate still accept their own output flags and are not wholly governed by this MCP boundary; run all modes with appropriate working directories and OS permissions.

See [SECURITY.md](SECURITY.md) before using private designs or write-capable tokens.

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0` and npm. Node.js 21 and 22.0-22.11 are unsupported by the locked Vite toolchain.
- A [Figma personal access token](https://www.figma.com/developers/api#access-tokens) for Figma-backed commands. Grant only the scopes the intended tools need.
- Google Chrome or Chromium for `gate`. This project uses `playwright-core`, which does not download a browser during `npm ci`.
- A [TinyJPG/Tinify API token](https://tinypng.com/developers) only when image compression is requested.

## Quick Start

```bash
git clone https://github.com/sashkaoligarh/mcp-figma.git
cd mcp-figma
npm ci
npm run build
npm test
npm run lint
```

Set credentials in the process environment. The application does **not** load `.env` automatically.

```bash
export FIGMA_TOKEN='replace-with-your-figma-token'
```

Verify local prerequisites without printing credential values:

```bash
node dist/cli.js doctor
# Machine-readable output:
node dist/cli.js doctor --json
```

The doctor exits nonzero only for blocking Node, Figma token, browser, or safe output-root failures. A missing optional `TINYJPG_TOKEN` is reported as a warning.

Parse a Figma file from the clean source clone:

```bash
node dist/cli.js parse \
  'https://www.figma.com/design/FILE_ID/Design-Name' \
  --output ./figma-output
```

The default parser output is also `./figma-output`. It is ignored because exports may contain private design content.

## MCP Server

Build once, then point an MCP client at the compiled stdio server. Replace the absolute repository path and token placeholder:

```json
{
  "mcpServers": {
    "figma-scaler": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-figma/dist/mcp/server.js"
      ],
      "env": {
        "FIGMA_TOKEN": "replace-with-your-figma-token",
        "FIGMA_SCALER_OUTPUT_ROOT": "/absolute/path/to/private-artifacts"
      }
    }
  }
}
```

Some clients inherit the parent process environment, while others require an `env` block and store it in plain text. Follow the client's secret-storage guidance and protect its configuration file. Add `TINYJPG_TOKEN` only if the compression tools need it. Leave `FIGMA_SCALER_ENABLE_WRITES` unset for read/export workflows; add it with value `1` only when remote Figma mutations are intentional.

For a direct stdio smoke test, run `npm run mcp:start`; it waits for an MCP client on stdin/stdout. MCP logs go to stderr.

The complete tool list, parameter names, prompt list, and permission notes are in [USAGE.md](USAGE.md).

## Visual Gate

Start the target web application separately, then identify an installed browser if it is not in a standard Linux location:

```bash
export CHROME_BIN=/usr/bin/google-chrome
# Or: export CHROMIUM_BIN=/path/to/chromium
```

Compare a live selector with a Figma node:

```bash
node dist/cli.js gate \
  --page-url 'http://localhost:3000/pricing' \
  --selector '.pricing-hero' \
  --figma-url 'https://www.figma.com/design/FILE_ID/Design-Name?node-id=1-2' \
  --real-flow \
  --fail-on-review
```

Use `--figma-image /path/to/reference.png` instead of `--figma-url` for a local reference. Gate artifacts default to `.pixel-perfect/figma-gate/` and may include page text, screenshots, URLs, DOM data, and diff images.

With `--real-flow`, one global reference provides exact desktop coverage plus a behavior-only ultrawide check. Supply `--figma-url-desktop`, `--figma-url-tablet`, and `--figma-url-mobile` (or image equivalents) for exact responsive breakpoint coverage.

## Environment Variables

| Variable | Status | Purpose |
|---|---|---|
| `FIGMA_TOKEN` | Implemented | Figma REST API authentication for CLI, MCP, and Figma-backed gate references. |
| `TINYJPG_TOKEN` | Implemented, optional | TinyJPG/Tinify API authentication when `--compress` or `compress: true` is used. Image bytes are sent to Tinify. |
| `CHROME_BIN` | Implemented, optional | Absolute Google Chrome executable path for `gate`. |
| `CHROMIUM_BIN` | Implemented, optional | Absolute Chromium executable path, checked after `CHROME_BIN`. |
| `FIGMA_SCALER_COOKIES_JSON` | Implemented, optional | JSON array of `{ "name", "value", "url" }` cookies added to visual-gate browser contexts. Treat it as a secret. |
| `FIGMA_SCALER_OUTPUT_ROOT` | Implemented, optional | Safe root for MCP file-producing handlers; defaults to a non-broad process working directory. Filesystem root and user home are rejected. It does not replace parser or gate output flags. |
| `FIGMA_SCALER_ENABLE_WRITES` | Implemented, optional | Remote MCP mutations are blocked unless the value is exactly `1`. |

`.env.example` is a reference template only. Export variables yourself or configure them in the process manager or MCP client.

## Development

```bash
npm ci
npm test
npm run lint
npm run build
```

`npm run lint` currently performs TypeScript checking. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and [docs/pixel-perfect-react-astro-system.md](docs/pixel-perfect-react-astro-system.md) for the visual implementation protocol.

## License

[MIT](LICENSE)
