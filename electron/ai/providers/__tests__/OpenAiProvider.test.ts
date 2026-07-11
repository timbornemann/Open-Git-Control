import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiProvider } from '../OpenAiProvider';

const settings = {
  openAiBaseUrl: 'https://api.openai.com/v1',
  openAiModel: 'gpt-4.1-mini',
} as any;

const okJsonResponse = (json: unknown) => ({ ok: true, json: async () => json, text: async () => JSON.stringify(json) });

describe('OpenAiProvider endpoint safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('refuses to send a stored key to an insecure endpoint even if malformed settings bypass normalization', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiProvider();

    await expect(
      provider.listModels({
        settings: { openAiBaseUrl: 'http://example.test/v1' } as any,
        getGeminiApiKey: () => '',
        getOpenAiApiKey: () => 'sk-stored-key',
      }),
    ).rejects.toThrow('OpenAI Base URL muss HTTPS verwenden.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters models that cannot serve text chat completions', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      okJsonResponse({
        data: [
          { id: 'gpt-4.1-mini' },
          { id: 'text-embedding-3-small' },
          { id: 'whisper-1' },
          { id: 'dall-e-3' },
          { id: 'omni-moderation-latest' },
          { id: 'custom-chat-model' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiProvider();

    await expect(
      provider.listModels({
        settings,
        getGeminiApiKey: () => '',
        getOpenAiApiKey: () => 'sk-test',
      }),
    ).resolves.toEqual(['custom-chat-model', 'gpt-4.1-mini']);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('tests the selected model through the actual chat-completions endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okJsonResponse({ choices: [{ message: { content: 'OK' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiProvider();

    await expect(
      provider.testConnection({
        settings,
        getGeminiApiKey: () => '',
        getOpenAiApiKey: () => 'sk-test',
      }),
    ).resolves.toMatchObject({ ok: true, model: 'gpt-4.1-mini' });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ model: 'gpt-4.1-mini' });
  });

  it('rejects an obviously incompatible selected model before sending credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiProvider();

    await expect(
      provider.testConnection({
        settings: { ...settings, openAiModel: 'text-embedding-3-small' },
        getGeminiApiKey: () => '',
        getOpenAiApiKey: () => 'sk-test',
      }),
    ).rejects.toThrow('kein unterstuetztes Text-Chat-Modell');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts model discovery after the configured timeout', async () => {
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
    const provider = new OpenAiProvider();
    const request = provider.listModels({
      settings,
      getGeminiApiKey: () => '',
      getOpenAiApiKey: () => 'sk-test',
    });

    const assertion = expect(request).rejects.toThrow('Zeitlimit');
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
  });
});
