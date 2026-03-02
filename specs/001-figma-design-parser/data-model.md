# Data Model: Figma Design Parser

**Branch**: `001-figma-design-parser` | **Date**: 2026-02-27

## Сущности

### ParseContext

Контекст запуска парсера. Неизменяемый после создания.

| Поле | Тип | Описание |
|------|-----|----------|
| file_id | string | Figma file ID (из URL или аргумента) |
| token | string | Figma Personal Access Token |
| output_dir | string | Директория для выходных файлов |
| page_filter | string? | Имя или ID страницы для фильтрации |
| node_filter | string? | Node ID для парсинга конкретной секции |
| include_hidden | boolean | Включать скрытые слои (default: false) |
| depth | number? | Ограничение глубины API-запроса |

### FigmaFile

Представление загруженного Figma-файла.

| Поле | Тип | Описание |
|------|-----|----------|
| file_id | string | ID файла |
| name | string | Имя файла в Figma |
| last_modified | string | ISO 8601 дата последнего изменения |
| version | string | Версия файла |
| document | Node | Корневая нода (type: DOCUMENT) |
| components | Map<id, ComponentMeta> | Метаданные компонентов |
| component_sets | Map<id, ComponentSetMeta> | Метаданные наборов компонентов |
| styles | Map<id, StyleMeta> | Метаданные именованных стилей |

### ParsedNode

Плоское представление ноды после обхода дерева.

| Поле | Тип | Описание |
|------|-----|----------|
| node_id | string | Figma node ID (формат "1:23") |
| node_type | string | Тип ноды (FRAME, TEXT, и т.д.) |
| name | string | Имя ноды в Figma |
| parent_id | string? | ID родительской ноды (null для root) |
| depth | number | Глубина вложенности (0 = root) |
| raw | Node | Сырой объект ноды из API |

### ColorToken

Извлечённый цветовой токен.

| Поле | Тип | Описание |
|------|-----|----------|
| name | string | Авто-сгенерированное имя (hue + lightness) |
| node_id | string | ID ноды-источника |
| source_type | "fill" \| "stroke" | Откуда извлечён цвет |
| value_hex | string | Значение в формате #RRGGBB или #RRGGBBAA |
| value_rgba | {r,g,b,a} | Значение в 0-255 диапазоне (a: 0-1) |
| opacity | number | Opacity fills (0-1) |
| usage_count | number | Количество использований в файле |
| used_in_types | Set<string> | Типы нод, где используется |

### GradientToken

Извлечённый градиентный токен.

| Поле | Тип | Описание |
|------|-----|----------|
| name | string | Авто-сгенерированное имя |
| node_id | string | ID ноды-источника |
| gradient_type | string | LINEAR, RADIAL, ANGULAR, DIAMOND |
| stops | GradientStop[] | Остановки градиента |
| handle_positions | Vector[] | Контрольные точки |

### GradientStop

| Поле | Тип | Описание |
|------|-----|----------|
| position | number | Позиция 0-1 |
| color_hex | string | Цвет в hex |
| color_rgba | {r,g,b,a} | Цвет в RGBA |

### TypographyToken

Извлечённый типографический токен.

| Поле | Тип | Описание |
|------|-----|----------|
| name | string | Авто-сгенерированное имя (family-size-weight) |
| node_id | string | ID ноды-источника |
| font_family | string | Название шрифта |
| font_size | number | Размер в пикселях |
| font_weight | number | Вес (100-900) |
| font_style | "normal" \| "italic" | Стиль шрифта |
| line_height | string | Высота строки (px, %, или "auto") |
| line_height_px | number? | Высота строки в пикселях |
| letter_spacing | number | Межбуквенное расстояние в px |
| text_align_horizontal | string | LEFT, RIGHT, CENTER, JUSTIFIED |
| text_case | string | ORIGINAL, UPPER, LOWER, TITLE |
| text_decoration | string | NONE, UNDERLINE, STRIKETHROUGH |
| sample_text | string | Первые 50 символов текста |
| usage_count | number | Количество использований |

### SpacingToken

Извлечённый токен отступов.

| Поле | Тип | Описание |
|------|-----|----------|
| value | number | Значение в пикселях |
| source | string | Откуда: padding, item_spacing, counter_axis |
| usage_count | number | Количество использований |

### RadiusToken

Извлечённый токен border-radius.

| Поле | Тип | Описание |
|------|-----|----------|
| value | number | Значение в пикселях |
| is_per_corner | boolean | Ли это отдельный угол |
| usage_count | number | Количество использований |

### ShadowToken

Извлечённый токен тени.

| Поле | Тип | Описание |
|------|-----|----------|
| name | string | Авто-сгенерированное имя |
| node_id | string | ID ноды-источника |
| shadow_type | "DROP_SHADOW" \| "INNER_SHADOW" | Тип тени |
| offset_x | number | Смещение X в px |
| offset_y | number | Смещение Y в px |
| blur | number | Радиус размытия в px |
| spread | number | Радиус распространения в px |
| color_hex | string | Цвет тени в hex |
| color_rgba | {r,g,b,a} | Цвет тени в RGBA |
| css | string | Готовое CSS-значение |

