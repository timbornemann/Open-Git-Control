// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStateSlicesProvider, useSettingsStore, useWorkflowStore, type AppStateSlicesValue } from '../AppStateContext';

const createAppStateValue = (params: { language?: 'de' | 'en'; onFetch?: () => void } = {}): AppStateSlicesValue =>
  ({
    settings: {
      settings: { language: params.language ?? 'de' },
      settingsTab: 'general',
      onUpdateSettings: vi.fn(),
      onSelectSettingsTab: vi.fn(),
    },
    repository: {
      activeRepo: 'D:/repo',
    },
    github: {
      isAuthenticated: false,
    },
    workflow: {
      isGitActionRunning: false,
      activeGitActionLabel: null,
      onFetch: params.onFetch ?? vi.fn(),
    },
    ui: {
      activeTab: 'repo',
      setActiveTab: vi.fn(),
    },
  }) as unknown as AppStateSlicesValue;

const renderAppState = (root: Root, value: AppStateSlicesValue, children: React.ReactNode) => {
  root.render(React.createElement(AppStateSlicesProvider, { value }, children));
};

describe('AppStateSlicesProvider', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    container = null;
    root = null;
  });

  it('keeps selector subscribers stable when only action closures change', () => {
    let languageRenderCount = 0;
    let fetchRenderCount = 0;
    let latestFetch: (() => void) | null = null;
    const firstFetch = vi.fn();
    const secondFetch = vi.fn();

    const LanguageProbe = React.memo(() => {
      useSettingsStore((state) => state.settings.language);
      languageRenderCount += 1;
      return null;
    });
    LanguageProbe.displayName = 'LanguageProbe';

    const FetchProbe = React.memo(() => {
      latestFetch = useWorkflowStore((state) => state.onFetch);
      fetchRenderCount += 1;
      return null;
    });
    FetchProbe.displayName = 'FetchProbe';

    const children = React.createElement(React.Fragment, null, React.createElement(LanguageProbe), React.createElement(FetchProbe));

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderAppState(root as Root, createAppStateValue({ language: 'de', onFetch: firstFetch }), children));

    expect(languageRenderCount).toBe(1);
    expect(fetchRenderCount).toBe(1);

    act(() => renderAppState(root as Root, createAppStateValue({ language: 'de', onFetch: secondFetch }), children));

    expect(languageRenderCount).toBe(1);
    expect(fetchRenderCount).toBe(1);

    latestFetch?.();
    expect(firstFetch).not.toHaveBeenCalled();
    expect(secondFetch).toHaveBeenCalledTimes(1);

    act(() => renderAppState(root as Root, createAppStateValue({ language: 'en', onFetch: secondFetch }), children));

    expect(languageRenderCount).toBe(2);
    expect(fetchRenderCount).toBe(1);
  });
});
