# Data Model: Figma MCP Server

## Entities

### CacheEntry

In-memory cache entry for a parsed Figma file.

| Field | Type | Description |
|-------|------|-------------|
| file_id | string | Figma file ID (cache key) |
| file | FigmaFile | Full parsed file data (from figma-scaler) |
| nodes | ParsedNode[] | Flattened document tree |
| tokens | AllTokens | Extracted design tokens |
| fetched_at | number | Unix timestamp (ms) of fetch |
| ttl_ms | number | Time-to-live in ms (default: 1800000 = 30min) |

**Rules**:
- Cache is keyed by `file_id`
- `is_expired()` = `Date.now() - fetched_at > ttl_ms`
- `force_refresh` parameter bypasses TTL check
- Parallel requests to same `file_id` MUST deduplicate (single in-flight fetch)

### NodeDetail

AI-optimized representation of a Figma node for `get_node_info` responses.

| Field | Type | Description |
|-------|------|-------------|
| node_id | string | Figma node ID |
| name | string | Node name |
| node_type | string | Figma node type (FRAME, TEXT, etc.) |
| width | number | Node width in px |
| height | number | Node height in px |
| x | number | Absolute X position |
| y | number | Absolute Y position |
| visible | boolean | Visibility state |
| fills | CSSMappedFill[] | Fill colors with CSS mappings |
| strokes | CSSMappedStroke[] | Stroke colors with CSS mappings |
| effects | CSSMappedEffect[] | Shadow/blur effects with CSS mappings |
| corner_radius | CSSMappedValue | null | Corner radius with CSS mapping |
| layout | LayoutInfo | null | Auto-layout properties |
| typography | CSSMappedTypography | null | Text properties (TEXT nodes only) |
| text_content | string | null | Raw text content (TEXT nodes only) |
| children | NodeDetail[] | Child nodes (up to depth limit) |
| component_info | ComponentRef | null | Component/instance reference |

### CSSMappedFill

| Field | Type | Description |
|-------|------|-------------|
| value_hex | string | Color hex value |
| opacity | number | Fill opacity 0-1 |
| css_variable | string | null | Matched token variable (e.g. `var(--color-brand-primary)`) |
| css_property | string | CSS property name (`background-color`) |

### CSSMappedStroke

| Field | Type | Description |
|-------|------|-------------|
| value_hex | string | Stroke color hex |
| weight | number | Stroke weight in px |
| css_variable | string | null | Matched token variable |
| css_property | string | CSS property name (`border-color`) |

### CSSMappedEffect

| Field | Type | Description |
|-------|------|-------------|
| effect_type | string | `DROP_SHADOW` / `INNER_SHADOW` / `LAYER_BLUR` |
| css_value | string | Full CSS shadow/blur value |
| css_variable | string | null | Matched token variable |
| css_property | string | CSS property name (`box-shadow` / `filter`) |

### CSSMappedValue

| Field | Type | Description |
|-------|------|-------------|
| value | number | Raw numeric value |
| css_variable | string | null | Matched token variable (e.g. `var(--radius-8)`) |
| css_property | string | CSS property name (`border-radius`) |

### CSSMappedTypography

| Field | Type | Description |
|-------|------|-------------|
| font_family | string | Font family name |
| font_family_css | string | null | `var(--font-family-xxx)` |
| font_size | number | Font size in px |
| font_size_css | string | null | `var(--font-size-xxx)` |
| font_weight | number | Font weight |
| font_weight_css | string | null | `var(--font-weight-xxx)` |
| line_height | string | Line height (px or %) |
| letter_spacing | number | Letter spacing in px |
| text_align | string | Horizontal text alignment |
| text_case | string | Text transform |
| text_decoration | string | Text decoration |
| color_hex | string | Text color |
| color_css | string | null | `var(--color-xxx)` |

### LayoutInfo

| Field | Type | Description |
|-------|------|-------------|
| mode | string | `HORIZONTAL` / `VERTICAL` / `NONE` |
| padding | { top, right, bottom, left } | Padding values in px |
| padding_css | CSSMappedValue[] | Matched spacing variables for each side |
| item_spacing | number | Gap between children |
| item_spacing_css | string | null | `var(--spacing-xxx)` |
| counter_axis_spacing | number | null | Wrap spacing |
| primary_axis_align | string | Main axis alignment |
| counter_axis_align | string | Cross axis alignment |
| layout_wrap | string | `NO_WRAP` / `WRAP` |

### ComponentRef

| Field | Type | Description |
|-------|------|-------------|
| component_id | string | Component definition ID |
| component_name | string | Component name |
| is_instance | boolean | Whether this is an instance |
| variant_properties | Record<string, string> | null | Variant key-value pairs |

### DocumentStructure

Response format for `get_document_structure`.

| Field | Type | Description |
|-------|------|-------------|
| file_id | string | Figma file ID |
| file_name | string | File name |
| pages | PageSummary[] | Page list |
| component_count | number | Total components |
| component_set_count | number | Total component sets |

### PageSummary

| Field | Type | Description |
|-------|------|-------------|
| page_id | string | Page node ID |
| name | string | Page name |
| child_count | number | Direct children count |
| top_frames | FrameSummary[] | Top-level frames |

### FrameSummary

| Field | Type | Description |
|-------|------|-------------|
| node_id | string | Frame node ID |
| name | string | Frame name |
| width | number | Frame width |
| height | number | Frame height |
| node_type | string | Node type |

### TokenSearchResult

Response format for `search_token`.

| Field | Type | Description |
|-------|------|-------------|
| query | string | Original search query |
| matches | TokenMatch[] | Matched tokens (sorted by relevance) |

### TokenMatch

| Field | Type | Description |
|-------|------|-------------|
| category | string | Token category (color, spacing, typography, etc.) |
| name | string | Token name |
| css_variable | string | CSS variable name |
| value | string | Token value (hex, px, etc.) |
| usage_count | number | Usage count in design |
| distance | number | Match distance (0 = exact) |

## Relationships

```
CacheEntry 1──1 FigmaFile     (from figma-scaler)
CacheEntry 1──* ParsedNode    (from figma-scaler)
CacheEntry 1──1 AllTokens     (from figma-scaler)
NodeDetail *──* CSSMappedFill (inline)
NodeDetail 0──1 LayoutInfo    (auto-layout nodes only)
NodeDetail 0──1 CSSMappedTypography (TEXT nodes only)
NodeDetail *──* NodeDetail    (children, up to depth limit)
```

## State Transitions

### CacheEntry Lifecycle

```
[empty] → FETCHING → CACHED → EXPIRED → FETCHING → CACHED
                                  ↑
                          force_refresh
```

- `FETCHING`: API request in flight (dedup lock held)
- `CACHED`: Data available, TTL not expired
- `EXPIRED`: TTL exceeded, next access triggers re-fetch
