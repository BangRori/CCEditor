# Переводчик в CCEditor

## Проблема CORS

GitHub Pages (https://lenml.github.io/CCEditor/) — сайт с кросс-доменными ограничениями.
При попытке вызвать `https://integrate.api.nvidia.com/v1/chat/completions` из
браузера — запрос блокируется ошибкой CORS.

**Решение**: посредник — Cloudflare Worker, который добавляет нужные CORS-заголовки
и переслаёт запрос на NVIDIA.

## Архитектура

```
Браузер (страница CCEditor)
    │ POST { text }
    ▼
https://cc-editor-translate.roxroot.workers.dev/
    │ Bearer <NVIDIA API Key>
    ▼
NVIDIA NVI API → перевод → ответ → Worker → браузер
```

## Доступ закрыт

Чтобы случайные пользователи не могли использовать ваш Worker (он платит за токены),
добавлена защита клиентским ключом.

### Что требуется от пользователя

1. На сайте NVIDIA создайте API ключ (в личном кабинете → API Keys).  
   Это тот же ключ, который уже используется для прямого доступа к NVIDIA API.

2. Скопируйте его в настройки репозитория:
   - GitHub → Settings → Secrets and variables → Actions → `VITE_TRANSLATE_CLIENT_KEY`

3. Репозиторий `https://github.com/BangRori/CCEditor` → Settings → Secrets → 
   `NVIDIA_API_KEY` = ваш nvapi-ключ (для Worker)  
   `CLOUDFLARE_API_TOKEN` = токен Cloudflare (с правами на Workers)

### Ключи разделены

| Ключ | Где хранится | Кому виден |
| ---- | ------------ | ---------- |
| `NVIDIA_API_KEY` | Cloudflare Worker secrets | Только вы |
| `VITE_TRANSLATE_CLIENT_KEY` | GitHub Secrets → встраивается в сборку | Все пользователи (но это не nvapi-key) |
| nvapi-key в бранче | **НЕ хранится** | — |

**Почему клиентский ключ неопасен?** Это НЕ NVIDIA API ключ. Он нужен только
для аутентификации обращений к вашему конкретному воркеру. Сам воркер
скрывает реальный nvapi-key.

## Локальная разработка

```bash
# Кратко: клиентский ключ нужен, но не nvapi
echo "VITE_TRANSLATE_CLIENT_KEY=af5c1c4046c2ac6fe1ea2ae5c0dcf15178d078d6f3a1b5e" > .env.local
pnpm dev
```

## Обновить воркер

```bash
wrangler secret put TRANSLATE_CLIENT_KEY  # если захотите менять
wrangler secret put NVIDIA_API_KEY        # ваш nvapi-ключ
wrangler deploy -c wrangler.toml --no-autoconfig
```

## Проверка

```bash
curl "https://cc-editor-translate.roxroot.workers.dev/health"
# {"status":"ok","key_configured":true,"service":"cc-editor-translate"}

curl -X POST "https://cc-editor-translate.roxroot.workers.dev/" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $VITE_TRANSLATE_CLIENT_KEY" \
  -d '{"text":"Hello world"}'
# {"choices":[...],"text":"Здравствуйте, мир"}
```

## Ошибки

| Ошибка | Причина |
| ------ | ------- |
| `401 Invalid X-API-Key` | Клиентский ключ не совпадает с тем, что в воркере |
| `500 NVIDIA_API_KEY not configured` | Не добавлен секрет `NVIDIA_API_KEY` в Cloudflare |
| `502 NVIDIA API error` | nvapi-key не работает, лимит исчерпан, текст слишком длинный |

## Где посмотреть ключи NVIDIA

1. https://integrate.api.nvidia.com/
2. Sign In → API Keys → Copy

**Не делайте fork репозитория с этими ключами!** Используйте Secrets.