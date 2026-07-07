# Figma Scaler — Руководство по использованию

## Сводная таблица: все параметры всех MCP-инструментов

Общий параметр для всех инструментов — `file_id` (ID файла Figma или полный URL).

| Параметр | Тип | Где используется | Описание |
|----------|-----|-----------------|----------|
| `file_id` | `string` | Figma read/write и pixel-perfect инструменты | ID файла Figma или полный URL. Из URL автоматически извлекается file_id и node_id |
| `node_id` | `string?` | `get_node_info`, `get_nodes_info`, `export_node_image`, `get_screenshot`, `get_frame_overview`, `batch_screenshots`, `export_page_analysis` | ID ноды. Автоматически извлекается из URL, если не указан явно. Формат: `8077:4170` или `8077-4170` |
| `node_ids` | `string[]` | `get_nodes_info` | Массив ID нод для пакетного запроса |
| `page` | `string?` | `get_design_tokens` | Фильтр по имени страницы |
| `format` | `string?` | `export_node_image` (`svg\|png\|jpg\|pdf`, дефолт `png`), `export_page_analysis` (`markdown\|json`, дефолт `markdown`) | Формат вывода |
| `scale` | `number?` | `export_node_image`, `get_screenshot`, `batch_screenshots` | Масштаб для растровых форматов: 1-4 (дефолт `1`) |
| `depth` | `number?` | `get_node_info` (дефолт `5`), `get_nodes_info` (дефолт `3`) | Максимальная глубина обхода дочерних нод |
| `section_depth` | `number?` | `export_page_analysis` (дефолт `4`) | Глубина анализа секций |
| `output_dir` | `string?` | `export_node_image`, `get_screenshot`, `batch_screenshots` | Директория для сохранения файлов (дефолт `.figma`) |
| `output_path` | `string?` | `export_page_analysis` | Путь выходного файла (дефолт `.figma/page-analysis.md`) |
| `save_to` | `string?` | `get_design_tokens`, `get_node_info`, `get_nodes_info`, `get_css_variables` | Сохранить результат в файл, вернуть краткую сводку вместо полных данных |
| `compress` | `boolean?` | `export_node_image`, `get_screenshot`, `batch_screenshots` | Сжать через TinyJPG API. Требует `TINYJPG_TOKEN`. Дефолт `false` |
| `force_refresh` | `boolean?` | `get_design_tokens` | Обойти кэш (дефолт `false`) |
| `include_hidden` | `boolean?` | `batch_screenshots` | Включить скрытые дочерние элементы (дефолт `false`) |
| `categories` | `string[]?` | `get_design_tokens` | Категории токенов: `colors`, `gradients`, `typography`, `spacing`, `radii`, `shadows`, `images`, `components`. По умолчанию все кроме `components` и `images` |
| `query` | `string` | `search_token` | Значение для поиска: hex-цвет, число, имя шрифта |
| `category` | `string?` | `search_token` | Фильтр категории: `color`, `typography`, `spacing`, `radius`, `shadow`, `all` (дефолт `all`) |
| `max_response_chars` | `number?` | `get_node_info` (дефолт `20000`), `get_nodes_info` | Макс. размер ответа в символах. Обрезается при превышении |
| `deduplicate_styles` | `boolean?` | `get_node_info`, `get_nodes_info` | Заменить повторяющиеся fills/strokes хэш-ссылками для уменьшения размера (дефолт `false`) |

### Какой инструмент поддерживает какие параметры

```
                          file_id  node_id  scale  compress  save_to  depth  format  output_dir
get_design_tokens            *                                  *
get_node_info                *       *                          *       *
get_nodes_info               *      []*                         *       *
get_css_variables             *                                  *
export_node_image             *       *       *       *                         *       *
get_document_structure        *
get_design_context            *
search_token                  *
get_screenshot                *       *       *       *                                 *
get_frame_overview            *       *
batch_screenshots             *       *       *       *                                 *
export_page_analysis          *       *                                         *
pixel_perfect_orchestrator    *       *
```

---

## Переменные окружения

| Переменная | Обязательная | Описание |
|------------|-------------|----------|
| `FIGMA_TOKEN` | Да | Персональный токен доступа: https://www.figma.com/developers/api#access-tokens |
| `TINYJPG_TOKEN` | Нет | Токен TinyJPG API для сжатия изображений: https://tinypng.com/developers |

---

