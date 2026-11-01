/**
 * Компонент кнопки перевода текста
 * Использует NVIDIA NVI API (nvidia/riva-translate-4b-instruct-v2)
 * API ключ должен быть передан через VITE_NVIDIA_API_KEY (GitHub secret)
 * 
 * Интеграция:
 * 1. Добавьте секрет NVIDIA_API_KEY в Settings → Secrets → Actions
 * 2. Убедитесь, что deploy.yml передаёт VITE_NVIDIA_API_KEY
 * 3. Вставьте <TranslateButton text={value} onTranslate={setValue} /> рядом с полем
 */

import * as React from 'react';
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, Text } from '@fluentui/react-components';
import { DocumentText20Regular, Dismiss24Regular } from '@fluentui/react-icons';

interface TranslateButtonProps {
  text: string;
  onTranslate: (translated: string) => void;
}

const API_KEY = import.meta.env.VITE_NVIDIA_API_KEY || '';

// Кеш в sessionStorage
const translateCache: Record<string, string> = {};

// Дебаг-режим (включается в DEV или при явном запросе)
const DEBUG_MODE = import.meta.env.DEV || localStorage.getItem('debug_translator') === '1';

interface DebugLog {
  type: 'request' | 'response' | 'error';
  data: string;
  timestamp: string;
}

export const TranslateButton: React.FC<TranslateButtonProps> = ({ text, onTranslate }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showDebug, setShowDebug] = React.useState(false);
  const [debugLogs, setDebugLogs] = React.useState<DebugLog[]>([]);

  const addLog = (type: DebugLog['type'], data: string) => {
    if (!DEBUG_MODE) return;
    setDebugLogs(prev => [...prev, {
      type,
      data,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const handleTranslate = async () => {
    if (!text || loading || text.length < 20) return;

    const cacheKey = `nv_translate_${btoa(text.substring(0, 100))}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      onTranslate(cached);
      return;
    }

    if (!API_KEY) {
      const err = '[ERROR] NVIDIA API key не настроен. Добавьте секрет NVIDIA_API_KEY в GitHub.';
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

    addLog('request', JSON.stringify(requestBody, null, 2));

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      addLog('response', `status: ${response.status}\n${responseText}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 500)}`);
      }

      const translated = data.choices?.[0]?.message?.content?.trim() || text;
      sessionStorage.setItem(cacheKey, translated);
      onTranslate(translated);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TranslateButton] Ошибка:', errMsg);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = () => setDebugLogs([]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Button
          icon={<DocumentText20Regular />}
          size="small"
          appearance="subtle"
          onClick={handleTranslate}
          disabled={loading || !text || text.length < 20}
          title="Перевести на русский (NVI)"
          style={{ marginLeft: 4 }}
        >
          {loading ? '...' : 'RU'}
        </Button>
        {error && (
          <span style={{ fontSize: 12, color: '#f04e4e', cursor: 'pointer' }} title={error} onClick={() => setShowDebug(true)}>
            ⚠
          </span>
        )}
        {API_KEY === '' && (
          <span style={{ fontSize: 12, color: '#f7931a', cursor: 'pointer' }} 
                title="API ключ не настроен" 
                onClick={() => setShowDebug(true)}>
            ❓
          </span>
        )}
      </div>

      <Dialog open={showDebug} onOpenChange={(_, data) => { if (!data.open) setShowDebug(false); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              Debug: NVIDIA Translate
              <Button appearance="transparent" aria-label="close" onClick={() => setShowDebug(false)} style={{ float: 'right' }}>
                <Dismiss24Regular />
              </Button>
            </DialogTitle>
            <DialogContent style={{ maxHeight: '400px', overflow: 'auto', fontSize: 12 }}>
              {API_KEY === '' && (
                <div style={{ marginBottom: 12, padding: 8, backgroundColor: '#fff5f5', borderRadius: 4 }}>
                  <strong>⚠ API Key не настроен</strong>
                  <br />
                  Добавьте секрет <code>NVIDIA_API_KEY</code> в:
                  <br />
                  <a href="https://github.com/BangRori/CCEditor/settings/secrets/actions" target="_blank" rel="noopener noreferrer">
                    Settings → Secrets → Actions
                  </a>
                </div>
              )}
              {!API_KEY && localStorage.getItem('debug_translator') !== '1' && (
                <Button size="small" onClick={() => { localStorage.setItem('debug_translator', '1'); window.location.reload(); }}>
                  Включить подробный дебаг
                </Button>
              )}
              {debugLogs.length > 0 && (
                <>
                  <strong style={{ marginBottom: 8, display: 'block' }}>Request/Response Logs:</strong>
                  {debugLogs.map((log, i) => (
                    <div key={i} style={{ 
                      backgroundColor: log.type === 'error' ? '#fff5f5' : log.type === 'response' ? '#f0f8ff' : '#fafafa',
                      padding: 8,
                      marginBottom: 8,
                      borderRadius: 4,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: 11
                    }}>
                      <span style={{ color: '#666' }}>{log.timestamp}</span>
                      <br />
                      <span style={{ marginTop: 4 }}>{log.data}</span>
                    </div>
                  ))}
                </>
              )}
              {error && error.includes('Failed to fetch') && (
                <div style={{ color: '#f04e4e', marginTop: 12, padding: 8, backgroundColor: '#fff5f5', borderRadius: 4 }}>
                  <strong>Ошибка сети:</strong> CORS или нет подключения к интернету
                </div>
              )}
              {!error && debugLogs.length === 0 && (
                <div style={{ color: '#666', fontStyle: 'italic', marginTop: 12 }}>
                  Нажмите кнопку RU для перевода...
                </div>
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
};

// Экспорт для включения дебага вручную
export const enableDebugTranslator = () => {
  localStorage.setItem('debug_translator', '1');
  window.location.reload();
};