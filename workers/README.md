# Cloudflare Workers Translate Proxy

## Назначение

Прокси-сервер для API перевода NVIDIA NVI. Решает проблему CORS при использовании `https://integrate.api.nvidia.com/v1/chat/completions` с GitHub Pages.

## Быстрый старт

```bash
# 1. Установите wrangler (если ещё не установлен)
npm install -g wrangler

# 2. Авторизуйтесь в Cloudflare
wrangler login

# 3. Скопируйте пример конфигурации
cp wrangler.toml.example wrangler.toml
# Или заполните account_id вручную

# 4. Установите секрет NVIDIA API Key
wrangler secret put NVIDIA_API_KEY

# 5. Разверните
wrangler deploy
```

## GitHub Actions (Рекомендуется)

1. Добавьте секреты в репозиторий:
   - `NVIDIA_API_KEY` - ключ NVIDIA NVI API
   - `CLOUDFLARE_API_TOKEN` - токен с правами на Workers (создайте в Cloudflare Dashboard → My Profile → API Tokens → Create Token → Edit Workers)

2. Запустите workflow `Deploy Translate Proxy` или пушите изменения в `workers/` или `wrangler.toml`

3. После успешного деплоя:
   - Скопируйте URL из логов workflow
   - Добавьте в Secrets: `VITE_TRANSLATE_PROXY_URL = https://cc-editor-translate.<sub>.workers.dev`

## Локальная разработка

```bash
# Запустить локальный сервер
wrangler dev

# В другом терминале/окне
cd /путь/к/CCEditor
# В .env добавьте:
VITE_TRANSLATE_PROXY_URL=http://localhost:8787

npm run dev
```

## API Endpoints

### POST / - Перевод текста

**Request Body:**
```json
{
  "text": "Hello, how are you?"
}
```

**Response:**
```json
{
  "choices": [
    {
      "message": {
        "content": "Привет, как дела?"
      }
    }
  ]
}
```

### GET /health - Проверка здоровья

```json
{
  "status": "ok",
  "service": "cc-editor-translate-proxy",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Настройка CORS

Worker автоматически добавляет CORS заголовки:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Ограничения

- Максимальная длина текста: определён лимитами NVIDIA API (~4000 токенов)
- Таймаут запроса: 30 секунд

## Логи

Включите debug-режим в браузере:
```
localStorage.setItem('debug_translator', '1')
```

## Использование в CCEditor

```tsx
import { TranslateButton } from './components/TranslateButton';

// Автоматически использует прокси если VITE_TRANSLATE_PROXY_URL установлен
<TranslateButton text={editorValue} onTranslate={setEditorValue} />
```

## Устранение неполадок

### "API Key not configured"
- Проверьте, что `NVIDIA_API_KEY` установлен в GitHub Secrets
- Проверьте, что ключ действителен на сайте [NVIDIA NVI](https://integrate.api.nvidia.com/)

### CORS ошибка
- Убедитесь, что Worker развернут и доступен по URL
- Проверьте настройки Cloudflare

### Таймаут
- Текст может быть слишком длинным
- Попробуйте укоротить текст для теста

## Структура файлов

```
workers/
├── translate.js      # Основной код Worker
└── README.md         # Эта документация

wrangler.toml         # Конфигурация Wrangler
.github/workflows/
└── deploy-workers.yml # CI/CD для деплоя Workers
```