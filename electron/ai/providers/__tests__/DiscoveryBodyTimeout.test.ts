import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from '../OllamaProvider';
import { GeminiProvider } from '../GeminiProvider';
import { OpenAiProvider } from '../OpenAiProvider';
import { DEFAULT_SETTINGS } from '../../../settings';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AI discovery response deadlines', () => {
  it.each([new OllamaProvider(), new GeminiProvider(), new OpenAiProvider()])('aborts stalled success and error bodies for $id', async (provider) => {
    vi.useFakeTimers();
    for (const ok of [true, false]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url, init: RequestInit) => {
          const body = () =>
            new Promise((_resolve, reject) => {
              init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
            });
          return { ok, status: 503, json: body, text: body };
        }),
      );
      const input = { settings: { ...DEFAULT_SETTINGS, ollamaModel: 'test' }, getGeminiApiKey: () => 'key', getOpenAiApiKey: () => 'key' };
      for (const operation of ['listModels', 'testConnection'] as const) {
        const assertion = expect(provider[operation](input)).rejects.toThrow('Zeitlimit');
        await vi.advanceTimersByTimeAsync(15_001);
        await assertion;
      }
    }
  });
});
