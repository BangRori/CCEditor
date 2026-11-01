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

import React from 'react';
import { Button } from '@fluentui/react-components';
import { DocumentText20Regular } from '@fluentui/react-icons';

interface TranslateButtonProps {
  /** Текст для перевода */
  text: string;
  /** Коллбек, вызываемый с переведённым текстом */
  onTranslate: (translated: string) => void;
}

// Кеш переводов в sessionStorage
const translateCache: Record<string, string> = {};

const API_KEY = import.meta.env.VITE_NVIDIA_API_KEY || '';
  
export const TranslateButton: React.FC<TranslateButtonProps> = ({ text, onTranslate }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleTranslate = async () => {
    if (!text || loading || text.length < 20) return;
    if (!API_KEY) {
      console.warn('[TranslateButton] NVIDIA API key не настроен. Добавьте секрет NVIDIA_API_KEY в GitHub.');
      return;
    }

    const cacheKey = `nv_translate_${btoa(text.substring(0, 100))}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      onTranslate(cached);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nvidia/riva-translate-4b-instruct-v2',
          messages: [
            {
              role: 'user',
              content: `Translate to Russian: ${text}`,
            },
          ],
          max_tokens: Math.min(text.length * 2, 4000),
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const translated = data.choices?.[0]?.message?.content?.trim() || text;

      sessionStorage.setItem(cacheKey, translated);
      onTranslate(translated);
    } catch (error) {
      console.error('[TranslateButton] Ошибка перевода:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
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
        <span style={{ fontSize: 12, color: '#f04e4e' }} title={error}>
          ⚠
        </span>
      )}
    </div>
  );
};