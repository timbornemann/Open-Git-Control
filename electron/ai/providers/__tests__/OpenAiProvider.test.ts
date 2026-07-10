import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiProvider } from '../OpenAiProvider';

describe('OpenAiProvider endpoint safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
