# Настройка переводчика в CCEditor

## Обзор

Переводчик использует NVIDIA NVI API (`nvidia/riva-translate-4b-instruct-v2`) для перевода текста на русский язык. Из-за ограничений CORS на GitHub Pages требуется прокси-сервер.

## Решение: Cloudflare Workers Proxy

### Шаг 1: Настройка Cloudflare аккаунта

1. Создайте аккаунт на [Cloudflare](https://dash.cloudflare.com/) (если ещё нет)
2. Установите wrangler:
   ```bash
   npm install -g wrangler
   ```

### Шаг 2: Авторизация

```bash
wrangler login
```

### Шаг 3: Получение NVIDIA API ключа

1. Перейдите на [NVIDIA NVI API](https://integrate.api.nvidia.com/)
2. Создайте аккаунт и получите API ключ
3. Сохраните ключ в GitHub Secrets как `NVIDIA_API_KEY`

### Шаг 4: Деплой Workers

Существует два способа деплоя:

#### Способ A: Автоматический через GitHub Actions

1. Добавьте секреты в репозиторий:
   - `CLOUDFLARE_API_TOKEN` - токен API Cloudflare (с правами на Workers)
   - `NVIDIA_API_KEY` - ваш NVIDIA API ключ

2. Синхронизация URL прокси:
   После первого успешного деплоя Workers, скопируйте URL из логов и добавьте его как секрет `VITE_TRANSLATE_PROXY_URL` в формате:
   ```
   https://cc-editor-translate.<ваш_аккаунт>.workers.dev
   ```

#### Способ B: Ручной деплой

```bash
cd /путь/к/CCEditor
wrangler kv:namespace create CACHE  # (опционально для кэширования)
wrangler secret put NVIDIA_API_KEY
wrangler deploy
```

### Шаг 5: Обновление сайта

После установки `VITE_TRANSLATE_PROXY_URL` в GitHub Secrets, следующий деплой сайта будет использовать прокси.

## Как это работает

1. При нажатии кнопки "RU" в FullscreenEditor отправляется POST-запрос на ваш Cloudflare Worker
2. Worker добавляет заголовок авторизации и форвардит запрос на NVIDIA API
3. Ответ возвращается через CORS-заголовки, разрешающие доступ с любого домена
4. Переведённый текст подставляется в редактор

## Тестирование

После настройки:

1. Откройте CCEditor
2. Войдите в fullscreen редактор (кнопка полноэкранного режима)
3. Введите текст длиннее 20 символов
4. Нажмите кнопку "RU"
5. Текст должен перевестись на русский

## Решение проблем

### CORS ошибка
- Убедитесь, что Workers развернут и доступен по URL
- Проверьте, что `VITE_TRANSLATE_PROXY_URL` установлен в секретах GitHub

### 401 Unauthorized
- Проверьте, что `NVIDIA_API_KEY` правильно настроен
- Убедитесь, что ключ активен (не истёк срок действия)

### Таймаут запроса
- NVIDIA API может занимать до 10-30 секунд
- Попробуйте укоротить текст для теста

## Локальная разработка

Для локальной разработки можно использовать:

1. **wrangler dev**:
   ```bash
   wrangler dev
   ```
   Затем в `.env` добавить:
   ```
   VITE_TRANSLATE_PROXY_URL=http://localhost:8787
   ```

2. **Прямой запрос** (только с localhost):
   ```
   VITE_NVIDIA_API_KEY=your-key
   ```