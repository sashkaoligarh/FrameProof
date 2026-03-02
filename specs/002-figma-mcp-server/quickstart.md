# Quickstart: Figma MCP Server

## Prerequisites

- Node.js >= 20
- Figma Personal Access Token (https://www.figma.com/developers/api#access-tokens)
- Claude Code installed

## Installation

```bash
cd figma_scaler
npm install
npm run build
```

## Setup in Claude Code

### Option 1: Via CLI

```bash
claude mcp add figma-scaler -- node ./dist/mcp/server.js
```

### Option 2: Via .mcp.json (project-level)

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "figma-scaler": {
      "command": "node",
      "args": ["/path/to/figma_scaler/dist/mcp/server.js"],
      "env": {
        "FIGMA_TOKEN": "figd_xxxxx"
      }
    }
  }
}
```

### Option 3: Via environment variable

```bash
export FIGMA_TOKEN="figd_xxxxx"
```

Then the MCP server reads it automatically.

## Usage in Claude Code

### 1. Load design system context

Tell Claude Code:
> "Load design tokens from Figma file `abc123`"

Claude Code will call `get_design_tokens` → cache tokens → use them for all subsequent coding.

### 2. Inspect a component

Tell Claude Code:
> "Show me the structure of node `1:234` from file `abc123`"

Claude Code calls `get_node_info` → gets full layout + CSS mappings → uses them in code.

### 3. Use MCP Prompts

Activate prompt in Claude Code:
> Use the `layout_strategy` prompt

Claude Code loads pixel-perfect layout rules and applies them automatically.

## MCP Tools Summary

| Tool | Purpose |
|------|---------|
| `get_design_tokens` | Extract all tokens (colors, typography, spacing, etc.) |
| `get_node_info` | Inspect a specific node with CSS mappings |
| `get_nodes_info` | Inspect multiple nodes (batch) |
| `get_css_variables` | Generate CSS Custom Properties file |
| `export_node_image` | Export node as SVG/PNG/JPG/PDF |
| `get_document_structure` | File overview (pages, frames, components) |
| `get_design_context` | AI-optimized design system summary |
| `search_token` | Find token by value (hex, number, font name) |

## MCP Prompts

| Prompt | Purpose |
|--------|---------|
| `layout_strategy` | Pixel-perfect layout rules |
| `read_design_strategy` | How to read and implement designs |
| `token_usage_rules` | Rules for using CSS variables |

## MCP Resources

| URI | Purpose |
|-----|---------|
| `figma://tokens/{file_id}` | Auto-access tokens for a file |

## Verification

After setup, ask Claude Code:
> "What MCP tools do you have for Figma?"

It should list all 8 tools. Then test:
> "Get the document structure of Figma file `YOUR_FILE_ID`"