## CLI (командная строка)

```bash
figma-scaler parse <fileIdOrUrl> [опции]
```

### Опции

| Флаг | По умолчанию | Описание |
|------|-------------|----------|
| `-t, --token <token>` | `$FIGMA_TOKEN` | Токен Figma API |
| `-o, --output <dir>` | `./figma-output` | Директория для результатов |
| `-f, --format <format>` | `all` | Формат вывода: `all`, `json`, `css`, `context` |
| `-p, --page <name>` | — | Фильтр по имени страницы |
| `-n, --node <id>` | — | Фильтр по ID ноды |
| `--include-hidden` | `false` | Включить скрытые слои |
| `--export-images` | `false` | Скачать изображения |
| `--image-format <formats>` | `svg,png` | Форматы через запятую: `svg`, `png`, `jpg`, `pdf` |
| `--image-scale <scale>` | `1` | Масштаб для растровых форматов (1-4) |
| `--compress` | `false` | Сжать растровые изображения через TinyJPG API |

Когда `--compress` включён и `--image-scale` не указан явно, масштаб автоматически устанавливается в **2x**.

### Примеры

```bash
# Извлечь токены
figma-scaler parse https://www.figma.com/design/ABC123/MyDesign

# Экспорт изображений со сжатием
figma-scaler parse ABC123 --export-images --image-format jpg --compress

# Фильтр по странице, включая скрытые слои
figma-scaler parse ABC123 --page "Mobile" --include-hidden --format json
```

### Strict visual gate

```bash
figma-scaler gate \
  --page-url "http://localhost:3000/pricing" \
  --selector ".pricing-hero" \
  --figma-url "https://www.figma.com/design/FILE/Name?node-id=1-2" \
  --real-flow \
  --fail-on-review
```

`gate` сохраняет live/Figma screenshots, DOM-отчёты, diff PNG, `REPORT.md` и `summary.json` в `.pixel-perfect/figma-gate/`. Финальное закрытие pixel-perfect задач должно использовать `--real-flow --fail-on-review`.

### Коды выхода

| Код | Значение |
|-----|----------|
| `0` | Успех |
| `1` | Общая ошибка |
| `2` | Ошибка Figma API |
| `3` | Ошибка файловой системы |

---

## MCP-сервер

### Запуск

```bash
npm run build:mcp
npm run mcp:start
```

Транспорт: **stdio** (stdout = MCP-сообщения, stderr = логи)

---

## MCP-инструменты (13 штук)

### 1. `get_design_tokens`

Извлечь дизайн-токены из файла Figma.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла Figma или полный URL |
| `page` | `string?` | — | Фильтр по имени страницы |
| `node_id` | `string?` | — | Фильтр по ID ноды |
| `force_refresh` | `boolean?` | `false` | Обойти кэш |
| `categories` | `string[]?` | все кроме `components`, `images` | Категории: `colors`, `gradients`, `typography`, `spacing`, `radii`, `shadows`, `images`, `components` |
| `save_to` | `string?` | — | Сохранить JSON в файл, вернуть краткую сводку |

---

### 2. `get_node_info`

Подробная информация о ноде: CSS-маппинги, constraints, стили, token hints.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL (node-id извлекается из URL автоматически) |
| `node_id` | `string?` | — | ID целевой ноды (`8077:4170` или `8077-4170`) |
| `depth` | `number?` | `5` | Максимальная глубина потомков |
| `max_response_chars` | `number?` | `20000` | Макс. размер ответа в символах; обрезается при превышении |
| `deduplicate_styles` | `boolean?` | `false` | Заменить повторяющиеся fills/strokes хэш-ссылками |
| `save_to` | `string?` | — | Сохранить JSON в файл, вернуть краткую сводку |

---

### 3. `get_nodes_info`

Пакетная версия `get_node_info` для нескольких нод.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |
| `node_ids` | `string[]` | — | Массив ID нод |
| `depth` | `number?` | `3` | Максимальная глубина потомков |
| `max_response_chars` | `number?` | — | Макс. размер ответа |
| `deduplicate_styles` | `boolean?` | `false` | Дедупликация стилей |
| `save_to` | `string?` | — | Сохранить JSON в файл |

---

### 4. `get_css_variables`

Сгенерировать CSS Custom Properties из дизайн-токенов.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |
| `save_to` | `string?` | — | Путь для сохранения CSS (напр. `.figma/design-system.css`) |

