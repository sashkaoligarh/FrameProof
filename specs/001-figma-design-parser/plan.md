# Implementation Plan: Figma Design Parser

**Branch**: `001-figma-design-parser` | **Date**: 2026-02-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-figma-design-parser/spec.md`

## Summary

Создание CLI-утилиты на TypeScript для pixel-perfect извлечения
дизайн-токенов из Figma-файлов через REST API. Утилита парсит
полное дерево нод, извлекает цвета, типографику, отступы, радиусы,
тени, градиенты и компоненты с вариантами, генерирует CSS Custom
Properties, JSON в формате W3C DTCG, и Markdown-контекст для
AI-ассистентов. Архитектура — 4-стадийный пайплайн из чистых функций:
fetch → parse → extract → write.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), ESM, Node.js >= 20
**Primary Dependencies**: `commander` (CLI), `@figma/rest-api-spec` (типы, dev)
**Storage**: Файловая система (JSON, CSS, Markdown файлы)
**Testing**: vitest (snapshot testing + fixture-based)
**Target Platform**: macOS, Linux, Windows (Node.js CLI)
**Project Type**: CLI-утилита / библиотека
**Performance Goals**: Парсинг 5000 нод < 30 секунд (без API latency)
**Constraints**: 0 runtime зависимостей кроме commander; детерминированный вывод
**Scale/Scope**: Файлы с 1-50 000 нодами; 1 пользователь за раз

## Constitution Check

*GATE: Проверено перед Phase 0. Перепроверено после Phase 1.*

| Принцип | Статус | Как обеспечивается |
|---------|--------|--------------------|
| I. Parsing Fidelity | ✅ | Все свойства нод из Figma API сохраняются в `raw` поле ParsedNode. Экстракторы читают из raw, не теряя данных. Типы из `@figma/rest-api-spec` гарантируют полноту. |
| II. AI-Optimized Output | ✅ | CONTEXT.md с таблицами токенов, usage count, маппингом компонентов. CSS-переменные с категоризацией. JSON в DTCG-формате с `$extensions` для метаданных. |
| III. Data Integrity | ✅ | Каждый ParsedNode хранит node_id. Ошибки парсинга аккумулируются, не прерывают процесс. manifest.json фиксирует метаданные. Неизвестные типы нод — warning, не error. |
| IV. Test-Driven Parsing | ✅ | Fixture-based тесты с реальными API-ответами. Snapshot-тесты для CSS/JSON/MD вывода. tests/fixtures/ директория для фикстур. |
| V. Simplicity & Predictability | ✅ | Чистые функции, детерминированный вывод. Итеративный DFS (не рекурсия). Нет эвристик для "угадывания" дизайн-интента. YAGNI — никаких MCP/SCSS/Tailwind в v1. |
| Data Quality: Completeness | ✅ | Все свойства Figma REST API для каждого типа ноды. Exclusion list документирован (скрытые слои по умолчанию). |
| Data Quality: Accuracy | ✅ | Числа не округляются при извлечении (округление только при CSS-генерации). RGBA точность 1/255. |
| Data Quality: Consistency | ✅ | snake_case для JSON, kebab-case для CSS. Нормализация в utils/naming.ts. |
| Data Quality: Traceability | ✅ | Каждый токен содержит node_id. DTCG JSON — в `$extensions.figma-scaler.node_id`. |
| Data Quality: Error reporting | ✅ | Ошибки парсинга включают node_id и причину. Неизвестные типы нод логируются. |

**Нарушений нет.** Complexity Tracking не требуется.

## Project Structure

### Документация (эта фича)

```text
specs/001-figma-design-parser/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli-interface.md
└── checklists/
    └── requirements.md
```

### Source Code (корень репозитория)

```text
src/
├── cli.ts                  # Точка входа — парсинг аргументов
├── index.ts                # Публичный API (для использования как библиотеки)
├── api/
│   └── client.ts           # Figma API HTTP-клиент (fetch wrapper)
├── pipeline/
│   ├── fetch.ts            # Стадия 1: запрос к Figma API
│   ├── parse.ts            # Стадия 2: обход дерева → ParsedNode[]
│   ├── transform.ts        # Стадия 3: ParsedNode[] → AllTokens
│   └── output.ts           # Стадия 4: AllTokens → файлы
├── extractors/
│   ├── colors.ts           # Извлечение цветов (fills + strokes)
│   ├── gradients.ts        # Извлечение градиентов
│   ├── typography.ts       # Извлечение типографики (TEXT ноды)
│   ├── spacing.ts          # Извлечение spacing (auto-layout)
│   ├── radius.ts           # Извлечение border-radius
│   ├── shadows.ts          # Извлечение теней и эффектов
│   ├── images.ts           # Извлечение IMAGE fills + скачивание
│   └── components.ts       # Извлечение компонентов + вариантов
├── writers/
│   ├── css.ts              # CSS Custom Properties writer
│   ├── json.ts             # W3C DTCG JSON writer
│   ├── markdown.ts         # AI-контекст Markdown writer
│   └── manifest.ts         # manifest.json writer
├── types/
│   └── tokens.ts           # Типы: ColorToken, TypographyToken, и т.д.
└── utils/
    ├── color.ts            # RGBA → hex/CSS conversion
    ├── naming.ts           # kebab-case / snake_case нормализация
    └── variant-parser.ts   # Парсинг "Size=S, State=Default" строк

tests/
├── fixtures/
│   ├── api-responses/      # Зафиксированные API-ответы (committed)
│   │   ├── simple-file.json
│   │   ├── component-set-variants.json
│   │   ├── deep-nesting.json
│   │   ├── typography-styles.json
│   │   └── auto-layout.json
│   └── snapshots/          # Ожидаемые файлы вывода
│       ├── tokens.css
│       ├── colors.json
│       └── context.md
├── unit/
│   ├── extractors/
│   │   ├── colors.test.ts
│   │   ├── gradients.test.ts
│   │   ├── typography.test.ts
│   │   ├── spacing.test.ts
│   │   ├── radius.test.ts
│   │   ├── shadows.test.ts
│   │   └── components.test.ts
│   ├── writers/
│   │   ├── css.test.ts
│   │   ├── json.test.ts
│   │   └── markdown.test.ts
│   ├── utils/
│   │   ├── color.test.ts
│   │   ├── naming.test.ts
│   │   └── variant-parser.test.ts
│   └── pipeline/
│       └── parse.test.ts
└── integration/
    ├── pipeline.test.ts
    └── performance.test.ts

package.json
tsconfig.json
vitest.config.ts
```

**Structure Decision**: Single project (Option 1). CLI-утилита с
библиотечным API. Исходный код в `src/`, тесты в `tests/`,
скомпилированный код в `dist/` (gitignored).

## Complexity Tracking

> Нарушений Constitution Check нет. Таблица пуста.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
