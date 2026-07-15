# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project intends to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Public source-repository onboarding, environment, contribution, conduct, security, and issue-reporting guidance.
- A credential-safe `doctor` command for runtime, token, browser, and output-sandbox diagnostics.
- GitHub CI at the minimum supported Node.js releases and current LTS, dependency review, and Gitleaks secret scanning.

### Changed

- Marked the package private because this repository is supported as source only.
- Aligned runtime support with Vite: Node.js `^20.19.0` or `>=22.12.0`; Node.js 21 and early 22 releases are rejected by `doctor`.
- Documented source-clone CLI, MCP, and visual-gate setup and synchronized the usage reference with 26 tools, five prompts, one resource, current response limits, and the plan-only workflow boundary.
- Clarified all accepted CLI image formats, strict numeric validation, generated artifact privacy, and optional TinyJPG behavior.
- Expanded ignores for local credentials and generated/private design artifacts and removed developer-specific paths from reusable guidance.

### Security

- Disabled remote Figma mutations by default behind `FRAMEPROOF_ENABLE_WRITES=1`, made destructive variable operations dry-run by default, fully redacted API tokens, and removed comment bodies and resource URLs from write logs.
- Confined MCP-generated files to `FRAMEPROOF_OUTPUT_ROOT` with traversal and symlink-escape protection.
- Added bounded API timeouts, retries, response sizes, schema validation, credential redaction, and stricter Tinify host and redirect handling.
- Hardened browser capture diagnostics and URL redaction, documented cookie and artifact sensitivity, and made CI secret scanning work without pull-request comment permissions.

## [0.1.0]

### Added

- Figma token and component extraction CLI.
- Stdio MCP server for design inspection, exports, orchestration, variables, dev resources, and comments.
- TinyJPG/Tinify image compression support.
- Chromium-based visual comparison gate for Figma-to-code workflows.
