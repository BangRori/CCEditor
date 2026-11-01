/**
 * Кнопка перевода текста через NVIDIA NVI API.
 *
 * Работает в двух режимах:
 *  1. proxy  — POST { text } на Cloudflare Worker (нужно для GitHub Pages: нет CORS)
 *  2. direct — прямой запрос к NVIDIA с VITE_NVIDIA_API_KEY (только локальная разработка)
 *
 * URL прокси берётся из (по приоритету):
 *   localStorage["translate_proxy_url"] → VITE_TRANSLATE_PROXY_URL → встроенный дефолт
 */

import * as React from "react";
import {
  Button,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
} from "@fluentui/react-components";
import { DocumentText20Regular, Dismiss24Regular } from "@fluentui/react-icons";
import { useI18n } from "../tools/i18n";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/riva-translate-4b-instruct-v2";

/** Деплой воркера этого репозитория. Можно переопределить через localStorage. */
const DEFAULT_PROXY = "https://cc-editor-translate.roxroot.workers.dev";

function resolveProxyUrl(): string {
  try {
    const override = localStorage.getItem("translate_proxy_url");
    if (override) return override.trim().replace(/\/+$/, "");
  } catch {
    /* localStorage может быть недоступен */
  }
  const fromEnv = (import.meta.env.VITE_TRANSLATE_PROXY_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return DEFAULT_PROXY;
}

const DIRECT_KEY = import.meta.env.VITE_NVIDIA_API_KEY || "";

/** Клиентский ключ для доступа к воркеру. */
const CLIENT_KEY = import.meta.env.VITE_TRANSLATE_CLIENT_KEY || "";

interface TranslateButtonProps {
  text: string;
  onTranslate: (translated: string) => void;
  disabled?: boolean;
}

type DebugLog = { type: "request" | "response" | "error"; data: string; time: string };

function cacheKeyFor(text: string): string {
  // btoa падает на кириллице, поэтому кодируем в UTF-8
  const bytes = new TextEncoder().encode(text.slice(0, 200));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `nv_translate_${btoa(bin)}`;
}

export const TranslateButton: React.FC<TranslateButtonProps> = ({
  text,
  onTranslate,
  disabled = false,
}) => {
  const t = useI18n();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showDebug, setShowDebug] = React.useState(false);
  const [logs, setLogs] = React.useState<DebugLog[]>([]);

  const proxyUrl = React.useMemo(resolveProxyUrl, []);
  const useProxy = Boolean(proxyUrl);

  const log = (type: DebugLog["type"], data: string) =>
    setLogs((prev) => [...prev, { type, data, time: new Date().toLocaleTimeString() }]);

  const handleTranslate = async () => {
    if (!text || loading || disabled) return;
    if (text.trim().length < 3) {
      setError(t("Text is too short to translate"));
      setShowDebug(true);
      return;
    }

    const cacheKey = cacheKeyFor(text);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      onTranslate(cached);
      return;
    }

    setLoading(true);
    setError(null);

    const body = useProxy
      ? { text, target: "Russian" }
      : {
          model: MODEL,
          messages: [{ role: "user", content: `Translate to Russian: ${text}` }],
          max_tokens: Math.min(Math.max(text.length * 2, 256), 4000),
          temperature: 0.3,
        };

    const url = useProxy ? proxyUrl : NVIDIA_URL;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (useProxy && CLIENT_KEY) {
      headers["X-API-Key"] = CLIENT_KEY;
    }
    if (!useProxy) {
      headers["Authorization"] = `Bearer ${DIRECT_KEY}`;
    }

    log("request", `${url}\n${JSON.stringify(body).slice(0, 800)}`);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const raw = await res.text();
      log("response", `HTTP ${res.status}\n${raw.slice(0, 1200)}`);

      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        /* не JSON */
      }

      if (!res.ok) {
        const msg =
          data?.details || data?.error?.message || data?.error || raw.slice(0, 300) || `HTTP ${res.status}`;
        throw new Error(`${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
      }

      const translated: string =
        data?.text || data?.choices?.[0]?.message?.content?.trim() || "";
      if (!translated) throw new Error("Пустой ответ от API");

      sessionStorage.setItem(cacheKey, translated);
      onTranslate(translated);
    } catch (e: any) {
      const msg = e?.message || String(e);
      log("error", msg);
      setError(msg);
      setShowDebug(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
        <Button
          icon={<DocumentText20Regular />}
          size="small"
          appearance="subtle"
          onClick={handleTranslate}
          disabled={loading || disabled || !text}
          title={t("Translate to Russian")}
        >
          {loading ? "…" : "RU"}
        </Button>
        {error && (
          <span
            style={{ fontSize: 12, color: "#f04e4e", cursor: "pointer" }}
            title={error}
            onClick={() => setShowDebug(true)}
          >
            ⚠
          </span>
        )}
      </div>

      <Dialog
        open={showDebug}
        onOpenChange={(_, d) => {
          if (!d.open) setShowDebug(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              NVIDIA Translate — диагностика
              <Button
                appearance="transparent"
                aria-label="close"
                onClick={() => setShowDebug(false)}
                style={{ float: "right" }}
              >
                <Dismiss24Regular />
              </Button>
            </DialogTitle>
            <DialogContent style={{ maxHeight: 420, overflow: "auto", fontSize: 12 }}>
              <div style={{ marginBottom: 12, padding: 8, borderRadius: 4, background: useProxy ? "#e6f7ff" : "#fffbe6" }}>
                <strong>{useProxy ? "✅ Режим: прокси" : "⚡ Режим: прямой запрос"}</strong>
                <br />
                <code style={{ wordBreak: "break-all" }}>
                  {useProxy ? proxyUrl : NVIDIA_URL}
                </code>
                {!useProxy && !DIRECT_KEY && (
                  <div style={{ color: "#c00", marginTop: 6 }}>
                    API-ключ не задан — прямой режим не сработает.
                  </div>
                )}
                <div style={{ marginTop: 6, color: "#666" }}>
                  Сменить прокси: <code>localStorage.translate_proxy_url = "https://…"</code>
                </div>
              </div>

              {error && (
                <div style={{ marginBottom: 12, padding: 8, borderRadius: 4, background: "#fff5f5", color: "#a00" }}>
                  <strong>Ошибка:</strong> {error}
                </div>
              )}

              {logs.length > 0 && (
                <>
                  <strong>Логи:</strong>
                  {logs.map((l, i) => (
                    <div
                      key={i}
                      style={{
                        marginTop: 8,
                        padding: 8,
                        borderRadius: 4,
                        fontFamily: "monospace",
                        fontSize: 11,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        background:
                          l.type === "error" ? "#fff5f5" : l.type === "response" ? "#f0f8ff" : "#fafafa",
                      }}
                    >
                      <span style={{ color: "#666" }}>
                        {l.time} [{l.type.toUpperCase()}]
                      </span>
                      <br />
                      {l.data}
                    </div>
                  ))}
                </>
              )}

              {!error && logs.length === 0 && (
                <div style={{ color: "#666", fontStyle: "italic" }}>
                  Нажмите «RU», чтобы перевести текст.
                </div>
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
};