---

### 5. `export_node_image`

Экспорт ноды как изображения (SVG, PNG, JPG или PDF).

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |
| `node_id` | `string?` | — | Нода для экспорта (извлекается из URL) |
| `format` | `svg \| png \| jpg \| pdf` | `png` | Формат изображения |
| `scale` | `number?` | `1` | Масштаб для растровых форматов (1-4) |
| `output_dir` | `string?` | `.figma` | Директория для сохранения |
| `compress` | `boolean?` | `false` | Сжать через TinyJPG (нужен `TINYJPG_TOKEN`) |

**Ответ** включает `compression?: CompressionResult` при сжатии, `warning?` если токен отсутствует.

---

### 6. `get_document_structure`

Обзор файла Figma: страницы, фреймы верхнего уровня, количество компонентов.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |

---

### 7. `get_design_context`

Оптимизированная для AI сводка дизайн-системы в формате markdown.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |

---

### 8. `search_token`

Поиск дизайн-токенов по значению (hex-цвет, число, имя шрифта).

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |
| `query` | `string` | — | Значение для поиска (`#FF0000`, `16`, `Inter`) |
| `category` | `string?` | `all` | Фильтр: `color`, `typography`, `spacing`, `radius`, `shadow`, `all` |

Возвращает до 5 ближайших совпадений, отсортированных по дистанции.

---

### 9. `get_screenshot`

Скриншот фрейма со структурной сводкой.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |
| `node_id` | `string?` | — | Нода для скриншота (извлекается из URL) |
| `scale` | `number?` | `1` | Масштаб экспорта (1-4) |
| `output_dir` | `string?` | `.figma` | Директория для сохранения |
| `compress` | `boolean?` | `false` | Сжать через TinyJPG (нужен `TINYJPG_TOKEN`) |

**Ответ** включает структурную сводку: `node_name`, `node_type`, размеры, `child_count`, `layout_mode`, `dominant_fills`.

---

### 10. `get_frame_overview`

Легковесный обзор дочерних элементов фрейма: имена, типы, размеры, отступы, ссылки на компоненты.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |
| `node_id` | `string?` | — | Родительский фрейм (извлекается из URL) |

**Ответ на каждый дочерний элемент**: `node_id`, `name`, `node_type`, размеры (width, height, x, y), `visible`, `has_auto_layout`, `layout_mode`, `has_fills`, `has_images`, `has_gradients`, `has_text`, `text_preview`, `is_component_instance`, `main_component_name`, `position` (absolute/relative), `overflow` (hidden/visible), `opacity`, `gap_to_next` (отступ до следующего соседа в px).

---

### 11. `batch_screenshots`

Скриншоты всех прямых потомков фрейма за один вызов.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |
| `node_id` | `string?` | — | Родительский фрейм (извлекается из URL) |
| `scale` | `number?` | `1` | Масштаб экспорта (1-4) |
| `output_dir` | `string?` | `.figma` | Директория для сохранения |
| `include_hidden` | `boolean?` | `false` | Включить скрытые потомки |
| `compress` | `boolean?` | `false` | Сжать через TinyJPG (нужен `TINYJPG_TOKEN`) |

**Ответ** включает `compression_stats?: CompressionStats` — общая статистика сжатия по всем скриншотам.

---

### 12. `export_page_analysis`

Полный анализ страницы, сохранённый в файл (markdown или JSON). Включает CSS-маппинги и дизайн-заметки.

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `file_id` | `string` | — | ID файла или URL |
| `node_id` | `string?` | — | Корневой фрейм (извлекается из URL) |
| `output_path` | `string?` | `.figma/page-analysis.md` | Путь выходного файла |
| `format` | `markdown \| json` | `markdown` | Формат вывода |
| `section_depth` | `number?` | `4` | Глубина анализа секций |

**Категории дизайн-заметок**:

