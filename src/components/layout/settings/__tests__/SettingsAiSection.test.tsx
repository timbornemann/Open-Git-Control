// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { I18nProvider } from '@/i18n';
import { SettingsAiSection } from '../SettingsAiSection';
import { appClient } from '@/services/appClient';

let root: Root | null = null;

const aiState = {
  geminiApiKeyInput: '',
  setGeminiApiKeyInput: vi.fn(),
  openAiApiKeyInput: '',
  setOpenAiApiKeyInput: vi.fn(),
  showToast: vi.fn(),
  isTestingAi: false,
  isLoadingModels: false,
  testConnection: vi.fn(),
  loadModels: vi.fn(),
  modelOptions: [],
  selectedModel: 'gpt-4.1-mini',
  mergedModelOptions: ['gpt-4.1-mini'],
  setSelectedModel: vi.fn(),
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SettingsAiSection base URL drafts', () => {
  it('does not persist intermediate or invalid OpenAI URL text and commits a complete HTTPS URL on blur', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
    const container = document.getElementById('root')!;
    root = createRoot(container);
    act(() => {
      root?.render(
        createElement(
          I18nProvider,
          { language: 'en' },
          createElement(SettingsAiSection, {
            settings: { ...DEFAULT_SETTINGS, aiProvider: 'openai', openAiBaseUrl: 'https://api.openai.com/v1' },
            onUpdateSettings,
            variant: 'main',
            ai: aiState,
          }),
        ),
      );
    });

    const input = container.querySelector<HTMLInputElement>('input[placeholder="https://api.openai.com/v1"]')!;
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!setValue) throw new Error('Missing input value setter.');

    act(() => {
      setValue.call(input, 'https:');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    expect(onUpdateSettings).not.toHaveBeenCalled();

    await act(async () => {
      input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Enter a complete, valid URL.');

    act(() => {
      setValue.call(input, 'https://gateway.example.test/v1');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onUpdateSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateSettings).toHaveBeenCalledWith({ openAiBaseUrl: 'https://gateway.example.test/v1' });
  });

  it('restores the persisted URL and shows an explicit persistence failure', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue({ success: false, error: 'Credential file is locked.' });
    const container = document.getElementById('root')!;
    root = createRoot(container);
    act(() => {
      root?.render(
        createElement(
          I18nProvider,
          { language: 'en' },
          createElement(SettingsAiSection, {
            settings: { ...DEFAULT_SETTINGS, aiProvider: 'openai', openAiBaseUrl: 'https://api.openai.com/v1' },
            onUpdateSettings,
            variant: 'main',
            ai: aiState,
          }),
        ),
      );
    });
    const input = container.querySelector<HTMLInputElement>('input[placeholder="https://api.openai.com/v1"]')!;
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!setValue) throw new Error('Missing input value setter.');
    act(() => {
      setValue.call(input, 'https://gateway.example.test/v1');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });

    expect(input.value).toBe('https://api.openai.com/v1');
    expect(container.textContent).toContain('Credential file is locked.');
  });

  it('does not refresh settings or report success when secure API-key deletion fails', async () => {
    vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(appClient, 'clearOpenAiApiKey').mockRejectedValue(new Error('OpenAI key file is locked.'));
    const onUpdateSettings = vi.fn().mockResolvedValue({ success: true, settings: DEFAULT_SETTINGS });
    const container = document.getElementById('root')!;
    root = createRoot(container);
    act(() => {
      root?.render(
        createElement(
          I18nProvider,
          { language: 'en' },
          createElement(SettingsAiSection, {
            settings: { ...DEFAULT_SETTINGS, aiProvider: 'openai', hasOpenAiApiKey: true },
            onUpdateSettings,
            variant: 'main',
            ai: aiState,
          }),
        ),
      );
    });
    const removeButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Remove API key'));
    if (!removeButton) throw new Error('Missing remove API key button.');

    await act(async () => removeButton.click());

    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(aiState.showToast).toHaveBeenCalledWith('OpenAI key file is locked.', true);
  });
});
