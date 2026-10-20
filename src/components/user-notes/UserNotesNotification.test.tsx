// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { UserNoteIdentity, UserNotesStatusDto } from '@/shared/userNotes';
import { DialogFrame } from '@/components/DialogFrame';
import { UpdateNotification } from '@/components/layout/sidebar/UpdateNotification';
import { SettingsUserNotesSection } from '@/components/layout/settings/SettingsUserNotesSection';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { UserNotesNotification } from './UserNotesNotification';

const { api, updateSettings, settingsState } = vi.hoisted(() => ({
  api: {
    isAvailable: vi.fn(() => true),
    getUserNotesStatus: vi.fn(),
    onUserNotesChanged: vi.fn(),
    getUserNote: vi.fn(),
    acknowledgeUserNotes: vi.fn(),
    checkUserNotes: vi.fn(),
    getUpdaterStatus: vi.fn(),
    onUpdaterEvent: vi.fn(() => vi.fn()),
    openExternalUrl: vi.fn(),
  },
  updateSettings: vi.fn(),
  settingsState: { settings: { autoUpdateEnabled: true, autoUpdateCheckEnabled: true }, onUpdateSettings: vi.fn() },
}));
vi.mock('@/services/appClient', () => ({ appClient: api }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => vi.fn() }));
vi.mock('@/contexts/AppStateContext', () => ({ useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState) }));

const first = { id: '2026-10-20-info.md', revision: 'a'.repeat(64), title: 'Latest information', acknowledged: false };
const second = { id: '2026-10-19-info.md', revision: 'b'.repeat(64), title: 'Earlier information', acknowledged: false };
const image = 'data:image/gif;base64,R0lGODlh';

