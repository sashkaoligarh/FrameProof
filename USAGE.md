# Usage Reference

This reference describes the current TypeScript source. Build a source clone with `npm ci && npm run build`, then invoke the CLI as `node dist/cli.js`. Examples using a globally installed `frameproof` binary are equivalent only if you have explicitly linked or installed this checkout.

The project does not load `.env` files. Export variables in the shell, process manager, or MCP client configuration.

## CLI: Doctor

```bash
node dist/cli.js doctor [--json]
```

`doctor` checks Node.js `^20.19.0` or `>=22.12.0`, `FIGMA_TOKEN` presence, Chrome/Chromium discovery, and whether the configured `FRAMEPROOF_OUTPUT_ROOT` is writable and usable as the MCP sandbox. Node.js 21 and 22.0-22.11 are rejected to match the locked Vite requirement. The command reports only credential presence, never values. A missing `TINYJPG_TOKEN` is a non-blocking warning because compression is optional. The command exits nonzero only when a blocking check fails; `--json` emits `{ "ok", "checks" }` for automation.

## CLI: Parse

```bash
node dist/cli.js parse <fileIdOrUrl> [options]
```

| Option | Default | Description |
|---|---|---|
| `-t, --token <token>` | `FIGMA_TOKEN` | Discouraged compatibility option because process arguments can expose secrets. Prefer `FIGMA_TOKEN`. |
| `-o, --output <dir>` | `./figma-output` | Generated output directory. |
| `-f, --format <format>` | `all` | `all`, `json`, `css`, or `context`. A manifest is always written. |
| `-p, --page <name>` | none | Include only a named page. |
| `-n, --node <id>` | none | Include only a node ID. |
| `--include-hidden` | `false` | Include hidden layers. |
| `--export-images` | `false` | Download extracted image assets. |
| `--image-format <formats>` | `svg,png` | Comma-separated `svg`, `png`, `jpg`, or `pdf`. |
| `--image-scale <scale>` | `1` | Finite PNG/JPG scale from `1` through `4`. If omitted with `--compress`, the effective scale is `2`. |
| `--compress` | `false` | Compress eligible PNG/JPG output through TinyJPG/Tinify. |

Parse exit codes are `0` for success, `1` for input/general errors, `2` for Figma API errors, and `3` for detected filesystem errors.

## CLI: Visual Gate

```bash
node dist/cli.js gate --selector <css-selector> [page options] [reference options]
```

`--selector` is required. Supply `--page-url`, or use `--route` with `--base-url`. Supply at least one Figma URL or local image reference.

| Option | Default | Description |
|---|---|---|
| `--page-url <url>` | none | Absolute live-page URL. |
| `--route <route>` | `/` | Route resolved against `--base-url`. |
| `--base-url <url>` | `http://localhost:3000` | Base for `--route`. |
| `--selector <selector>` | required | Live CSS selector to capture. |
| `--figma-url <url>` | none | Figma node reference for all viewports. |
| `--figma-url-desktop <url>` | none | Desktop Figma node reference. |
| `--figma-url-tablet <url>` | none | Tablet Figma node reference. |
| `--figma-url-mobile <url>` | none | Mobile Figma node reference. |
| `--figma-image <path>` | none | Local PNG reference for all viewports. |
| `--figma-image-desktop <path>` | none | Desktop local PNG reference. |
| `--figma-image-tablet <path>` | none | Tablet local PNG reference. |
| `--figma-image-mobile <path>` | none | Mobile local PNG reference. |
| `--viewports <list>` | preset-dependent | Comma-separated `desktop`, `tablet`, `mobile`, or `ultrawide`. |
| `--output-dir <dir>` | `.pixel-perfect/figma-gate` | Artifact root. |
| `--name <name>` | selector | Stable portion of the timestamped run name. |
| `--rmse-threshold <number>` | `0.025` | Finite normalized RMSE pass threshold from `0` through `1`. |
| `--size-tolerance <number>` | `2` | Nonnegative integer image-dimension tolerance in pixels. |
| `--wait-ms <number>` | `500` | Nonnegative integer wait after page load. |
| `--real-flow` | `false` | Check every supplied exact breakpoint reference and add behavior-only ultrawide when desktop exists. A single global reference covers desktop plus ultrawide, not invented tablet/mobile references. |
| `--soft-size-mismatch` | `false` | Report size mismatch as `REVIEW` instead of `FAIL`. |
| `--fail-on-review` | `false` | Exit nonzero for `REVIEW` as well as `FAIL`. |

