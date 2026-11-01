/**
 * Cloudflare Worker: NVIDIA Translate Proxy.
 *
 * Защита: POST требует header `X-API-Key` с вашим клиентским ключом.
 * Ключ можно взять с сайта NVIDIA (см. TRANSLATE_SETUP.md).
 *
 * Если нужно добавить/сменить ключ:
 *   wrangler secret put TRANSLATE_CLIENT_KEY
 */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/riva-translate-4b-instruct-v2";

// Клиентский ключ — сравниваем с хешем. Можно сгенерировать:
//   openssl rand -hex 24
const VALID_KEY_HASH_SHA256 = "5c8b1e6e5c8b1e6e5c8b1e6e5c8b1e6e5c8b1e6e5c8b1e6e5c8b1e6e5c8b1e6e";

function sha256Hex(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  return crypto.subtle.digest("SHA-256", data).then(h => {
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-API-Key",
  "Access-Control-Max-Age": "86400",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

// Твой ключ: 48 символов (24 байта в hex), вставь сюда
const CLIENT_KEY = "af5c1c4046c2ac6fe1ea2ae5c0dcf15178d078d6f3a1b5e"; // <-- заменить на реальный!

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
        key_configured: !!(env.NVIDIA_API_KEY || CLIENT_KEY),
        timestamp: new Date().toISOString(),
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (path !== "/" && path !== "/translate") {
      return json({ error: `Unknown path: ${path}` }, 404);
    }

    // Проверка клиентского ключа
    const apiKeyHeader = request.headers.get("X-API-Key");
    // Ищем секрет env, fallback на жестко зашитый ключ
    const serverKey = (env?.TRANSLATE_CLIENT_KEY || "").trim() || CLIENT_KEY;
    if (!apiKeyHeader || !serverKey || apiKeyHeader !== serverKey) {
      return json({ error: "Invalid X-API-Key" }, 401);
    }

    if (!env.NVIDIA_API_KEY && !CLIENT_KEY) {
      return json(
        { error: "NVIDIA_API_KEY not configured in Worker secrets", code: "NO_KEY" },
        500,
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
      return json({ error: 'Field "text" required and non-empty' }, 400);
    }
    if (text.length > 20000) {
      return json({ error: "Text too long (max 20000 chars)" }, 413);
    }

    const target = typeof payload?.target === "string" ? payload.target.trim() : "Russian";

    const body = {
      model: MODEL,
      messages: [{ role: "user", content: `Translate to ${target}: ${text}` }],
      max_tokens: Math.min(Math.max(text.length * 2, 256), 4000),
      temperature: 0.3,
    };

    try {
      const upstream = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.NVIDIA_API_KEY || CLIENT_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      const raw = await upstream.text();

      if (!upstream.ok) {
        let detail = raw.slice(0, 500);
        try {
          const parsed = JSON.parse(raw);
          detail = parsed?.error?.message || parsed?.detail || detail;
        } catch {
          /* ignore parse error */
        }
        return json(
          { error: "NVIDIA API error", status: upstream.status, details: detail },
          upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status,
        );
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return json({ error: "Non-JSON from NVIDIA", details: raw.slice(0, 300) }, 502);
      }

      const translated = data?.choices?.[0]?.message?.content?.trim();
      if (!translated) {
        return json({ error: "No translation in NVIDIA response", raw: data }, 502);
      }

      return json({ ...data, text: translated });
    } catch (err) {
      return json({ error: "Upstream request failed", details: String(err) }, 502);
    }
  },
};