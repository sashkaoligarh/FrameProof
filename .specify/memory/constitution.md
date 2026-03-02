<!--
Sync Impact Report
==================
- Version change: 1.0.0 → 1.1.0 (clarifications from /speckit.analyze)
- Modified principles:
  - III. Data Integrity: clarified error handling — accumulate warnings
    and continue processing, not terminate (was ambiguous "surface error
    rather than silently producing partial results")
- Modified Data Quality Standards:
  - Consistency: added kebab-case for CSS output alongside snake_case
    for JSON (was only snake_case)
- Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ compatible
  - .specify/templates/spec-template.md — ✅ compatible
  - .specify/templates/tasks-template.md — ✅ compatible
- Follow-up TODOs: none
-->

# Figma Scaler Constitution

## Core Principles

### I. Parsing Fidelity

Every interaction with the Figma API MUST produce a complete and
structurally accurate representation of the source data. Parsed output
MUST preserve the full node hierarchy, all relevant properties
(styles, constraints, layout modes, auto-layout settings, component
references), and relationships between nodes. Lossy shortcuts are
prohibited — if a Figma property exists on a node, it MUST appear in
the parsed result unless explicitly excluded by a documented filter
rule.

**Rationale**: The entire value proposition of this project depends on
AI receiving faithful Figma data. Any inaccuracy or omission
propagates into incorrect AI-generated output, undermining user trust.

### II. AI-Optimized Output

All parsed Figma data MUST be transformed into a structured format
optimized for consumption by AI models via the Model Context Protocol
(MCP). Output MUST use consistent naming conventions, flatten deeply
nested structures where it improves comprehension without losing
semantics, and include contextual metadata (node type, parent chain,
bounding box, visibility) that enables AI to reason about layout and
design intent. Token efficiency MUST be considered — redundant or
verbose data MUST be compressed or omitted when a compact
representation conveys the same information.

**Rationale**: MCP + AI workflows are bounded by context window size
and model comprehension. Output that is bloated, inconsistent, or
missing context degrades AI performance regardless of parsing accuracy.

### III. Data Integrity

No data MUST be lost, corrupted, or silently dropped during any
transformation step. Every pipeline stage (fetch → parse → transform →
output) MUST be independently verifiable. When a Figma API response
contains unexpected or malformed data, the system MUST surface a clear
warning (including node_id and error reason) and continue processing
remaining nodes — rather than silently skipping or terminating the
entire pipeline. Errors MUST be accumulated and reported in the final
output. Schema changes in the Figma API MUST be detected and handled
explicitly — never ignored.

**Rationale**: Silent data loss is the worst failure mode for a
parsing tool. Users cannot verify correctness if errors are hidden.

### IV. Test-Driven Parsing

All parsing and transformation logic MUST have tests that use real
Figma API response fixtures. Unit tests MUST cover every supported
node type and property. Integration tests MUST verify end-to-end
parsing of representative Figma files. When a new Figma node type or
property is supported, tests MUST be written and fail before
implementation begins (red-green-refactor). Fixture data MUST be
committed to the repository and kept up to date.

**Rationale**: Figma's data model is complex and evolves over time.
Without comprehensive fixture-based tests, regressions in parsing
accuracy go undetected until users encounter them.

### V. Simplicity & Predictability

Transformations MUST be minimal and deterministic. Given the same
Figma input, the system MUST always produce the same output. Avoid
heuristics that guess design intent — instead, expose raw data with
clear labels and let the AI layer make interpretive decisions. Keep
the codebase small: prefer a single well-tested parser over multiple
competing approaches. YAGNI applies — do not build abstractions for
hypothetical future Figma features.

**Rationale**: Predictable output enables reliable AI workflows.
Non-determinism and speculative abstractions increase debugging
difficulty and reduce user confidence.

## Data Quality Standards

- **Completeness**: Parsed output MUST include all properties
  documented in the Figma REST API for each node type, unless a
  property is on an explicit exclusion list with a documented reason.
- **Accuracy**: Property values MUST match the Figma API response
  exactly. Numeric values MUST NOT be rounded or truncated unless
  a documented precision policy applies.
- **Consistency**: Property names in data output (JSON) MUST follow
  snake_case convention. CSS output MUST use kebab-case per CSS
  standard. Figma's mixed naming MUST be normalized to the
  appropriate convention for each output format.
- **Traceability**: Every output node MUST carry its Figma `node_id`
  so that results can be traced back to the source.
- **Error reporting**: When a node cannot be parsed, the system MUST
  include the node ID and error reason in the output rather than
  skipping the node silently.

## Development Workflow

- **Branch strategy**: Feature branches off `main`, merged via PR.
- **PR requirements**: All PRs MUST pass CI (lint + tests) before
  merge. PRs that modify parsing logic MUST include updated or new
  fixture-based tests.
- **Code review**: Changes to core parsing logic MUST be reviewed
  by at least one other contributor (or self-reviewed with an
  explicit checklist if solo).
- **Fixture management**: New Figma API fixtures MUST be added when
  supporting new node types. Fixtures MUST be stored in a dedicated
  `tests/fixtures/` directory.
- **Commit discipline**: Commits MUST be atomic and descriptive.
  Each commit SHOULD address a single concern.

## Governance

This constitution is the authoritative reference for all design and
implementation decisions in the Figma Scaler project. When a conflict
arises between this constitution and any other document, the
constitution prevails.

- **Amendments**: Any change to this constitution MUST be documented
  with a version bump, rationale, and migration plan if principles
  are removed or redefined.
- **Versioning**: Follows semantic versioning — MAJOR for
  principle removals/redefinitions, MINOR for new principles or
  material expansions, PATCH for clarifications and wording fixes.
- **Compliance**: All PRs and code reviews MUST verify that changes
  comply with the principles above. Non-compliance MUST be justified
  in writing before merge.
- **Runtime guidance**: Use `CLAUDE.md` at the repository root for
  development-time agent guidance that supplements this constitution.

**Version**: 1.1.0 | **Ratified**: 2026-02-27 | **Last Amended**: 2026-02-27
