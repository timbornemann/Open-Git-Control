// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { SettingsUpdatesSection } from '../SettingsSystemSections';
const api = vi.hoisted(() => ({ openRecoveryUpdater: vi.fn(), normalUpdate: vi.fn() }));
vi.mock('@/services/appClient', () => ({ appClient: api }));

describe('recovery entry in App & diagnostics', () => {
  let root: Root, host: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const render = async () => {
    const props = {
      settings: { autoUpdateEnabled: false },
      onUpdateSettings: vi.fn(),
      variant: 'main',
      locale: 'en-US',
      ai: {
        installedVersion: '3.0.5',
        updaterStatusLabel: 'Ready',
        updaterSupported: true,
        updaterStatus: { state: 'downloaded', recoveryActive: true },
        oneClickUpdateDisabled: false,
        oneClickUpdateLabel: 'Install update',
        handleRunOneClickUpdate: api.normalUpdate,
      },
    } as unknown as ComponentProps<typeof SettingsUpdatesSection>;
    await act(async () => root.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsUpdatesSection, props))));
  };
  const button = () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Open recovery updater')!;
  it('keeps normal installation blocked during recovery and waits for the independent helper to start', async () => {
    let finish!: (value: { success: boolean }) => void;
    api.openRecoveryUpdater.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render();
    expect([...host.querySelectorAll('button')].find((b) => b.textContent === 'Install update')!.disabled).toBe(true);
    await act(async () => button().click());
    expect(button().disabled).toBe(true);
    expect(host.textContent).not.toContain('has opened');
    expect(api.normalUpdate).not.toHaveBeenCalled();
    await act(async () => finish({ success: true }));
    expect(button().disabled).toBe(false);
    expect(host.textContent).toContain('The independent recovery updater has opened.');
  });
  it('shows a missing helper error and allows a retry', async () => {
    api.openRecoveryUpdater.mockResolvedValue({ success: false, error: 'The recovery helper is missing. Download it from official GitHub Releases.' });
    await render();
    await act(async () => button().click());
    expect(button().disabled).toBe(false);
    expect(host.textContent).toContain('The recovery helper is missing.');
    expect(host.textContent).not.toContain('has opened');
  });
});
