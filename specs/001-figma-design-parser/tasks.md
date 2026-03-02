# Tasks: Figma Design Parser

**Input**: Design documents from `/specs/001-figma-design-parser/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-interface.md

**Tests**: Включены — конституция проекта (Принцип IV: Test-Driven Parsing) требует fixture-based тесты для всей логики парсинга.

**Organization**: Задачи сгруппированы по user stories для независимой реализации и тестирования.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимостей)
- **[Story]**: К какой user story относится задача (US1, US2, US3, US4)
- Все пути — от корня репозитория

---

## Phase 1: Setup

**Purpose**: Инициализация проекта и базовая структура

- [X] T001 Создать структуру директорий проекта: `src/api/`, `src/pipeline/`, `src/extractors/`, `src/writers/`, `src/types/`, `src/utils/`, `tests/fixtures/api-responses/`, `tests/fixtures/snapshots/`, `tests/unit/extractors/`, `tests/unit/writers/`, `tests/unit/utils/`, `tests/unit/pipeline/`, `tests/integration/`
- [X] T002 Инициализировать `package.json` (name: figma-scaler, type: module, bin: ./dist/cli.js, engines: node>=20, scripts: build/test/typecheck/dev)
- [X] T003 [P] Настроить `tsconfig.json` (strict: true, target: ES2022, module: NodeNext, moduleResolution: NodeNext, outDir: dist, rootDir: src)
- [X] T004 [P] Настроить `vitest.config.ts` (include: tests/**/*.test.ts, coverage: v8)
- [X] T005 Установить зависимости: runtime (`commander`), dev (`typescript`, `vitest`, `@figma/rest-api-spec`, `@types/node`, `css-tree` для валидации CSS — SC-005)
- [X] T006 [P] Создать `.gitignore` (dist/, node_modules/, .env, *.tgz)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Базовая инфраструктура, необходимая ВСЕМ user stories

**CRITICAL**: Ни одна user story не может начаться до завершения этой фазы

- [X] T007 Определить все типы токенов в `src/types/tokens.ts`: ParseContext, ParsedNode, ColorToken, GradientToken, TypographyToken, SpacingToken, RadiusToken, ShadowToken, ImageToken, ComponentInfo, VariantInfo, ComponentChild, AllTokens, OutputManifest (согласно data-model.md)
- [X] T008 Реализовать Figma API клиент в `src/api/client.ts`: функция fetchFigmaFile(fileId, token, options) с built-in fetch, заголовок X-Figma-Token, AbortSignal.timeout(30s), авто-retry при 429 (Retry-After, до 3 попыток — FR-017), маскировка токена в логах (FR-018), обработка ошибок (FR-014)
- [X] T009 Реализовать обход дерева нод в `src/pipeline/parse.ts`: итеративный DFS с явным стеком (не рекурсия), ParsedNode[] на выходе, фильтрация скрытых слоёв (visible: false по умолчанию пропускаются), сохранение parent_id и depth
- [X] T010 [P] Реализовать утилиту конвертации цветов в `src/utils/color.ts`: rgbaToHex({r,g,b,a} → #RRGGBB/#RRGGBBAA), rgbaToCSS({r,g,b,a} → rgba() или hex), hslFromRgba() для авто-именования
- [X] T011 [P] Реализовать утилиту именования в `src/utils/naming.ts`: toKebabCase(string), toSnakeCase(string), autoNameColor(rgba → имя по hue/luminance), sanitizeStyleName(figmaStyleName → kebab-case) — FR-012, FR-016
- [X] T012 [P] Реализовать парсер вариантов в `src/utils/variant-parser.ts`: parseVariantName("Size=S, State=Default") → {Size: "S", State: "Default"}
- [X] T013 [P] Написать unit-тесты для утилит: `tests/unit/utils/color.test.ts` (конвертации hex/rgba/css, edge cases: прозрачность, чёрный, белый)
- [X] T014 [P] Написать unit-тесты для утилит: `tests/unit/utils/naming.test.ts` (kebab-case, snake_case, Figma style names, спецсимволы)
- [X] T015 [P] Написать unit-тесты для утилит: `tests/unit/utils/variant-parser.test.ts` (стандартные варианты, пустая строка, одно свойство, спецсимволы в значениях)
- [X] T016 Написать unit-тест обхода дерева: `tests/unit/pipeline/parse.test.ts` (фикстура с 3+ уровнями вложенности, фильтрация скрытых, подсчёт нод, parent_id корректность)
- [X] T017 Создать минимальную тестовую фикстуру: `tests/fixtures/api-responses/simple-file.json` — минимальный ответ Figma API с DOCUMENT > CANVAS > FRAME > несколько нод (RECTANGLE с fill, TEXT с style, FRAME с auto-layout)

**Checkpoint**: Фундамент готов — можно начинать user stories

---

## Phase 3: User Story 1 — Извлечение дизайн-токенов (Priority: P1) MVP

**Goal**: Полный набор дизайн-токенов из Figma-файла → JSON (DTCG) + CSS Custom Properties

**Independent Test**: Запустить `figma-scaler parse <fileId>` и сравнить полученные токены с ручной инспекцией в Figma — значения MUST совпадать

### Tests for User Story 1

- [X] T018 [P] [US1] Написать unit-тест экстрактора цветов: `tests/unit/extractors/colors.test.ts` — извлечение solid fills, strokes, дедупликация по hex, пропуск opacity < 0.02, usage_count (= кол-во уникальных нод), приоритет Named Styles, assertion на точность RGBA ±1/255 (SC-001)
- [X] T019 [P] [US1] Написать unit-тест экстрактора градиентов: `tests/unit/extractors/gradients.test.ts` — LINEAR, RADIAL, ANGULAR, DIAMOND, gradientStops, handle_positions
- [X] T020 [P] [US1] Написать unit-тест экстрактора типографики: `tests/unit/extractors/typography.test.ts` — fontFamily, fontSize, fontWeight, lineHeight (auto/px/%), letterSpacing, textCase, textDecoration, assertion на числовую точность ±0.5px (SC-002)
- [X] T021 [P] [US1] Написать unit-тест экстрактора spacing: `tests/unit/extractors/spacing.test.ts` — padding 4 стороны, itemSpacing, counterAxisSpacing, дедупликация значений
- [X] T022 [P] [US1] Написать unit-тест экстрактора radius: `tests/unit/extractors/radius.test.ts` — cornerRadius, rectangleCornerRadii (4 угла), дедупликация
- [X] T023 [P] [US1] Написать unit-тест экстрактора теней: `tests/unit/extractors/shadows.test.ts` — DROP_SHADOW, INNER_SHADOW, offset/blur/spread/color, CSS-генерация
- [X] T024 [P] [US1] Написать unit-тесты writers: `tests/unit/writers/css.test.ts` — валидный CSS :root {}, группировка по категориям, kebab-case переменные, проверка парсинга результата через css-tree (SC-005)
- [X] T025 [P] [US1] Написать unit-тесты writers: `tests/unit/writers/json.test.ts` — DTCG формат ($type, $value, $extensions), snake_case ключи

### Implementation for User Story 1

- [X] T026 [P] [US1] Реализовать экстрактор цветов в `src/extractors/colors.ts`: извлечение из fills (SOLID) + strokes, дедупликация по hex, opacity фильтр (> 0.02), usage_count (= кол-во уникальных нод — FR-019), used_in_types, именование через Named Styles с fallback на hue/luminance — FR-001, FR-016, FR-019
- [X] T027 [P] [US1] Реализовать экстрактор градиентов в `src/extractors/gradients.ts`: LINEAR/RADIAL/ANGULAR/DIAMOND, gradientStops с position и color, handle_positions — FR-001b
- [X] T028 [P] [US1] Реализовать экстрактор типографики в `src/extractors/typography.ts`: из TEXT нод — style.fontFamily/fontSize/fontWeight/lineHeight*/letterSpacing/textCase/textDecoration, lineHeightUnit обработка (INTRINSIC_% = auto), дедупликация по key, sample_text — FR-002
- [X] T029 [P] [US1] Реализовать экстрактор spacing в `src/extractors/spacing.ts`: из нод с layoutMode — paddingTop/Right/Bottom/Left, itemSpacing, counterAxisSpacing, фильтр > 0, дедупликация — FR-003
- [X] T030 [P] [US1] Реализовать экстрактор radius в `src/extractors/radius.ts`: cornerRadius (единый) + rectangleCornerRadii (по углам), фильтр > 0, дедупликация — FR-004
- [X] T031 [P] [US1] Реализовать экстрактор теней в `src/extractors/shadows.ts`: effects[] с type DROP_SHADOW/INNER_SHADOW — offset.x/y, radius, spread, color, CSS-строка генерация, LAYER_BLUR/BACKGROUND_BLUR — FR-005
- [X] T032 [P] [US1] Реализовать экстрактор изображений в `src/extractors/images.ts`: извлечение IMAGE fills → imageRef, scaleMode; скачивание через `GET /v1/images/:key` в `<output>/images/{sanitized_node_id}.png` (санитизация `:` → `-` для совместимости с Windows) — FR-015
- [X] T033 [US1] Реализовать CSS writer в `src/writers/css.ts`: :root {} с CSS Custom Properties, группировка по категориям (Colors, Typography, Spacing, Radius, Shadows), комментарий с source info (без токена — FR-018), kebab-case имена — FR-007
- [X] T034 [US1] Реализовать JSON DTCG writer в `src/writers/json.ts`: W3C DTCG формат ($type, $value, $extensions.figma-scaler с node_id + usage_count), отдельные файлы: colors.json, typography.json, spacing.json, border-radius.json, shadows.json, gradients.json — FR-008
- [X] T035 [US1] Реализовать manifest writer в `src/writers/manifest.ts`: file_id, file_name, generated_at (ISO 8601), node_count, filters_applied, token_counts — без токена в output (FR-018)
- [X] T036 [US1] Реализовать pipeline orchestrator в `src/pipeline/transform.ts`: вызов всех экстракторов на ParsedNode[] → AllTokens
- [X] T037 [US1] Реализовать pipeline output в `src/pipeline/output.ts`: вызов всех writers, создание output директории, запись файлов через fs.promises
- [X] T038 [US1] Реализовать pipeline fetch в `src/pipeline/fetch.ts`: обёртка над api/client.ts, парсинг URL → fileId, прогресс в stderr
- [X] T039 [US1] Реализовать CLI entry point в `src/cli.ts`: commander с командой `parse <fileId>`, опции --token/-t, --output/-o, --include-hidden, --format/-f, чтение $FIGMA_TOKEN из env — FR-009, FR-018
- [X] T040 [US1] Создать тестовую фикстуру: `tests/fixtures/api-responses/typography-styles.json` — TEXT ноды с разными стилями (разные шрифты, размеры, weights, line-height types)
- [X] T041 [US1] Создать тестовую фикстуру: `tests/fixtures/api-responses/auto-layout.json` — FRAME с auto-layout (padding, itemSpacing, counterAxisSpacing, alignment)
- [X] T042 [US1] Написать snapshot-тесты вывода: `tests/integration/pipeline.test.ts` — полный пайплайн от фикстуры до CSS/JSON файлов, toMatchFileSnapshot() для `tests/fixtures/snapshots/tokens.css` и `tests/fixtures/snapshots/colors.json`
- [X] T043 [US1] Реализовать публичный API в `src/index.ts`: экспорт ключевых функций (parseFigmaFile, extractTokens, generateCSS, generateJSON) для использования как библиотеки

**Checkpoint**: US1 полностью функциональна — `figma-scaler parse <fileId>` извлекает все токены в JSON + CSS

---

## Phase 4: User Story 2 — Компоненты с layout-данными (Priority: P2)

**Goal**: Детальная информация о каждом компоненте: размеры, auto-layout, варианты

**Independent Test**: Описание 3-5 компонентов парсером → по описанию воссоздать layout → визуальное совпадение с оригиналом

### Tests for User Story 2

- [X] T044 [P] [US2] Написать unit-тест экстрактора компонентов: `tests/unit/extractors/components.test.ts` — COMPONENT и COMPONENT_SET, размеры, layout свойства (all 8 auto-layout fields), children hierarchy, assertion на полноту: кол-во извлечённых компонентов = кол-во COMPONENT + COMPONENT_SET нод в фикстуре (SC-003)
- [X] T045 [P] [US2] Создать тестовую фикстуру: `tests/fixtures/api-responses/component-set-variants.json` — COMPONENT_SET с 4+ вариантами (Size=S/M/L, State=Default/Hover), componentPropertyDefinitions

### Implementation for User Story 2

- [X] T046 [US2] Реализовать экстрактор компонентов в `src/extractors/components.ts`: COMPONENT и COMPONENT_SET → ComponentInfo с полными layout данными (layoutMode, padding 4 стороны, itemSpacing, counterAxisSpacing, primaryAxisAlignItems, counterAxisAlignItems, layoutWrap, clipsContent), размеры из absoluteBoundingBox, cornerRadius/cornerRadii — FR-006
- [X] T047 [US2] Добавить парсинг вариантов в `src/extractors/components.ts`: для COMPONENT_SET → children COMPONENT, парсинг name через variant-parser.ts → VariantInfo[] с properties map, componentPropertyDefinitions для схемы — FR-006
- [X] T048 [US2] Добавить иерархию дочерних нод в `src/extractors/components.ts`: итеративное построение ComponentChild[] с использованием стека (не рекурсия — Принцип V) с node_id, node_type, name, children — для воспроизведения структуры
- [X] T049 [US2] Обновить JSON writer `src/writers/json.ts`: добавить генерацию `components.json` с полными данными компонентов, вариантов и children
- [X] T050 [US2] Обновить pipeline transform `src/pipeline/transform.ts`: включить вызов extractComponents() в формирование AllTokens
- [X] T051 [US2] Создать тестовую фикстуру: `tests/fixtures/api-responses/deep-nesting.json` — компонент с 6+ уровнями вложенности (FRAME > FRAME > GROUP > RECTANGLE + TEXT)
- [X] T052 [US2] Написать snapshot-тест: обновить `tests/integration/pipeline.test.ts` — проверить components.json output с вариантами

**Checkpoint**: US1 + US2 работают — токены + компоненты с layout и вариантами

---

## Phase 5: User Story 3 — AI-оптимизированный контекст (Priority: P3)

**Goal**: Структурированный CONTEXT.md для AI-ассистентов с правилами, токенами, компонентами

**Independent Test**: Подать CONTEXT.md + скриншот компонента AI-ассистенту → AI воспроизводит компонент без обращения к Figma

### Tests for User Story 3

- [X] T053 [P] [US3] Написать unit-тест markdown writer: `tests/unit/writers/markdown.test.ts` — наличие всех секций (Colors, Typography, Spacing, Components), таблицы с | разделителями, правила использования токенов

### Implementation for User Story 3

- [X] T054 [US3] Реализовать markdown writer в `src/writers/markdown.ts`: генерация CONTEXT.md с секциями: Source (file ID, дата, страницы), How to use (import CSS, правила — никогда не хардкодить), Colors table (CSS var, value, usage count, node ID — топ по usage), Typography table (family, size, weight, line-height), Spacing scale, Border radius scale, Components table (name, node ID, dimensions, layout info) — FR-011
- [X] T055 [US3] Обновить pipeline output `src/pipeline/output.ts`: включить вызов markdown writer при --format all или --format context
- [X] T056 [US3] Написать snapshot-тест: обновить `tests/integration/pipeline.test.ts` — проверить CONTEXT.md output через toMatchFileSnapshot()

**Checkpoint**: US1 + US2 + US3 — полный набор: токены + компоненты + AI-контекст

---

## Phase 6: User Story 4 — Парсинг конкретной страницы/секции (Priority: P3)

**Goal**: Фильтрация по странице или node ID для работы с большими файлами

**Independent Test**: Указать node ID фрейма → парсер обработает только его содержимое

### Tests for User Story 4

- [X] T057 [P] [US4] Написать unit-тест фильтрации в `tests/unit/pipeline/parse.test.ts`: добавить тесты для page filter (по имени CANVAS), node filter (по ID), фикстура с 2+ страницами

### Implementation for User Story 4

- [X] T058 [US4] Обновить API клиент `src/api/client.ts`: добавить поддержку `ids` query parameter для GET /v1/files/:key (фильтрация по node ID), и GET /v1/files/:key/nodes?ids=X для конкретных нод — FR-010
- [X] T059 [US4] Обновить парсер `src/pipeline/parse.ts`: добавить логику page filter (поиск CANVAS ноды по имени → парсинг только её subtree), node filter (поиск ноды по ID → парсинг subtree) — FR-010
- [X] T060 [US4] Обновить CLI `src/cli.ts`: добавить опции --page/-p (имя страницы) и --node/-n (node ID), передача в ParseContext
- [X] T061 [US4] Обновить pipeline fetch `src/pipeline/fetch.ts`: передать page/node фильтры в API-запрос (depth parameter для оптимизации больших файлов)

**Checkpoint**: Все 4 user stories функциональны и независимо тестируемы

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, производительность, финальная валидация

- [X] T062 Добавить обработку edge cases в `src/pipeline/parse.ts`: пустой файл → warning + пустые токены; неизвестный тип ноды → warning с node_id; opacity 0 → пропуск в цветах, включение в компоненты
- [X] T063 Добавить прогресс-вывод в `src/pipeline/parse.ts` и `src/pipeline/transform.ts`: количество обработанных нод / общее, вывод в stderr
- [X] T064 [P] Добавить обработку больших файлов в `src/api/client.ts`: при > 10 000 нод — предложение использовать --page или --node для фильтрации (warning в stderr)
- [X] T065 [P] Финальная сводка в stdout (согласно contracts/cli-interface.md): имя файла, количество токенов по категориям, путь к output, время выполнения
- [X] T066 Добавить exit codes в `src/cli.ts` согласно контракту: 0 (успех), 1 (ошибка аргументов), 2 (ошибка API), 3 (ошибка записи)
- [X] T067 [P] Написать integration-тест полного пайплайна: `tests/integration/pipeline.test.ts` — обновить для проверки всех output файлов (10 файлов + images/) на фикстуре simple-file.json
- [X] T068 Валидация по quickstart.md: ручной прогон quickstart сценария на реальном Figma-файле, проверка корректности вывода
- [X] T069 [P] Написать performance-тест в `tests/integration/performance.test.ts`: сгенерировать фикстуру с 5000+ нодами, измерить время parse + extract (без API-вызова) — MUST < 30 секунд (SC-004)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Нет зависимостей — можно начинать сразу
- **Foundational (Phase 2)**: Зависит от Setup — БЛОКИРУЕТ все user stories
- **US1 (Phase 3)**: Зависит от Foundational — БЛОКИРУЕТ US2, US3 (т.к. writers и pipeline переиспользуются)
- **US2 (Phase 4)**: Зависит от US1 (использует pipeline и writers)
- **US3 (Phase 5)**: Зависит от US1 (использует AllTokens), может идти параллельно с US2
- **US4 (Phase 6)**: Зависит от US1 (использует API client и parser), может идти параллельно с US2/US3
- **Polish (Phase 7)**: Зависит от всех user stories

### User Story Dependencies

- **US1 (P1)**: Начинается после Phase 2 — основа для всего
- **US2 (P2)**: Начинается после US1 — добавляет extractors/components.ts и обновляет pipeline
- **US3 (P3)**: Начинается после US1 — может параллельно с US2 (отдельный writer)
- **US4 (P3)**: Начинается после US1 — может параллельно с US2/US3 (обновления API client и parser)

### Within Each User Story

- Тесты MUST быть написаны и FAIL до реализации
- Экстракторы → Writers → Pipeline integration
- Фикстуры → Unit-тесты → Реализация → Snapshot-тесты

### Parallel Opportunities

- Phase 1: T003, T004, T006 параллельно
- Phase 2: T010, T011, T012 параллельно; T013, T014, T015 параллельно
- Phase 3: T018-T025 (все unit-тесты) параллельно; T026-T032 (все экстракторы) параллельно
- Phase 4+5+6: US3 и US4 могут идти параллельно после US1

---

## Parallel Example: User Story 1

```bash
# Все тесты US1 параллельно (разные файлы):
Task: "Unit-тест colors в tests/unit/extractors/colors.test.ts"
Task: "Unit-тест gradients в tests/unit/extractors/gradients.test.ts"
Task: "Unit-тест typography в tests/unit/extractors/typography.test.ts"
Task: "Unit-тест spacing в tests/unit/extractors/spacing.test.ts"
Task: "Unit-тест radius в tests/unit/extractors/radius.test.ts"
Task: "Unit-тест shadows в tests/unit/extractors/shadows.test.ts"

