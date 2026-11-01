/**
 * Cloudflare Worker: прокси к NVIDIA NVI Translate API.
 *
 * Зачем: браузер на GitHub Pages не может напрямую звать integrate.api.nvidia.com
 * (CORS), а API-ключ нельзя держать в клиентском бандле.
 *
 * Маршруты:
 *   GET  /health   — проверка живости
 *   POST /         — перевод, body: { "text": "...", "target": "Russian" }
 *   POST /translate— то же самое
 */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/riva-translate-4b-instruct-v2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === "GET" && (path === "/health" || path === "/")) {
      return json({
        status: "ok",
        service: "cc-editor-translate",
        key_configured: Boolean(env.NVIDIA_API_KEY),
        timestamp: new Date().toISOString(),
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed. Use POST." }, 405);
    }

    if (path !== "/" && path !== "/translate") {
      return json({ error: `Unknown path: ${path}` }, 404);
    }

    // trim() защищает от случайного \r\n в конце секрета
    const apiKey = (env.NVIDIA_API_KEY || "").trim();
    if (!apiKey) {
      return json(
        { error: "NVIDIA_API_KEY is not configured on the Worker", code: "NO_KEY" },
        500
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Body must be valid JSON" }, 400);
    }

    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text) {
      return json({ error: 'Field "text" is required and must be a non-empty string' }, 400);
    }
    if (text.length > 20000) {
      return json({ error: "Text too long (max 20000 chars)" }, 413);
    }

    const target = typeof payload?.target === "string" && payload.target.trim()
      ? payload.target.trim()
      : "Russian";

    const body = {
      model: MODEL,
      messages: [{ role: "user", content: `Translate to ${target}: ${text}` }],
      max_tokens: Math.min(Math.max(text.length * 2, 256), 4000),
      temperature: 0.3,
    };

    let upstream;
    try {
      upstream = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return json({ error: "Upstream request failed", details: String(err) }, 502);
    }

    const raw = await upstream.text();

    if (!upstream.ok) {
      // Прокидываем статус NVIDIA, чтобы клиент показал внятную ошибку
      let detail = raw.slice(0, 500);
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.error?.message || parsed?.detail || detail;
      } catch {
        /* raw as-is */
      }
      return json(
        { error: "NVIDIA API error", status: upstream.status, details: detail },
        upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status
      );
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: "NVIDIA returned non-JSON response", details: raw.slice(0, 500) }, 502);
    }

    const translated = data?.choices?.[0]?.message?.content?.trim();
    if (!translated) {
      return json({ error: "NVIDIA returned no translation", raw: data }, 502);
    }

    // Отдаём и «сырой» формат OpenAI, и удобное поле text
    return json({ ...data, text: translated });
  },
};
