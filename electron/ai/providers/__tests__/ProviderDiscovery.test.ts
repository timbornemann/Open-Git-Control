import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../GeminiProvider';
import { OllamaProvider } from '../OllamaProvider';

const settings = {
  geminiModel: 'gemini-1.5-flash',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3',
} as any;

const okJsonResponse = (json: unknown) => ({ ok: true, json: async () => json, text: async () => JSON.stringify(json) });

describe('AI provider discovery validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('requires the selected Gemini model to support generateContent and uses a timeout signal', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okJsonResponse({ supportedGenerationMethods: ['embedContent'] }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiProvider();

    await expect(
      provider.testConnection({
        settings,
        getGeminiApiKey: () => 'gemini-key',
        getOpenAiApiKey: () => '',
      }),
    ).rejects.toThrow('unterstuetzt keine Textgenerierung');
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('validates that the selected Ollama model exists and supports completion', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
      callCount += 1;
      return callCount === 1 ? okJsonResponse({ version: '1.0.0' }) : okJsonResponse({ capabilities: ['vision'] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OllamaProvider();

    await expect(
      provider.testConnection({
        settings: { ...settings, ollamaModel: 'vision-only' },
        getGeminiApiKey: () => '',
        getOpenAiApiKey: () => '',
      }),
    ).rejects.toThrow('unterstuetzt keine Textgenerierung');
    expect(fetchMock.mock.calls[1][0]).toBe('http://127.0.0.1:11434/api/show');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ model: 'vision-only' });
    expect(fetchMock.mock.calls.every((call) => call[1]?.signal instanceof AbortSignal)).toBe(true);
  });

  it('times out stalled Ollama model-list requests', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OllamaProvider();
    const request = provider.listModels({
      settings,
      getGeminiApiKey: () => '',
      getOpenAiApiKey: () => '',
    });

    const assertion = expect(request).rejects.toThrow('Zeitlimit');
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
  });
});
