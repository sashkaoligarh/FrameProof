/**
 * MCP Prompt: write_design_strategy
 * How to write design data back to Figma via MCP tools.
 */

export const WRITE_DESIGN_STRATEGY_NAME = 'write_design_strategy';
export const WRITE_DESIGN_STRATEGY_DESCRIPTION =
  'How to write design tokens, dev resources, and comments back to Figma';

export const WRITE_DESIGN_STRATEGY_MESSAGE = `When writing data to Figma via MCP tools, follow this strategy:

## Important Limitations

- Variables API requires **Figma Enterprise plan**. If you get a 403 error mentioning Enterprise, inform the user.
- Dev Resources and Comments work on **all Figma plans**.
- You CANNOT create design elements (frames, shapes, text, components) via REST API. Only variables, dev resources, and comments.
- Max 10 dev resources per node.
- POST body max 4MB for batch variable operations.

## Variables Workflow (Design Tokens)

### Step 1: Read current state first
ALWAYS call get_variables before writing to understand existing collections, modes, and variable IDs.

### Step 2: Choose the right tool
- **Single variable/collection**: Use individual tools (create_variable, update_variable, etc.)
- **Bulk operations (5+ changes)**: Use sync_variables for atomic batch execution
- Individual tools are wrappers around the same batch endpoint — no performance difference for single ops

### Step 3: Color format
Variables accept colors in two formats:
- Hex strings: \`#FF4136\` (6-digit) or \`#FF413680\` (8-digit with alpha)
- RGBA objects: \`{ r: 1, g: 0.255, b: 0.212, a: 1 }\` (floats 0–1)
Hex is auto-converted to RGBA before sending to Figma.

### Step 4: Destructive operations
ALWAYS use \`dry_run: true\` first for:
- delete_variable
- sync_variables (when it includes deletes)
Show the user the preview, then confirm before executing with \`dry_run: false\`.

### Step 5: Idempotency
Create tools are idempotent — calling create_variable_collection with an existing name returns the existing collection. Safe to retry.

### Example: Create a design system
\`\`\`
1. get_variables { file_id: "..." }                    → see what exists
2. create_variable_collection { name: "Colors", modes: ["Light", "Dark"] }
3. create_variable { collection_id: "...", name: "primary-500", resolved_type: "COLOR",
     values_by_mode: { "mode1": "#0074D9", "mode2": "#004E94" } }
4. create_variable { name: "spacing-sm", resolved_type: "FLOAT",
     values_by_mode: { "mode1": 8 } }
\`\`\`

### Example: Batch sync
\`\`\`
sync_variables {
  file_id: "...",
  dry_run: true,        ← preview first!
  variables: [
    { action: "CREATE", name: "new-color", variable_collection_id: "...", resolved_type: "COLOR" },
    { action: "UPDATE", id: "VariableID:123", name: "renamed-color" },
    { action: "DELETE", id: "VariableID:456" }
  ],
  variable_mode_values: [
    { variable_id: "temp_var_1", mode_id: "mode:1", value: "#FF0000" }
  ]
}
\`\`\`

## Dev Resources Workflow

Attach code references to design nodes so developers see them in Figma Dev Mode.

\`\`\`
1. list_dev_resources { file_id: "...", node_id: "42:100" }  → see what exists
2. create_dev_resource { file_id: "...", node_id: "42:100",
     name: "Button.tsx", url: "https://github.com/.../Button.tsx" }
\`\`\`

Idempotent by URL — won't create duplicates if the same URL is already attached.

## Comments Workflow

Add review comments and implementation notes to designs.

\`\`\`
1. post_comment { file_id: "...", message: "Spacing needs 16px per tokens",
     node_id: "42:100", x: 50, y: 20 }
2. reply_to_comment { file_id: "...", comment_id: "comment_456",
     message: "Fixed in v2" }
3. get_comments { file_id: "..." }                    → see all comments with threads
\`\`\`

Comments are NOT idempotent — posting twice creates two comments. Be careful with retries.

## Error Handling

All errors include actionable messages:
- **403 Enterprise**: Variables API requires Enterprise plan
- **403 Scopes**: Token needs write scopes (file_variables:write, file_dev_resources:write, file_comments:write)
- **404**: Resource not found — use get_variables / list_dev_resources to find valid IDs
- **429**: Rate limited — wait and retry (handled automatically with Retry-After)
- **400**: Invalid request — check parameter values`;
