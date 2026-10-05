import { EventEmitter } from 'events';
import type { BrowserWindow, ContextMenuParams, MenuItemConstructorOptions, PopupOptions } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildFromTemplate } = vi.hoisted(() => ({ buildFromTemplate: vi.fn() }));
vi.mock('electron', () => ({ Menu: { buildFromTemplate } }));

import { installTextContextMenu } from '../textContextMenu';

class FakeContents extends EventEmitter {
  destroyed = false;
  session = { addWordToSpellCheckerDictionary: vi.fn() };
  replaceMisspelling = vi.fn();
  undo = vi.fn();
  redo = vi.fn();
  cut = vi.fn();
  copy = vi.fn();
  paste = vi.fn();
  delete = vi.fn();
  selectAll = vi.fn();
  isDestroyed = () => this.destroyed;
}

class FakeWindow extends EventEmitter {
  destroyed = false;
  webContents = new FakeContents();
  isDestroyed = () => this.destroyed;
}

type FakeMenu = {
  template: MenuItemConstructorOptions[];
  popup: ReturnType<typeof vi.fn<(options: PopupOptions) => void>>;
  closePopup: ReturnType<typeof vi.fn>;
};

const menus: FakeMenu[] = [];
const params = (overrides: Partial<ContextMenuParams> = {}): ContextMenuParams =>
  ({
    x: 120,
    y: 90,
    frame: null,
    isEditable: true,
    formControlType: 'text-area',
    spellcheckEnabled: true,
    misspelledWord: '',
    dictionarySuggestions: [],
    menuSourceType: 'mouse',
    editFlags: { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: false },
    ...overrides,
  }) as ContextMenuParams;

function openMenu(window: FakeWindow, overrides: Partial<ContextMenuParams> = {}) {
  window.webContents.emit('context-menu', {}, params(overrides));
  return menus[menus.length - 1];
}

function click(menu: FakeMenu, label: string) {
  const item = menu.template.find((entry) => entry.label === label);
  expect(item).toBeDefined();
  expect(item?.enabled).not.toBe(false);
  (item?.click as () => void)();
}

function install(window = new FakeWindow(), getLanguage: () => 'de' | 'en' = () => 'de') {
  installTextContextMenu(window as unknown as BrowserWindow, getLanguage);
  return window;
}

