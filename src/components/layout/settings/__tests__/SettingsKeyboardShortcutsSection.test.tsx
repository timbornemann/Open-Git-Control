// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import type { AppSettingsDto } from '@/types/appDtos';
import { I18nProvider } from '@/i18n';
import { isShortcutCaptureActive } from '@/hooks/keyboardShortcutRuntime';
import { SettingsKeyboardShortcutsSection } from '../SettingsKeyboardShortcutsSection';

let host: HTMLDivElement, root: Root, saved: AppSettingsDto, visible: boolean;
const update = vi.fn();
function Harness() {
  const [settings, setSettings] = useState(saved);
  return (
    <I18nProvider language={settings.language}>
      <SettingsKeyboardShortcutsSection
        settings={settings}
        variant="main"
        visible={visible}
        onUpdateSettings={async (partial) => {
          await update(partial);
          saved = { ...settings, ...partial };
          setSettings(saved);
          return { success: true, settings: saved };
        }}
      />
    </I18nProvider>
  );
}
const render = () => act(async () => root.render(<Harness />));
const row = (id: string) => host.querySelector<HTMLElement>(`[data-shortcut="${id}"]`)!;
const button = (id: string, index: number) => row(id).querySelectorAll<HTMLButtonElement>('button')[index];
const click = (element: HTMLElement) => act(async () => element.click());
async function press(key: string, modifiers: KeyboardEventInit = {}) {
  await act(async () => {
    const target = document.activeElement ?? window;
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...modifiers }));
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  saved = { ...DEFAULT_SETTINGS, language: 'de' };
  visible = true;
  update.mockReset().mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  expect(isShortcutCaptureActive()).toBe(false);
});

