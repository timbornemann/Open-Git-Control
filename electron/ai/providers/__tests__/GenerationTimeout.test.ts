import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from '../OllamaProvider';
import { GeminiProvider } from '../GeminiProvider';
import { OpenAiProvider } from '../OpenAiProvider';
import { DEFAULT_SETTINGS } from '../../../settings';

describe('AI generation timeout includes the response body', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it.each([new OllamaProvider(), new GeminiProvider(), new OpenAiProvider()])('aborts a stalled body for $id', async (provider) => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => ({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          }),
      })),
    );
    const call = provider.generateText({
      settings: { ...DEFAULT_SETTINGS, ollamaModel: 'test' },
      getGeminiApiKey: () => 'key',
      getOpenAiApiKey: () => 'key',
      systemPrompt: '',
      userPrompt: '',
      timeoutMs: 1000,
    });
    const assertion = expect(call).rejects.toThrow('Zeitlimit');
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });
});
