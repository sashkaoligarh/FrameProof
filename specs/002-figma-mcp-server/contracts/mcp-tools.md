# MCP Tools Contract

## Tool: get_design_tokens

Extract all design tokens from a Figma file.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_id | string | yes | Figma file ID or URL |
| page | string | no | Filter by page name |
| node_id | string | no | Filter by node ID |
| force_refresh | boolean | no | Bypass cache (default: false) |

**Response**: JSON object with fields:
- `colors`: ColorToken[] — sorted by usage_count desc
- `gradients`: GradientToken[]
- `typography`: TypographyToken[] — sorted by usage_count desc
- `spacing`: SpacingToken[] — sorted by value asc
- `radii`: RadiusToken[] — sorted by value asc
- `shadows`: ShadowToken[]
- `images`: ImageToken[]
- `components`: ComponentInfo[]
- `file_name`: string
- `node_count`: number
- `cached`: boolean — whether result came from cache

---

## Tool: get_node_info

Get detailed information about a specific Figma node with CSS mappings.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_id | string | yes | Figma file ID or URL |
| node_id | string | yes | Target node ID |
| depth | number | no | Max child depth (default: 5) |

**Response**: NodeDetail JSON (see data-model.md).
Each visual property includes `css_variable` and `css_property` fields.

---

## Tool: get_nodes_info

Batch version of get_node_info for multiple nodes.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_id | string | yes | Figma file ID or URL |
| node_ids | string[] | yes | Array of node IDs |
| depth | number | no | Max child depth (default: 3) |

**Response**: Array of NodeDetail JSON objects.

---

## Tool: get_css_variables

Generate CSS Custom Properties from design tokens.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_id | string | yes | Figma file ID or URL |
| save_to | string | no | File path to save CSS (if omitted, returns as text) |

**Response**: CSS string with `:root { ... }` custom properties.
If `save_to` provided, saves to file and returns confirmation.

---

## Tool: export_node_image

Export a Figma node as an image file.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_id | string | yes | Figma file ID or URL |
| node_id | string | yes | Node to export |
| format | enum | no | `svg` / `png` / `jpg` / `pdf` (default: `png`) |
| scale | number | no | Scale for raster formats 1-4 (default: 1) |
| output_dir | string | no | Directory to save (default: `./figma-assets`) |

**Response**: JSON with fields:
- `file_path`: string — path to saved file
- `format`: string — actual format used
- `size_bytes`: number — file size

---

## Tool: get_document_structure

Get an overview of a Figma file structure.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_id | string | yes | Figma file ID or URL |

**Response**: DocumentStructure JSON (see data-model.md).

---

## Tool: get_design_context

Generate an AI-optimized design system summary.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_id | string | yes | Figma file ID or URL |

**Response**: Markdown string with:
- Top-10 colors by usage count with CSS variables
- Full spacing scale with CSS variables
- Typography styles with CSS variables
- Usage rules (always var(), never hardcode)
- Component list with node IDs

---

## Tool: search_token

Search design tokens by value.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_id | string | yes | Figma file ID or URL |
| query | string | yes | Value to search (hex color, number, font name) |
| category | enum | no | `color` / `typography` / `spacing` / `radius` / `shadow` / `all` (default: `all`) |

**Response**: TokenSearchResult JSON (see data-model.md).
Returns up to 5 closest matches sorted by relevance.
