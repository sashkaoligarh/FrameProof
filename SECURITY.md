# Security Policy

## Supported Versions

Security fixes are made on the current default branch. Older commits and unmaintained forks are not supported.

## Report a Vulnerability

Use GitHub's private vulnerability reporting for this repository: open the **Security** tab, choose **Advisories**, and select **Report a vulnerability**. Include the affected commit or version, impact, reproduction steps, and any suggested mitigation.

If private vulnerability reporting is unavailable, open a public issue containing no exploit, token, private file ID, screenshot, or other sensitive detail and ask the maintainers to establish a private reporting channel. Do not post secrets or private design artifacts in an issue, discussion, pull request, or test fixture.

## Credential Handling

- Treat `FIGMA_TOKEN`, `TINYJPG_TOKEN`, and `FRAMEPROOF_COOKIES_JSON` as secrets.
- Use a dedicated, least-privilege Figma token. A read-only token is strongly preferred for extraction and visual comparison.
- Do not pass tokens through command-line flags when shell history or process inspection is a concern. Prefer process or MCP-client environment configuration.
- This project does not load `.env` automatically. `.env.example` contains names only and must never contain real values.
- TinyJPG compression sends image bytes to the Tinify API. Do not enable it unless the design owner permits that third-party transfer.
- Rotate a token or session cookie immediately if it appears in logs, artifacts, commits, client configuration shared with others, or public CI output.

## MCP Read and Write Risk

The stdio MCP server exposes both read tools and tools that can create, update, or delete Figma variables and dev resources, and post comments. Remote mutations are blocked unless `FRAMEPROOF_ENABLE_WRITES` is exactly `1`. Destructive variable tools default to dry-run, but enabling writes is process-wide and is not approval for an individual request. The Figma token scopes remain the final remote permission boundary.

Leave writes disabled and do not supply write scopes to an untrusted or read-only workflow. When writes are enabled, review each proposed MCP call in the client and disable writes again after the operation.

Several MCP tools also write local files through caller-provided `save_to`, `output_dir`, or `output_path` values. They are resolved beneath `FRAMEPROOF_OUTPUT_ROOT`, which defaults to a non-broad MCP process working directory; filesystem root, user home, traversal, and symlink escapes are rejected. Set an explicit private root and run the server as a low-privilege OS user. The standalone parser and visual gate still expose separate output flags and are not wholly governed by this MCP boundary, so those paths require care. Do not expose the stdio process as an unauthenticated network service.

## Private Design Artifacts

Generated token files, CSS, node JSON, screenshots, exported assets, DOM reports, and visual diffs may disclose proprietary design and page content. Default artifact directories are gitignored, but ignore rules do not encrypt data or prevent another local process from reading it.

- Keep `.figma/`, `.pixel-perfect/`, `figma-output/`, and custom output directories out of public commits and CI artifacts.
- Avoid uploading private screenshots or node exports to public issues and pull requests.
- Apply the design owner's retention and deletion requirements.
- Treat authenticated browser captures as sensitive, especially when capture cookies are configured.

## Browser Capture

The visual gate opens the supplied live URL in a local headless browser and records page, request, console, DOM, and screenshot data. Only capture sites you trust, use short-lived least-privilege cookies, and run untrusted pages in an isolated environment.