# Все экстракторы US1 параллельно (разные файлы):
Task: "Экстрактор цветов в src/extractors/colors.ts"
Task: "Экстрактор градиентов в src/extractors/gradients.ts"
Task: "Экстрактор типографики в src/extractors/typography.ts"
Task: "Экстрактор spacing в src/extractors/spacing.ts"
Task: "Экстрактор radius в src/extractors/radius.ts"
Task: "Экстрактор теней в src/extractors/shadows.ts"
Task: "Экстрактор изображений в src/extractors/images.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational (CRITICAL — блокирует всё)
3. Phase 3: User Story 1 (извлечение токенов)
4. **STOP и VALIDATE**: `figma-scaler parse <fileId>` → проверить colors.json, design-system.css
5. MVP готов к использованию

### Incremental Delivery

1. Setup + Foundational → фундамент готов
2. US1: Дизайн-токены → JSON + CSS (MVP!)
3. US2: Компоненты с layout → components.json
4. US3: AI-контекст → CONTEXT.md
5. US4: Фильтрация → --page/--node
6. Polish → edge cases, прогресс, exit codes

---

## Notes

- [P] задачи = разные файлы, нет зависимостей
- [Story] маппинг задачи к конкретной user story
- Каждая user story независимо тестируема
- Тесты пишутся и FAIL до реализации (конституция Принцип IV)
- Коммит после каждой задачи или логической группы
- Остановка на любом checkpoint для независимой валидации story
