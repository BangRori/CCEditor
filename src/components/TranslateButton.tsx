/**
 * Компонент кнопки перевода текста
 * Использует NVIDIA NVI API (nvidia/riva-translate-4b-instruct-v2)
 * 
 * Интеграция через Cloudflare Workers:
 * wrangler login → wrangler deploy (создаст workers/translate.js)
 * Добавь VITE_TRANSLATE_PROXY_URL=URL_вашего_воркера во Secrets
 */

import * as React from 'react';
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent } from '@fluentui/react-components';
import { DocumentText20Regular, Dismiss24Regular } from '@fluentui/react-icons';

interface TranslateButtonProps {
  text: string;
  onTranslate: (translated: string) => void;
}

const API_KEY = import.meta.env.VITE_NVIDIA_API_KEY || '';
const TRANSLATE_PROXY = import.meta.env.VITE_TRANSLATE_PROXY_URL || '';
const DEBUG_MODE = import.meta.env.DEV || localStorage.getItem('debug_translator') === '1';

interface DebugLog { type: 'request' | 'response' | 'error'; data: string; timestamp: string; }

export const TranslateButton: React.FC<TranslateButtonProps> = ({ text, onTranslate }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showDebug, setShowDebug] = React.useState(false);
  const [debugLogs, setDebugLogs] = React.useState<DebugLog[]>([]);

  const addLog = (type: DebugLog['type'], data: string) => {
    if (!DEBUG_MODE) return;
    setDebugLogs(prev => [...prev, { type, data, timestamp: new Date().toLocaleTimeString() }]);
  };

  const handleTranslate = async () => {
    if (!text || loading || text.length < 20) return;

    const cacheKey = `nv_translate_${btoa(text.substring(0, 100))}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { onTranslate(cached); return; }

    if (!API_KEY) {
      const err = '[ERROR] NVIDIA API key не настроен. Добавьте секрет NVIDIA_API_KEY в GitHub Secrets';
      console.warn(err);
      setError(err);
      return;
    }

    const requestBody = {
      model: 'nvidia/riva-translate-4b-instruct-v2',
      messages: [{ role: 'user', content: `Translate to Russian: ${text}` }],
      max_tokens: Math.min(text.length * 2, 4000),
      temperature: 0.3,
    };

    const isUsingProxy = !!TRANSLATE_PROXY;
    const apiUrl = TRANSLATE_PROXY || 'https://integrate.api.nvidia.com/v1/chat/completions';

    addLog('request', JSON.stringify({ url: apiUrl, usingProxy: isUsingProxy, body: requestBody }, null, 2));

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          ...(isUsingProxy ? {} : { 'Authorization': `Bearer ${API_KEY}` }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      addLog('response', `status: ${response.status}\n${responseText.substring(0, 1000)}`);

      if (!response.ok) {
        let err: any = new Error(`HTTP ${response.status}`);
        try { const parsed = JSON.parse(responseText); err = new Error(`HTTP ${response.status}: ${parsed?.error?.message || responseText.substring(0, 200)}`); }
        catch (e) { err = new Error(`${err.message}\n${responseText.substring(0, 200)}`); }
        throw err;
      }

      const data = JSON.parse(responseText);
      const translated = data.choices?.[0]?.message?.content?.trim() || text;
      sessionStorage.setItem(cacheKey, translated);
      onTranslate(translated);
    } catch (error: any) {
      const errMsg = error.message || 'Unknown error';
      console.error('[TranslateButton] Ошибка:', errMsg);
      addLog('error', errMsg);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Button icon={<DocumentText20Regular />} size="small" appearance="subtle" onClick={handleTranslate}
                disabled={loading || !text || text.length < 20} title="Перевести на русский (NVI)" style={{ marginLeft: 4 }}>
          {loading ? '...' : 'RU'}
        </Button>
        {error && <span style={{ fontSize: 12, color: '#f04e4e', cursor: 'pointer' }} title={error} onClick={() => setShowDebug(true)}>⚠</span>}
        {!API_KEY && <span style={{ fontSize: 12, color: '#f7931a', cursor: 'pointer' }} title="API ключ не настроен" onClick={() => setShowDebug(true)}>❓</span>}
      </div>

      <Dialog open={showDebug} onOpenChange={(_, data) => { if (!data.open) setShowDebug(false); }}>
        <DialogSurface><DialogBody>
          <DialogTitle>Debug: NVIDIA Translate
            <Button appearance="transparent" aria-label="close" onClick={() => setShowDebug(false)} style={{ float: 'right' }}>
              <Dismiss24Regular />
            </Button>
          </DialogTitle>
          <DialogContent style={{ maxHeight: '400px', overflow: 'auto', fontSize: 12 }}>
            {!API_KEY && <div style={{ marginBottom: 12, padding: 8, backgroundColor: '#fff5f5', borderRadius: 4 }}>
              <strong>⚠ API Key не настроен</strong><br />
              Добавьте секрет <code>NVIDIA_API_KEY</code> в GitHub Secrets
            </div>}
            {TRANSLATE_PROXY && <div style={{ marginBottom: 12, padding: 8, backgroundColor: '#e6f7ff', borderRadius: 4 }}>
              <strong>✅ Используется прокси:</strong><br />{TRANSLATE_PROXY}
            </div>}
            {!TRANSLATE_PROXY && API_KEY && <div style={{ marginBottom: 12, padding: 8, backgroundColor: '#fffbe6', borderRadius: 4 }}>
              <strong>⚡ Прямой запрос (нужен прокси для CORS)</strong>
            </div>}
            {debugLogs.length > 0 && <>
              <strong style={{ marginBottom: 8, display: 'block' }}>Request/Response Logs:</strong>
              <details open>{debugLogs.map((log, i) => <div key={i} style={{ backgroundColor: log.type === 'error' ? '#fff5f5' : log.type === 'response' ? '#f0f8ff' : '#fafafa', padding: 8, marginBottom: 8, borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }}>
                <span style={{ color: '#666' }}>{log.timestamp} [{log.type.toUpperCase()}]</span><br />
                <span style={{ marginTop: 4 }}>{log.data}</span>
              </div>)}</details>
            </>}
            {!error && debugLogs.length === 0 && <div style={{ color: '#666', fontStyle: 'italic', marginTop: 12 }}>Нажмите RU для перевода...</div>}
          </DialogContent>
        </DialogBody></DialogSurface>
      </Dialog>
    </>
  );
};