| Категория | Описание |
|-----------|----------|
| `HIDDEN` | Проблемы с видимостью секций |
| `IMAGE_FILL` | Фоновые изображения с позиционированием |
| `MIXED_TEXT_COLOR` | Многоцветный текст, требующий `<span>` |
| `ABSOLUTE_ELEMENT` | Абсолютно позиционированные декоративные элементы |
| `COMPONENT_INSTANCE` | Ссылки на экземпляры компонентов |
| `LOW_OPACITY` | Полупрозрачные декоративные элементы |
| `BLEND_MODE` | Режимы наложения |
| `CLIPPED_CONTENT` | Overflow hidden с обрезкой |
| `NON_STANDARD_VALUE` | Несовпадение с токенами |
| `INCONSISTENT_RADIUS` | Неравномерный border-radius |
| `ORPHAN_COLOR` | Цвета без соответствия токенам |
| `TEXT_OVERFLOW` | Обнаружение переполнения текста |
| `MISSING_AUTO_LAYOUT` | Выровненные потомки без auto-layout |

---

## MCP-промпты (3 штуки)

### `layout_strategy`

Правила для pixel-perfect вёрстки по дизайн-токенам Figma. Покрывает: flexbox/grid, синтаксис CSS-переменных, padding/gap/radius/shadows, fills, градиенты, фоновые изображения, типографику, constraints, обводки, эффекты, экземпляры компонентов, token hints.

### `read_design_strategy`

Трёхфазный воркфлоу чтения дизайна из Figma:
1. **Обзор**: `get_screenshot` + `get_document_structure` + `get_design_tokens` + `get_css_variables` + `get_frame_overview`
2. **Посекционный анализ**: `batch_screenshots` + `get_node_info` по каждой секции
3. **Полная страница**: `export_page_analysis` (альтернатива фазе 2)

### `token_usage_rules`

Правила использования дизайн-токенов в коде. Никогда не хардкодить цвета/шрифты/отступы. Всегда использовать CSS custom properties из `.figma/design-system.css`.

---

## MCP-ресурс

### `figma://tokens/{file_id}`

Динамический ресурс для доступа к закэшированным дизайн-токенам в формате JSON. Файл должен быть предварительно загружен через `get_design_tokens`.

---

## Типичные сценарии работы

### 1. Сверстать дизайн с нуля

```
get_document_structure → понять структуру страниц/фреймов
get_design_tokens(save_to: ".figma/tokens.json") → извлечь токены
get_css_variables(save_to: ".figma/design-system.css") → сгенерировать CSS-переменные
get_screenshot(node_id: "frame-id") → визуальная референция
get_frame_overview(node_id: "frame-id") → понять структуру фрейма
batch_screenshots(node_id: "frame-id") → скриншоты всех секций
get_node_info(node_id: "section-id", save_to: ".figma/section.json") → детальный CSS
```

### 2. Экспорт и сжатие изображений

```
export_node_image(node_id: "...", format: "jpg", scale: 2, compress: true)
batch_screenshots(node_id: "...", compress: true)
```

### 3. Найти значение токена

```
search_token(query: "#3B82F6", category: "color")
search_token(query: "Inter", category: "typography")
search_token(query: "16", category: "spacing")
```

---

## Сжатие изображений (TinyJPG)

### CompressionResult — результат сжатия одного изображения

```typescript
{
  success: boolean        // Успешно ли сжатие
  original_size: number   // Исходный размер в байтах
  compressed_size: number // Сжатый размер (= исходному при ошибке)
  savings_percent: number // Процент экономии (0 при ошибке)
  error?: string          // Сообщение об ошибке
}
```

### CompressionStats — статистика пакетного сжатия

```typescript
{
  total_images: number            // Всего кандидатов на сжатие
  compressed_count: number        // Успешно сжато
  failed_count: number            // Не удалось (сохранены оригиналы)
  total_original_bytes: number    // Сумма исходных размеров
  total_compressed_bytes: number  // Сумма сжатых размеров
  total_savings_percent: number   // Общий процент экономии
  monthly_compression_count?: number // Использовано компрессий за месяц
}
```

### Обработка ошибок

| Ситуация | Поведение |
|----------|----------|
| `TINYJPG_TOKEN` не задан | Логируется предупреждение, изображения сохраняются без сжатия |
| 401 — невалидный ключ | Сохраняется оригинал, логируется ошибка авторизации |
| 429 — превышен лимит | Сохраняется оригинал, логируется предупреждение о rate limit |
| 400/413 — слишком большой файл | Сохраняется оригинал, логируется предупреждение о размере |
| 5xx — ошибка сервера | Сохраняется оригинал, логируется ошибка сервера |
| Таймаут сети | Сохраняется оригинал, логируется предупреждение о таймауте |

Сжатие **никогда** не блокирует пайплайн. Любая ошибка приводит к сохранению оригинального файла.