The gate needs an installed Chrome/Chromium. It checks `CHROME_BIN`, then `CHROMIUM_BIN`, then common Linux paths. It writes screenshots, DOM reports, diffs, `REPORT.md`, and `summary.json` below the output directory.

## MCP Server

```bash
npm run build
npm run mcp:start
```

The MCP transport is stdio. Protocol messages use stdout and logs use stderr. The in-memory Figma parse/token cache has a 30-minute TTL.

Parameter notation below uses `?` for optional parameters. Defaults are shown as `=value`. `file_id` accepts a file ID or full Figma URL; tools with an optional `node_id` can usually extract `node-id` from that URL.

### Read, Export, and Orchestration Tools (13)

| Tool | Parameters |
|---|---|
| `get_design_tokens` | `file_id`, `page?`, `node_id?`, `force_refresh?=false`, `categories?`, `save_to?` |
| `get_node_info` | `file_id`, `node_id?`, `depth?=5`, `max_response_chars?=80000`, `deduplicate_styles?=false`, `save_to?` |
| `get_nodes_info` | `file_id`, `node_ids`, `depth?=3`, `max_response_chars?=80000`, `deduplicate_styles?=false`, `save_to?` |
| `get_css_variables` | `file_id`, `save_to?` |
| `export_node_image` | `file_id`, `node_id?`, `format?=png`, `scale?=1`, `output_dir?=.figma`, `compress?=false` |
| `get_document_structure` | `file_id` |
| `get_design_context` | `file_id` |
| `search_token` | `file_id`, `query`, `category?=all` |
| `get_screenshot` | `file_id`, `node_id?`, `scale?=1`, `output_dir?=.figma`, `compress?=false` |
| `get_frame_overview` | `file_id`, `node_id?` |
| `batch_screenshots` | `file_id`, `node_id?`, `scale?=1`, `output_dir?=.figma`, `include_hidden?=false`, `compress?=false` |
| `export_page_analysis` | `file_id`, `node_id?`, `output_path?=.figma/page-analysis.md`, `format?=markdown`, `section_depth?=4` |
| `plan_pixel_perfect_workflow` | `file_id`, `node_id?`, `project_root?`, `framework?=auto`, `architecture?=feature-sliced`, `route?`, `page_url?`, `base_url?=http://localhost:3000`, `selectors?`, `cli_command?`, `output_dir?=.figma/pixel-perfect-orchestration`, `max_passes?=12`, `real_flow?=true`, `fail_on_review?=true` |

`categories` accepts `colors`, `gradients`, `typography`, `spacing`, `radii`, `shadows`, `images`, and `components`; the default excludes the potentially large `images` and `components` categories. `search_token.category` accepts `color`, `typography`, `spacing`, `radius`, `shadow`, or `all`. Image format accepts `svg`, `png`, `jpg`, or `pdf`.

These tools do not mutate the remote Figma file, but several write local files. MCP output paths are resolved below `FRAMEPROOF_OUTPUT_ROOT`, which defaults to the server working directory unless that directory is the filesystem root or user home. Broad roots, traversal, and symlink escapes are rejected.

`plan_pixel_perfect_workflow` returns `mode: "plan_only"`. It fetches Figma data, inventories sections, and creates only `RUNBOOK.md` and `inventory.json` under `output_dir`, resolved relative to `project_root`. Its `required_artifacts`, `final_gate_argv`, and POSIX-only display commands describe work to perform separately; the tool does not edit application code, create those extraction/gate artifacts, capture the live page, execute commands, or prove visual completion. Set `cli_command` to an argv prefix such as `["node", "/checkout/dist/cli.js"]` when automatic source-checkout detection is unavailable. `project_root` and all generated paths must remain inside `FRAMEPROOF_OUTPUT_ROOT`. `max_passes` is an integer from 1 to 100; `selectors` accepts up to 100 non-empty selectors of at most 512 characters each.

### Variables Tools (6)

