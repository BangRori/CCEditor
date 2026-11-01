# Переводчик в CCEditor

Кнопка **RU** в полноэкранном редакторе переводит текст на русский через
`nvidia/riva-translate-4b-instruct-v2`.

## Как это устроено

```
Браузер (GitHub Pages) → Cloudflare Worker → NVIDIA API
```

Прямой запрос к `integrate.api.nvidia.com` из браузера блокируется CORS, а ключ
нельзя класть в публичный бандл. Поэтому запрос идёт через свой Worker, где
ключ живёт в секретах Cloudflare.

## Текущий деплой

| Что | Значение |
| --- | --- |
| Worker | `https://cc-editor-translate.roxroot.workers.dev` |
| Код | `workers/translate.js` |
| Конфиг | `wrangler.toml` |
| Секрет | `NVIDIA_API_KEY` (задан в Cloudflare, не в git) |

URL вшит в `src/components/TranslateButton.tsx` как `DEFAULT_PROXY`, поэтому
сайт работает без каких-либо GitHub Secrets. Переопределить можно:

- build-time: `VITE_TRANSLATE_PROXY_URL=https://...` (env при сборке)
- runtime: `localStorage.translate_proxy_url = "https://..."`

## Обновить / переехать

Передеплой воркера после правок `workers/translate.js`:

```bash
cd CCEditor
wrangler deploy -c wrangler.toml --no-autoconfig
```

Заменить ключ NVIDIA:

```bash
wrangler secret put NVIDIA_API_KEY --name cc-editor-translate
```

Проверка живости:

```bash
curl https://cc-editor-translate.roxroot.workers.dev/health
# {"status":"ok","key_configured":true,...}
```

Проверка перевода:

```bash
curl -X POST https://cc-editor-translate.roxroot.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}'
```

## API воркера

- `GET /health` — статус, `key_configured`
- `POST /` или `POST /translate` — body `{ "text": "...", "target": "Russian" }`
  (target опционален). Ответ: стандартный ответ OpenAI-совместимого API плюс
  удобное поле `text` с готовым переводом.
- Ошибки: `400` нет текста, `500`/`NO_KEY` секрет не задан, `502` NVIDIA
  отказал (в `details` — причина, например `Unauthorized access`).

## Локальная разработка

```bash
# вариант 1: локальный воркер
wrangler dev -c wrangler.toml --no-autoconfig --port 8787
# затем в браузере: localStorage.translate_proxy_url = "http://localhost:8787"

# вариант 2: прямой запрос мимо воркера (ключ попадёт в дев-бандл!)
# .env.local:
#   VITE_TRANSLATE_PROXY_URL=
#   VITE_NVIDIA_API_KEY=nvapi-...
```

## Автодеплой воркера из GitHub Actions

`.github/workflows/deploy-workers.yml` срабатывает на изменения
`workers/translate.js` / `wrangler.toml`. Нужны секреты репозитория:

- `CLOUDFLARE_API_TOKEN` — токен с правами Workers
- `CLOUDFLARE_ACCOUNT_ID` — ID аккаунта
- `NVIDIA_API_KEY` — ключ NVIDIA

Если `CLOUDFLARE_API_TOKEN` не задан, шаг просто пропускается (без красного
крестика), а воркер обновляется вручную командой `wrangler deploy`.

## Отладка

Ошибка видна по значку ⚠ рядом с кнопкой — он открывает диалог с режимом,
URL, телом запроса и ответом. Кэш переводов — в `sessionStorage`
(`nv_translate_*`), сбросить: `sessionStorage.clear()`.

## Безопасность

Сайт публичный, поэтому URL воркера виден всем, и любой может им пользоваться
(тратя лимиты NVIDIA). Origin-проверка тут не спасёт — `curl` её обходит.
Если начнётся злоупотребление: удалить воркер (`wrangler delete`), поставить
жёсткий лимит запросов или добавить общий токен в воркер и в бандл.