describe('text context menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    menus.length = 0;
    buildFromTemplate.mockImplementation((template: MenuItemConstructorOptions[]) => {
      const menu = { template, popup: vi.fn<(options: PopupOptions) => void>(), closePopup: vi.fn() };
      menus.push(menu);
      return menu;
    });
  });

  it('uses native spelling suggestions and keeps the original replacement text', () => {
    const window = install();
    const menu = openMenu(window, { misspelledWord: 'tehst', dictionarySuggestions: ['test', 'text', 'A&B'] });

    const ampersandLabel = process.platform === 'darwin' ? 'A&B' : 'A&&B';
    expect(menu.template.slice(0, 3).map((item) => item.label)).toEqual(['test', 'text', ampersandLabel]);
    click(menu, 'test');
    click(menu, ampersandLabel);
    expect(window.webContents.replaceMisspelling.mock.calls).toEqual([['test'], ['A&B']]);
    expect(menu.popup).toHaveBeenCalledWith(expect.objectContaining({ window, x: 120, y: 90, sourceType: 'mouse' }));
  });

  it('adds the clicked word to the native session dictionary', () => {
    const window = install();
    const menu = openMenu(window, { misspelledWord: 'Projektname', dictionarySuggestions: ['Projekt Name'] });
    click(menu, 'Zum Wörterbuch hinzufügen');
    expect(window.webContents.session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith('Projektname');
  });

  it('explains missing suggestions while still allowing a dictionary entry', () => {
    const window = install();
    const menu = openMenu(window, { misspelledWord: 'Projektname' });
    expect(menu.template[0]).toEqual({ label: 'Keine Korrekturvorschläge', enabled: false });
    click(menu, 'Zum Wörterbuch hinzufügen');
    expect(window.webContents.session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith('Projektname');
  });

  it.each([
    { spellcheckEnabled: false, misspelledWord: '', dictionarySuggestions: [] },
    { formControlType: 'input-password' as const },
    { misspelledWord: '' },
  ])('omits spelling actions when correction is unavailable: %j', (overrides) => {
    const window = install();
    const menu = openMenu(window, { misspelledWord: 'tehst', dictionarySuggestions: ['test'], ...overrides });
    expect(menu.template.some((item) => item.label === 'test' || item.label === 'Zum Wörterbuch hinzufügen')).toBe(false);
    expect(menu.template.some((item) => item.label === 'Einfügen')).toBe(true);
  });

  it('uses native spelling markers even when Chromium does not populate spellcheckEnabled', () => {
    const window = install();
    const menu = openMenu(window, { spellcheckEnabled: false, misspelledWord: 'tehst', dictionarySuggestions: ['test'] });
    click(menu, 'test');
    expect(window.webContents.replaceMisspelling).toHaveBeenCalledWith('test');
  });

  it('provides native editing commands using the current edit permissions', () => {
    const window = install();
    let menu = openMenu(window);
    expect(menu.template.find((item) => item.label === 'Wiederholen')?.enabled).toBe(false);
    click(menu, 'Rückgängig');
    click(menu, 'Ausschneiden');
    click(menu, 'Kopieren');
    click(menu, 'Einfügen');
    click(menu, 'Löschen');
    click(menu, 'Alles auswählen');
    for (const action of ['undo', 'cut', 'copy', 'paste', 'delete', 'selectAll'] as const) {
      expect(window.webContents[action]).toHaveBeenCalledOnce();
    }
    menu = openMenu(window, { editFlags: { ...params().editFlags, canRedo: true, canCopy: false, canCut: false, canPaste: false } });
    click(menu, 'Wiederholen');
    expect(window.webContents.redo).toHaveBeenCalledOnce();
    for (const label of ['Kopieren', 'Ausschneiden', 'Einfügen']) {
      expect(menu.template.find((item) => item.label === label)?.enabled).toBe(false);
    }
  });

  it('shows only non-mutating commands for read-only text fields', () => {
    const window = install();
    const menu = openMenu(window, { isEditable: false, formControlType: 'input-text', misspelledWord: 'tehst', dictionarySuggestions: ['test'] });
    expect(menu.template.filter((item) => item.type !== 'separator').map((item) => item.label)).toEqual(['Kopieren', 'Alles auswählen']);
    click(menu, 'Kopieren');
    expect(window.webContents.copy).toHaveBeenCalledOnce();
  });

  it('supports contenteditable fields as well as native form controls', () => {
    const window = install();
    const menu = openMenu(window, { formControlType: 'none', misspelledWord: 'tehst', dictionarySuggestions: ['test'] });
    click(menu, 'test');
    expect(window.webContents.replaceMisspelling).toHaveBeenCalledWith('test');
  });

  it('does not replace repository, graph, image or button context menus', () => {
    const window = install();
    for (const formControlType of ['none', 'input-checkbox', 'input-button', 'select-one'] as const) {
      window.webContents.emit('context-menu', {}, params({ isEditable: false, formControlType }));
    }
    expect(buildFromTemplate).not.toHaveBeenCalled();
  });

  it('reads the current app language each time and preserves keyboard invocation and frame', () => {
    let language: 'de' | 'en' = 'de';
    const window = install(new FakeWindow(), () => language);
    const first = openMenu(window);
    expect(first.template[0].label).toBe('Rückgängig');
    language = 'en';
    const frame = {} as NonNullable<ContextMenuParams['frame']>;
    const menu = openMenu(window, { menuSourceType: 'keyboard', frame, misspelledWord: 'tehst' });
    expect(menu.template[0].label).toBe('No spelling suggestions');
    expect(menu.popup).toHaveBeenCalledWith(expect.objectContaining({ frame, sourceType: 'keyboard' }));
    expect(first.closePopup).toHaveBeenCalledWith(window);
  });

  it('ignores commands from an earlier context menu', () => {
    const window = install();
    const first = openMenu(window, { misspelledWord: 'tehst', dictionarySuggestions: ['test'] });
    openMenu(window, { isEditable: false, formControlType: 'none' });
    click(first, 'test');
    expect(window.webContents.replaceMisspelling).not.toHaveBeenCalled();
    expect(first.closePopup).toHaveBeenCalledWith(window);
  });

  it('closes the menu and ignores pending commands on navigation', () => {
    const window = install();
    const menu = openMenu(window, { misspelledWord: 'tehst', dictionarySuggestions: ['test'] });
    window.webContents.emit('did-start-navigation');
    click(menu, 'test');
    click(menu, 'Zum Wörterbuch hinzufügen');
    expect(menu.closePopup).toHaveBeenCalledWith(window);
    expect(window.webContents.replaceMisspelling).not.toHaveBeenCalled();
    expect(window.webContents.session.addWordToSpellCheckerDictionary).not.toHaveBeenCalled();
  });

  it('allows a native click even when the OS reports menu closure before the click', () => {
    const window = install();
    const menu = openMenu(window, { misspelledWord: 'tehst', dictionarySuggestions: ['test'] });
    menu.popup.mock.calls[0][0].callback?.();
    click(menu, 'test');
    expect(window.webContents.replaceMisspelling).toHaveBeenCalledWith('test');
  });

  it('does not let an old close callback clear a newer menu', () => {
    const window = install();
    const first = openMenu(window);
    const second = openMenu(window);
    first.popup.mock.calls[0][0].callback?.();
    window.webContents.emit('did-start-navigation');
    expect(second.closePopup).toHaveBeenCalledWith(window);
  });

  it.each(['window', 'contents'] as const)('cleans up listeners when the %s is destroyed', (target) => {
    const window = install();
    const menu = openMenu(window);
    if (target === 'window') {
      window.destroyed = true;
      window.emit('closed');
    } else {
      window.webContents.destroyed = true;
      window.webContents.emit('destroyed');
    }
    expect(window.webContents.listenerCount('context-menu')).toBe(0);
    expect(window.webContents.listenerCount('did-start-navigation')).toBe(0);
    expect(window.webContents.listenerCount('destroyed')).toBe(0);
    expect(window.listenerCount('closed')).toBe(0);
    click(menu, 'Einfügen');
    expect(window.webContents.paste).not.toHaveBeenCalled();
  });

  it.each(['window', 'contents'] as const)('does not open a menu on an already destroyed %s', (target) => {
    const window = install();
    if (target === 'window') window.destroyed = true;
    else window.webContents.destroyed = true;
    openMenu(window);
    expect(buildFromTemplate).not.toHaveBeenCalled();
  });
});