describe('user notice presentation', () => {
  let root: Root;
  let host: HTMLDivElement;
  let current: UserNotesStatusDto;
  const listeners = new Set<(status: UserNotesStatusDto) => void>();
  const send = (status: UserNotesStatusDto) => {
    current = status;
    for (const listener of listeners) listener(status);
  };
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label)!;
  const render = async (children = <UserNotesNotification />) => {
    await act(async () => {
      root.render(<I18nProvider language="en">{children}</I18nProvider>);
    });
  };
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    listeners.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    current = { state: 'ready', lastCheckedAt: 100, error: null, notes: [{ ...first }, { ...second }] };
    api.isAvailable.mockReturnValue(true);
    api.getUserNotesStatus.mockImplementation(async () => current);
    api.onUserNotesChanged.mockImplementation((listener: (status: UserNotesStatusDto) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    });
    api.getUserNote.mockImplementation(async (identity: UserNoteIdentity) => ({
      success: true,
      data: {
        ...identity,
        markdown: `# ${identity.id === first.id ? 'Latest content' : 'Earlier content'}\n\n| Status | Value |\n| --- | --- |\n| App | Working |\n\n![Status](assets/status.gif)\n![Tracker](https://example.invalid/tracker.gif)\n<iframe src="https://example.invalid/embed"></iframe>\n\n[Details](https://example.invalid/details)`,
        images: { 'assets/status.gif': image },
      },
    }));
    api.acknowledgeUserNotes.mockImplementation(async (identities: UserNoteIdentity[]) => {
      send({
        ...current,
        notes: current.notes.map((note) => ({ ...note, acknowledged: identities.some((entry) => entry.id === note.id && entry.revision === note.revision) })),
      });
      return { success: true };
    });
    api.checkUserNotes.mockResolvedValue({ success: true });
    api.openExternalUrl.mockResolvedValue({ success: true });
    api.getUpdaterStatus.mockResolvedValue({
      state: 'downloaded',
      availableVersion: '4.0.0',
      currentVersion: '3.1.0',
      isSupported: true,
      downloaded: true,
      releaseNotes: 'Update information',
      error: null,
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('opens multiple Markdown pages, displays cached GIFs, blocks remote embeds and opens links only on click', async () => {
    await render();
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Latest information');
    expect(host.querySelector('.user-notes-pagination')?.textContent).toContain('1 / 2');
    expect(host.querySelector('table')?.textContent).toContain('Working');
    expect(host.querySelector('img')?.getAttribute('src')).toBe(image);
    expect(host.querySelector('img[alt="Tracker"]')?.hasAttribute('src')).toBe(false);
    expect(host.querySelector('iframe')).toBeNull();
    expect(api.openExternalUrl).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLAnchorElement>('a')!.click());
    expect(api.openExternalUrl).toHaveBeenCalledExactlyOnceWith('https://example.invalid/details');
    await act(async () => button('Next').click());
    expect(host.querySelector('.user-notes-pagination')?.textContent).toContain('2 / 2');
    expect(host.querySelector('article')?.textContent).toContain('Earlier content');
    expect(button('Next').disabled).toBe(true);
    expect(api.checkUserNotes).not.toHaveBeenCalled();
  });

  it('keeps the icon after Later and does not repeat the same offer on polling', async () => {
    await render();
    await act(async () => button('Later').click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('[aria-label="New user notices"]')).not.toBeNull();
    await act(async () => send({ ...current, lastCheckedAt: 200 }));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => send({ ...current, notes: [first] }));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(api.acknowledgeUserNotes).not.toHaveBeenCalled();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="New user notices"]')!.click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('acknowledges all offered pages together and removes the notification', async () => {
    await render();
    await act(async () => button('Acknowledge all').click());
    expect(api.acknowledgeUserNotes).toHaveBeenCalledExactlyOnceWith([
      { id: first.id, revision: first.revision },
      { id: second.id, revision: second.revision },
    ]);
    expect(host.querySelector('[aria-label="New user notices"]')).toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps newly arrived and changed revisions unread when confirming an older popup', async () => {
    await render();
    const revised = { ...first, revision: 'c'.repeat(64) };
    const incoming = { id: 'new.md', revision: 'd'.repeat(64), title: 'New arrival', acknowledged: false };
    await act(async () => send({ ...current, notes: [revised, second, incoming] }));
    await act(async () => button('Acknowledge all').click());
    expect(api.acknowledgeUserNotes.mock.calls[0][0]).toEqual([
      { id: first.id, revision: first.revision },
      { id: second.id, revision: second.revision },
    ]);
    expect(current.notes.map((note) => note.acknowledged)).toEqual([false, true, false]);
    expect(host.querySelector('[aria-label="New user notices"]')).not.toBeNull();
  });

  it('keeps the popup available when acknowledgement cannot be saved', async () => {
    api.acknowledgeUserNotes.mockResolvedValue({ success: false, error: 'Disk unavailable' });
    await render();
    await act(async () => button('Acknowledge all').click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Disk unavailable');
    expect(button('Acknowledge all').disabled).toBe(false);
    expect(host.querySelector('[aria-label="New user notices"]')).not.toBeNull();
  });

  it('waits for existing dialogs and offers the app update before user notices', async () => {
    function Blocking() {
      const [open, setOpen] = useState(true);
      return (
        <DialogFrame open={open} title="Existing operation" onClose={() => setOpen(false)} cancelLabel="Finish operation">
          Existing task
        </DialogFrame>
      );
    }
    await render(
      <>
        <Blocking />
        <UpdateNotification />
        <UserNotesNotification />
      </>,
    );
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Existing operation');
    await act(async () => button('Finish operation').click());
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Version 4.0.0');
    await act(async () => button('Later').click());
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Latest information');
  });

  it('supports keyboard focus trapping and Escape without acknowledgement', async () => {
    await render();
    const focusable = [...host.querySelectorAll<HTMLElement>('[role="dialog"] button:not([disabled]), [role="dialog"] a[href]')];
    act(() => {
      focusable.at(-1)!.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(focusable[0]);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(api.acknowledgeUserNotes).not.toHaveBeenCalled();
  });

  it('keeps acknowledged pages readable through settings while checks are disabled', async () => {
    current.notes = current.notes.map((note) => ({ ...note, acknowledged: true }));
    await render(
      <SettingsUserNotesSection settings={{ ...DEFAULT_SETTINGS, userNotesCheckEnabled: false }} onUpdateSettings={updateSettings} variant="main" />,
    );
    expect(host.textContent).toContain('Acknowledged');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => button('Earlier information · Acknowledged').click());
    expect(host.querySelector('article')?.textContent).toContain('Earlier content');
    expect(host.querySelector('.user-notes-pagination')?.textContent).toContain('2 / 2');
    expect(button('Acknowledge all')).toBeUndefined();
    await act(async () => button('Close').click());
    await act(async () => button('Check now').click());
    expect(api.checkUserNotes).toHaveBeenCalledTimes(1);
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(updateSettings).toHaveBeenCalledWith({ userNotesCheckEnabled: true });
  });
});
