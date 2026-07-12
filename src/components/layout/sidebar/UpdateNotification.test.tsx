// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { UpdaterStatusDto } from '@/types/appDtos';
import { UpdateNotification } from './UpdateNotification';

const { appClientMock, onUpdateSettingsMock, settingsState } = vi.hoisted(() => ({
  appClientMock: {
    isAvailable: vi.fn(() => true),
    getUpdaterStatus: vi.fn(),
    onUpdaterEvent: vi.fn(() => vi.fn()),
    runOneClickAppUpdate: vi.fn(),
    installAppUpdate: vi.fn(),
  },
  onUpdateSettingsMock: vi.fn(),
  settingsState: {
    settings: { autoUpdateEnabled: true },
    onUpdateSettings: vi.fn(),
  },
}));

vi.mock('@/services/appClient', () => ({ appClient: appClientMock }));
vi.mock('@/contexts/AppStateContext', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}));

const availableStatus = (state: UpdaterStatusDto['state'] = 'update-available'): UpdaterStatusDto => ({
  isSupported: true,
  state,
  currentVersion: '1.0.0',
  availableVersion: '2.0.0',
  downloaded: state === 'downloaded',
  downloadPercent: state === 'downloaded' ? 100 : 0,
  bytesPerSecond: null,
  transferred: null,
  total: null,
  lastCheckedAt: 1,
  releaseNotes: 'Faster repositories\nSafer updates',
  error: null,
});

describe('UpdateNotification', () => {
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
    settingsState.settings.autoUpdateEnabled = true;
    settingsState.onUpdateSettings = onUpdateSettingsMock;
    onUpdateSettingsMock.mockReset();
    onUpdateSettingsMock.mockResolvedValue({ success: true, settings: settingsState.settings });
    appClientMock.getUpdaterStatus.mockReset();
    appClientMock.getUpdaterStatus.mockResolvedValue(availableStatus());
    appClientMock.onUpdaterEvent.mockClear();
    appClientMock.runOneClickAppUpdate.mockReset();
    appClientMock.installAppUpdate.mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  const renderNotification = async () => {
    root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root?.render(createElement(I18nProvider, { language: 'en', children: createElement(UpdateNotification) }));
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('advertises an installable background update with release notes and keeps the noticeable icon after dismissing the popup', async () => {
    appClientMock.getUpdaterStatus.mockResolvedValue(availableStatus('downloaded'));
    await renderNotification();

    expect(document.querySelector('[aria-label="Update is ready to install"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Version 2.0.0');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Faster repositories');

    const laterButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Later');
    if (!laterButton) throw new Error('Missing Later button.');
    act(() => laterButton.click());

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[aria-label="Update is ready to install"]')).not.toBeNull();
  });

  it('shows only the icon while automatic updates are disabled and opens the popup on demand', async () => {
    settingsState.settings.autoUpdateEnabled = false;
    await renderNotification();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const icon = document.querySelector<HTMLButtonElement>('[aria-label="A new app version is available"]');
    if (!icon) throw new Error('Missing update icon.');
    act(() => icon.click());

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('keeps an automatic download in the background until it is installable', async () => {
    appClientMock.getUpdaterStatus.mockResolvedValue(availableStatus('downloading'));
    await renderNotification();

    expect(document.querySelector('.activity-update-btn')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('downloads and installs from the primary action and can disable automatic update promotions', async () => {
    settingsState.settings.autoUpdateEnabled = false;
    appClientMock.runOneClickAppUpdate.mockResolvedValue({ success: true, action: 'downloaded' });
    appClientMock.installAppUpdate.mockResolvedValue({ success: true });
    await renderNotification();

    const icon = document.querySelector<HTMLButtonElement>('[aria-label="A new app version is available"]');
    if (!icon) throw new Error('Missing update icon.');
    act(() => icon.click());

    const installButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Download and install');
    if (!installButton) throw new Error('Missing install button.');
    await act(async () => installButton.click());

    expect(appClientMock.runOneClickAppUpdate).toHaveBeenCalledTimes(1);
    expect(appClientMock.installAppUpdate).toHaveBeenCalledTimes(1);

    const skipButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Skip & disable automatic updates');
    if (!skipButton) throw new Error('Missing skip button.');
    await act(async () => skipButton.click());

    expect(onUpdateSettingsMock).toHaveBeenCalledWith({ autoUpdateEnabled: false });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('installs an already downloaded background update directly', async () => {
    appClientMock.getUpdaterStatus.mockResolvedValue(availableStatus('downloaded'));
    appClientMock.installAppUpdate.mockResolvedValue({ success: true });
    await renderNotification();

    const installButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Install and restart');
    if (!installButton) throw new Error('Missing install button.');
    await act(async () => installButton.click());

    expect(appClientMock.runOneClickAppUpdate).not.toHaveBeenCalled();
    expect(appClientMock.installAppUpdate).toHaveBeenCalledTimes(1);
  });
});
