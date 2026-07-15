# Contributing

Contributions are welcome through GitHub issues and pull requests.

## Development Setup

Prerequisites are Node.js `^20.19.0` or `>=22.12.0` and npm. Node.js 21 and 22.0-22.11 do not satisfy the locked toolchain requirements.

```bash
git clone https://github.com/sashkaoligarh/frameproof.git
cd frameproof
npm ci
npm test
npm run lint
npm run build
```

`npm run lint` currently runs TypeScript with `--noEmit`. Tests use Vitest. Chrome/Chromium and live API credentials are not required for the normal unit test suite.

The application does not load `.env` automatically. Use exported environment variables for manual integration checks, and never commit `.env`, MCP client configuration, browser cookies, tokens, or generated Figma artifacts.

## Making Changes

- Open an issue first for significant behavior, API, MCP schema, security-model, or output-format changes.
- Keep changes focused and preserve strict TypeScript and ESM conventions.
- Add or update tests for behavior changes.
- Update `README.md`, `USAGE.md`, and `CHANGELOG.md` when commands, tool names, parameters, environment variables, or security behavior change.
- Do not include private Figma file IDs, proprietary screenshots, exported assets, access tokens, TinyJPG tokens, or session cookies in fixtures.
- Keep generated `dist/`, `.figma/`, `.pixel-perfect/`, and `figma-output/` content out of commits.

## Pull Requests

Before opening a pull request, run:

```bash
npm test
npm run lint
npm run build
```

Describe the user-visible effect, tests performed, and any changes to MCP read/write behavior. Keep unrelated changes out of the pull request. By contributing, you agree that your contribution is licensed under the repository's MIT License.

Security vulnerabilities should follow [SECURITY.md](SECURITY.md), not the public issue workflow. Community participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
