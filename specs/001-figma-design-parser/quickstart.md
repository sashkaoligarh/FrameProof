# Quickstart: Figma Design Parser

## Предусловия

1. Node.js >= 20
2. Figma Personal Access Token (Settings → Account → Personal Access Tokens)
3. Figma file ID (из URL: `figma.com/file/<FILE_ID>/...`)

## Установка

```bash
# Клонирование и установка
git clone <repo-url> figma-scaler
cd figma-scaler
npm install

# Сборка
npm run build
```

## Быстрый старт

```bash
# Установить токен (рекомендуется через env)
export FIGMA_TOKEN=figd_your_token_here

# Парсинг файла
npx figma-scaler parse YOUR_FILE_ID

# Результат в ./figma-tokens/
ls ./figma-tokens/
# colors.json  typography.json  spacing.json  border-radius.json
# shadows.json  gradients.json  components.json  design-system.css
# CONTEXT.md  manifest.json
```

## Использование с AI-ассистентом

1. Скопировать `CONTEXT.md` в корень проекта (или добавить в CLAUDE.md):

```bash
cp ./figma-tokens/CONTEXT.md ./CLAUDE.md
```

2. Импортировать CSS-токены в глобальные стили:

```css
@import './figma-tokens/design-system.css';
```

3. AI-ассистент будет использовать CSS-переменные вместо хардкода:

```css
/* Вместо: color: #2563eb; */
color: var(--color-primary-500);

/* Вместо: padding: 16px; */
padding: var(--spacing-16);
```

## Парсинг конкретной страницы

```bash
# По имени страницы
npx figma-scaler parse YOUR_FILE_ID --page "Design System"

# По node ID
npx figma-scaler parse YOUR_FILE_ID --node "1:23"
```

## Разработка

```bash
# Запуск тестов
npm test

# Проверка типов
npm run typecheck

# Запуск в dev-режиме (с hot-reload)
npm run dev -- parse YOUR_FILE_ID -t YOUR_TOKEN
```

## Верификация

Для проверки корректности парсинга:

1. Открыть Figma-файл в браузере
2. Выбрать любой элемент → посмотреть значение цвета в Inspect
3. Найти этот цвет в `colors.json` — значения MUST совпадать
4. Повторить для типографики (fontSize, fontWeight) и отступов