| Tool | Effect | Parameters |
|---|---|---|
| `get_variables` | Remote read | `file_id` |
| `create_variable_collection` | **Remote write** | `file_id`, `name`, `modes?` |
| `create_variable` | **Remote write** | `file_id`, `collection_id`, `name`, `resolved_type`, `values_by_mode?`, `scopes?` |
| `update_variable` | **Remote write** | `file_id`, `variable_id`, `name?`, `values_by_mode?`, `scopes?` |
| `delete_variable` | **Remote write unless dry-run** | `file_id`, `variable_id`, `dry_run?=true` |
| `sync_variables` | **Remote batch write unless dry-run** | `file_id`, `variable_collections?`, `variable_modes?`, `variables?`, `variable_mode_values?`, `dry_run?=true` |

Variables API operations require the relevant Figma Enterprise plan and `file_variables:read` or `file_variables:write` scope. `resolved_type` accepts `COLOR`, `FLOAT`, `STRING`, or `BOOLEAN`. Color mode values accept hex strings or RGBA objects where supported. Non-dry-run mutations also require `FRAMEPROOF_ENABLE_WRITES=1`.

`sync_variables` action objects use `action: CREATE | UPDATE | DELETE` and the exact snake_case fields shown by the MCP schema: `variable_collection_id`, `resolved_type`, `hidden_from_publishing`, `variable_id`, and `mode_id`.

### Dev Resource Tools (4)

| Tool | Effect | Parameters |
|---|---|---|
| `list_dev_resources` | Remote read | `file_id`, `node_id?` |
| `create_dev_resource` | **Remote write** | `file_id`, `node_id`, `name`, `url` |
| `update_dev_resource` | **Remote write** | `resource_id`, `name?`, `url?` |
| `delete_dev_resource` | **Remote write** | `file_id`, `resource_id` |

These require `file_dev_resources:read` or `file_dev_resources:write` as appropriate. Figma limits dev resources to 10 per node. Create, update, and delete also require `FRAMEPROOF_ENABLE_WRITES=1`.

### Comment Tools (3)

| Tool | Effect | Parameters |
|---|---|---|
| `get_comments` | Remote read | `file_id` |
| `post_comment` | **Remote write** | `file_id`, `message`, `node_id?`, `x?`, `y?` |
| `reply_to_comment` | **Remote write** | `file_id`, `comment_id`, `message` |

These require `comments:read` or `comments:write` as appropriate. Posting and replying also require `FRAMEPROOF_ENABLE_WRITES=1`. If `post_comment.node_id` is supplied, omitted `x` and `y` offsets default to zero.

### Prompts (5)

- `layout_strategy`
- `read_design_strategy`
- `token_usage_rules`
- `write_design_strategy`
- `pixel_perfect_orchestration`

### Resource (1)

`figma://tokens/{file_id}` returns tokens already held in the server's in-memory cache. Call `get_design_tokens` or another fetching tool first. The resource is not persistent across server restarts.

## Environment

| Variable | Required | Behavior |
|---|---|---|
| `FIGMA_TOKEN` | For Figma API access | Used by CLI, MCP, and Figma URL references in the gate. |
| `TINYJPG_TOKEN` | Only for compression | Used when compression is requested; without it, eligible tools warn and save the original. |
| `CHROME_BIN` | Gate if browser is not auto-detected | Absolute Chrome executable path. |
| `CHROMIUM_BIN` | Gate if browser is not auto-detected | Absolute Chromium executable path. |
| `FRAMEPROOF_COOKIES_JSON` | No | JSON cookie array for authenticated live-page capture. Treat cookie values as secrets. |
| `FRAMEPROOF_OUTPUT_ROOT` | No | Safe root for MCP file-producing handlers; defaults to a non-broad process working directory. Filesystem root and user home are rejected. Absolute paths must be within it. Parser and gate output flags remain separate. |
| `FRAMEPROOF_ENABLE_WRITES` | No | Remote mutations are blocked unless the value is exactly `1`; write tools remain listed but return an error while disabled. |

TinyJPG/Tinify receives image bytes when compression is enabled. Compression failure is non-blocking and preserves the original image where the calling tool supports fallback.

## Artifact Privacy

The default `.figma/`, `.pixel-perfect/`, and `figma-output/` paths are gitignored. They can contain proprietary tokens, screenshots, image assets, node structure, page text, URLs, cookies reflected in page state, and DOM diagnostics. Git ignores reduce accidental commits but are not access control; choose an explicit private `FRAMEPROOF_OUTPUT_ROOT` for MCP, choose private CLI output paths, and delete artifacts according to the design owner's retention requirements.