describe('keyboard shortcuts settings', () => {
  it('documents all nineteen actions with grouped descriptions and localized labels', async () => {
    await render();
    expect(host.querySelectorAll('[data-shortcut]')).toHaveLength(19);
    expect(row('refresh').textContent).toContain('F5');
    expect(row('openRepository').textContent).toContain('Repository öffnen');
    expect(row('cloneRepository').textContent).toContain('Repository klonen');
    expect(row('createBranch').textContent).toContain('Branch erstellen');
    expect(row('pull').textContent).toContain('StrgUmschaltL');
    expect(row('push').textContent).toContain('StrgUmschaltU');
    expect(host.textContent).toContain('Repository-Aktionen');
    expect(row('commit').textContent).toContain('StrgEnter');
    expect(button('fetch', 0).getAttribute('aria-label')).toContain('Fetch ändern');
    act(() => root.unmount());
    root = createRoot(host);
    saved.language = 'en';
    await render();
    expect(host.textContent).toContain('File editing');
    expect(row('createBranch').textContent).toContain('Create branch');
    expect(button('saveFile', 0).getAttribute('aria-label')).toBe('Change shortcut for Save file');
  });
  it('records on key release, saves immediately and restores the new binding after remounting', async () => {
    await render();
    await click(button('fetch', 0));
    expect(document.activeElement).toBe(row('fetch').querySelector('input'));
    expect(isShortcutCaptureActive()).toBe(true);
    await act(async () =>
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })),
    );
    expect(update).not.toHaveBeenCalled();
    await act(async () =>
      document.activeElement!.dispatchEvent(new KeyboardEvent('keyup', { key: 'K', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })),
    );
    expect(update).toHaveBeenCalledExactlyOnceWith({ keyboardShortcuts: { fetch: { key: 'k', primary: true, alt: false, shift: true } } });
    expect(row('fetch').querySelector('.shortcut-binding')?.getAttribute('aria-label')).toBe('Strg+Umschalt+K');
    expect(document.activeElement).toBe(button('fetch', 0));
    act(() => root.unmount());
    root = createRoot(host);
    await render();
    expect(row('fetch').textContent).toContain('StrgUmschaltK');
  });
  it('names conflicting actions without saving or running them', async () => {
    await render();
    await click(button('fetch', 0));
    await press('p', { ctrlKey: true, shiftKey: true });
    expect(row('fetch').querySelector('[role="alert"]')?.textContent).toContain('Befehlspalette');
    expect(update).not.toHaveBeenCalled();
    expect(isShortcutCaptureActive()).toBe(true);
    await press('Escape');
    expect(isShortcutCaptureActive()).toBe(false);
  });
  it.each(['refresh', 'openRepository', 'cloneRepository', 'createBranch', 'pull', 'push'] as const)('records, disables and resets %s', async (id) => {
    await render();
    const standard = row(id).querySelector('.shortcut-binding')!.textContent;
    await click(button(id, 0));
    await press('F9');
    expect(saved.keyboardShortcuts?.[id]).toEqual({ key: 'F9', primary: false, alt: false, shift: false });
    await click(button(id, 1));
    expect(saved.keyboardShortcuts?.[id]).toBeNull();
    await click(button(id, 2));
    expect(saved.keyboardShortcuts?.[id]).toBeUndefined();
    expect(row(id).querySelector('.shortcut-binding')!.textContent).toBe(standard);
  });
  it('rejects reserved and bare keys while continuing to listen', async () => {
    await render();
    await click(button('fetch', 0));
    await press('c', { ctrlKey: true });
    expect(row('fetch').textContent).toContain('reserviert');
    await press('k');
    expect(row('fetch').textContent).toContain('Funktionstaste');
    expect(update).not.toHaveBeenCalled();
    await press('F8');
    expect(update).toHaveBeenCalledOnce();
  });
  it('removes, resets one binding and resets all bindings', async () => {
    await render();
    await click(button('saveFile', 1));
    expect(row('saveFile').textContent).toContain('Nicht belegt');
    expect(saved.keyboardShortcuts?.saveFile).toBeNull();
    await click(button('saveFile', 2));
    expect(saved.keyboardShortcuts).toEqual({});
    expect(row('saveFile').textContent).toContain('StrgS');
    await click(button('fetch', 1));
    await click(host.querySelector<HTMLButtonElement>('.settings-section-heading button')!);
    expect(saved.keyboardShortcuts).toEqual({});
    expect(row('fetch').textContent).toContain('StrgUmschaltF');
  });
  it('blocks a single reset that would conflict with an assigned default', async () => {
    saved.keyboardShortcuts = { commandPalette: null, fetch: { key: 'p', primary: true, shift: true, alt: false } };
    await render();
    await click(button('commandPalette', 2));
    expect(row('commandPalette').textContent).toContain('Fetch');
    expect(update).not.toHaveBeenCalled();
    await click(host.querySelector<HTMLButtonElement>('.settings-section-heading button')!);
    expect(saved.keyboardShortcuts).toEqual({});
  });
  it('preserves the active binding and reports a failed save next to its action', async () => {
    update.mockRejectedValue(new Error('Disk full'));
    await render();
    await click(button('fetch', 0));
    await press('k', { ctrlKey: true, shiftKey: true });
    expect(row('fetch').querySelector('[role="alert"]')?.textContent).toContain('Disk full');
    expect(row('fetch').textContent).toContain('StrgUmschaltF');
    expect(saved.keyboardShortcuts).toEqual({});
  });
  it('cancels on input blur, window blur, Tab, hiding and unmounting', async () => {
    await render();
    await click(button('fetch', 0));
    act(() => row('fetch').querySelector<HTMLInputElement>('input')!.blur());
    expect(isShortcutCaptureActive()).toBe(false);
    await click(button('fetch', 0));
    act(() => window.dispatchEvent(new Event('blur')));
    expect(isShortcutCaptureActive()).toBe(false);
    await click(button('fetch', 0));
    await press('Tab');
    expect(isShortcutCaptureActive()).toBe(false);
    await click(button('fetch', 0));
    visible = false;
    await render();
    expect(isShortcutCaptureActive()).toBe(false);
    visible = true;
    await render();
    await click(button('fetch', 0));
    expect(update).not.toHaveBeenCalled();
  });
});
