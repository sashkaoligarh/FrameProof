# Research: Figma Design Parser

**Branch**: `001-figma-design-parser` | **Date**: 2026-02-27

## R-001: Язык и рантайм

**Решение**: TypeScript (strict mode), ESM, Node.js >= 20

**Обоснование**: Figma REST API имеет 60+ типов нод с сотнями свойств.
Без статической типизации silent data loss (нарушение Принципа III
конституции) становится невидимым при разработке. Официальный пакет
`@figma/rest-api-spec` предоставляет TypeScript-типы, сгенерированные
из OpenAPI-спецификации Figma — это обеспечивает точное соответствие
между ожиданиями парсера и реальным API.

**Альтернативы**:
- Plain JavaScript (CJS): проще старт, но нет type safety для
  сложной модели данных Figma. Существующий `figma-extract.cjs`
  демонстрирует проблему — неявные допущения о форме данных.
- Deno/Bun: хорошие рантаймы, но Node.js 20 — наиболее стабильный
  и совместимый выбор для CLI-утилиты.

## R-002: HTTP-клиент

**Решение**: Встроенный `fetch` (Node.js 20, stable)

**Обоснование**: `fetch` в Node 20 стабилен (не экспериментальный),
под капотом использует `undici`. Для единственного API (Figma REST)
разница в производительности между `fetch` и raw `undici` несущественна.
Поддерживает `AbortSignal.timeout()` из коробки.

**Альтернативы**:
- `axios`: +30 KB, решает проблемы, которых нет (auto-JSON parsing —
  одна строка с `fetch`).
- `got`/`undici`: отличные, но лишняя зависимость.

## R-003: CLI-парсинг аргументов

**Решение**: `commander`

**Обоснование**: Поддержка подкоманд, автогенерация `--help`,
валидация — всё в 1 зависимости. `node:parseArgs` — слишком
примитивен для нужного интерфейса (подкоманды, обязательные опции).

**Альтернативы**:
- `yargs`: тянет 7+ транзитивных зависимостей.
- `node:parseArgs`: нет подкоманд, нет авто-`--help`.

## R-004: Тестирование

**Решение**: `vitest`

**Обоснование**: `toMatchFileSnapshot()` — идеальный инструмент
для тестирования парсера: сохраняет ожидаемые CSS/JSON/MD файлы
как реальные файлы (не escaped-строки в `.snap`). Нативная поддержка
TypeScript и ESM без конфигурации.

**Альтернативы**:
- Jest: ESM-поддержка всё ещё требует `--experimental-vm-modules`.
- `node:test`: нет snapshot-тестирования, нет watch-mode уровня vitest.

## R-005: Figma REST API — ключевые особенности

**Решение**: Использовать `GET /v1/files/:key` с `depth` параметром
и `GET /v1/files/:key/nodes?ids=X` для фильтрации по нодам.

**Ключевые находки**:

1. **Типы нод**: DOCUMENT, CANVAS, FRAME, GROUP, SECTION, VECTOR,
   BOOLEAN_OPERATION, STAR, LINE, ELLIPSE, REGULAR_POLYGON,
   RECTANGLE, TEXT, COMPONENT, COMPONENT_SET, INSTANCE, SLICE,
   TABLE, TABLE_CELL, STICKY, SHAPE_WITH_TEXT, CONNECTOR, WASHI_TAPE,
   EMBED, LINK_UNFURL, WIDGET.

2. **Rate limits (Tier 1 — самый строгий)**:
   - View/Collab seat: 6 запросов/месяц
   - Dev/Full Starter: 10/мин
   - Dev/Full Professional: 15/мин
   - Dev/Full Organization: 20/мин
   - При 429: читать заголовок `Retry-After` и ждать.

3. **Пагинации нет**: API возвращает весь файл за один запрос.
   Для больших файлов — использовать `depth` параметр + `ids`
   для батчирования.

4. **Variants**: REST API НЕ возвращает `variantProperties` на
   COMPONENT нодах (это только Plugin API). Нужно парсить поле
   `name` дочерних COMPONENT нод: `"Size=Large, State=Default"`.
   Схема вариантов — в `componentPropertyDefinitions` на
   COMPONENT_SET.

5. **Variables API (дизайн-токены)**: Доступен только на Enterprise
   плане. Предусмотреть graceful degradation — если API недоступен,
   парсить токены из нод напрямую.

6. **Typography**: REST API возвращает `letterSpacing` как число
   (пиксели), не объект. `lineHeightUnit: 'INTRINSIC_%'` означает
   "auto" в UI. `characterStyleOverrides` + `styleOverrideTable` —
   механизм per-character стилей.

7. **Fills**: `EMOJI` тип НЕ существует в REST API (только Plugin
   API). Типы: SOLID, GRADIENT_LINEAR, GRADIENT_RADIAL,
   GRADIENT_ANGULAR, GRADIENT_DIAMOND, IMAGE.

## R-006: Формат вывода JSON

**Решение**: W3C Design Tokens Community Group (DTCG) формат

**Обоснование**: Спецификация стабилизировалась в версии 2025.10.
Поддерживается Tokens Studio, Style Dictionary, Figma Tokens.
Ключевые правила: `$value`, `$type`, `$description` с $ prefix.

**Альтернативы**:
- Кастомный JSON: менее интероперабельный.
- Tokens Studio формат: привязан к одному инструменту.

## R-007: Стратегия обхода дерева

**Решение**: Итеративный DFS с явным стеком (не рекурсия)

**Обоснование**: Файлы с 5000+ нодами могут создать глубокий
стек вызовов. Итеративный подход с массивом-стеком безопасен
при любой глубине вложенности.

## R-008: Архитектура пайплайна

**Решение**: 4-стадийный пайплайн из чистых функций

```
fetch → parse → extract → write
```

- **fetch**: HTTP-запрос к Figma API → сырой JSON
- **parse**: обход дерева → плоский массив ParsedNode[]
- **extract**: ParsedNode[] → типизированные наборы токенов
  (по категориям: colors, typography, spacing, и т.д.)
- **write**: токены → файлы (CSS, JSON, Markdown)

Каждая стадия — чистая функция. Одинаковый вход → одинаковый
выход (Принцип V: детерминированность).