### ImageToken

Извлечённый токен изображения (IMAGE fill).

| Поле | Тип | Описание |
|------|-----|----------|
| node_id | string | ID ноды-источника |
| image_ref | string | Figma imageRef хэш |
| scale_mode | string | FILL, FIT, CROP, TILE |
| file_name | string | Имя файла (node_id с `:` → `-`, + `.png`) |
| downloaded | boolean | Скачано ли изображение |

### ComponentInfo

Извлечённая информация о компоненте.

| Поле | Тип | Описание |
|------|-----|----------|
| node_id | string | Figma node ID |
| name | string | Имя компонента |
| component_type | "COMPONENT" \| "COMPONENT_SET" | Тип |
| width | number | Ширина в px |
| height | number | Высота в px |
| description | string | Описание из Figma |
| layout_mode | string? | HORIZONTAL, VERTICAL, или null |
| layout_direction | string? | Направление auto-layout |
| padding | {top,right,bottom,left} | Отступы |
| item_spacing | number? | Промежуток между дочерними |
| counter_axis_spacing | number? | Промежуток поперёк оси |
| primary_axis_align | string? | MIN, CENTER, MAX, SPACE_BETWEEN |
| counter_axis_align | string? | MIN, CENTER, MAX, BASELINE |
| layout_wrap | string? | NO_WRAP, WRAP |
| clips_content | boolean | Обрезает содержимое |
| corner_radius | number? | Единый border-radius |
| corner_radii | number[]? | Радиусы по углам [TL,TR,BR,BL] |
| variants | VariantInfo[]? | Варианты (только для COMPONENT_SET) |
| children | ComponentChild[] | Дочерние ноды (упрощённые) |

### VariantInfo

Информация о варианте компонента.

| Поле | Тип | Описание |
|------|-----|----------|
| node_id | string | ID ноды варианта |
| name | string | Полное имя: "Size=S, State=Default" |
| properties | Map<string, string> | Разобранные свойства |
| width | number | Ширина |
| height | number | Высота |

### ComponentChild

Упрощённое представление дочерней ноды компонента.

| Поле | Тип | Описание |
|------|-----|----------|
| node_id | string | Figma node ID |
| node_type | string | Тип ноды |
| name | string | Имя ноды |
| children | ComponentChild[]? | Вложенные ноды |

### AllTokens

Агрегированный набор всех извлечённых токенов.

| Поле | Тип | Описание |
|------|-----|----------|
| colors | ColorToken[] | Отсортированы по usage_count desc |
| gradients | GradientToken[] | Все градиенты |
| typography | TypographyToken[] | Отсортированы по usage_count desc |
| spacing | SpacingToken[] | Отсортированы по value asc |
| radii | RadiusToken[] | Отсортированы по value asc |
| shadows | ShadowToken[] | Все тени |
| images | ImageToken[] | Все IMAGE fills |
| components | ComponentInfo[] | Все компоненты |

### OutputManifest

Метаданные о генерации.

| Поле | Тип | Описание |
|------|-----|----------|
| file_id | string | Исходный Figma file ID |
| file_name | string | Имя файла в Figma |
| generated_at | string | ISO 8601 timestamp |
| node_count | number | Общее количество обработанных нод |
| filters_applied | object | Какие фильтры были применены |
| token_counts | object | Количество токенов по категориям |

## Связи между сущностями

```
ParseContext → (fetch) → FigmaFile
FigmaFile.document → (parse) → ParsedNode[]
ParsedNode[] → (extract) → AllTokens
  ├── ColorToken[]
  ├── GradientToken[]
  ├── TypographyToken[]
  ├── SpacingToken[]
  ├── RadiusToken[]
  ├── ShadowToken[]
  ├── ImageToken[]
  └── ComponentInfo[]
       └── VariantInfo[]
AllTokens → (write) → OutputFiles
  ├── colors.json
  ├── typography.json
  ├── spacing.json
  ├── border-radius.json
  ├── shadows.json
  ├── gradients.json
  ├── components.json
  ├── design-system.css
  └── CONTEXT.md
```

## Валидационные правила

1. **ColorToken.value_rgba**: r,g,b — целые 0-255; a — float 0-1.
2. **TypographyToken.font_weight**: кратно 100, диапазон 100-900.
3. **SpacingToken.value**: >= 0 (отрицательные item_spacing возможны
   в Figma, но фильтруются).
4. **RadiusToken.value**: >= 0.
5. **ComponentInfo.variants**: непусто ONLY если component_type
   === "COMPONENT_SET".
6. **Все токены**: node_id MUST быть непустой строкой формата "N:N".

## Состояния пайплайна

```
IDLE → FETCHING → PARSING → EXTRACTING → WRITING → DONE
                                                  → ERROR (на любом этапе)
```

При переходе в ERROR сохраняется: этап, node_id (если доступен),
сообщение об ошибке. Парсинг продолжается для оставшихся нод,
ошибки аккумулируются.
