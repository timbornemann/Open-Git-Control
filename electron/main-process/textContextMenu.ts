import { Menu } from 'electron';
import type { BrowserWindow, ContextMenuParams, Event, MenuItemConstructorOptions } from 'electron';
import type { AppSettings } from '../settings';

const TEXT_CONTROLS = new Set<ContextMenuParams['formControlType']>([
  'input-text',
  'input-search',
  'input-email',
  'input-url',
  'input-telephone',
  'input-number',
  'input-password',
  'text-area',
]);

const LABELS = {
  de: {
    noSuggestions: 'Keine Korrekturvorschläge',
    addToDictionary: 'Zum Wörterbuch hinzufügen',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    cut: 'Ausschneiden',
    copy: 'Kopieren',
    paste: 'Einfügen',
    delete: 'Löschen',
    selectAll: 'Alles auswählen',
  },
  en: {
    noSuggestions: 'No spelling suggestions',
    addToDictionary: 'Add to dictionary',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    delete: 'Delete',
    selectAll: 'Select all',
  },
};

export function installTextContextMenu(window: BrowserWindow, getLanguage: () => AppSettings['language']): void {
  const contents = window.webContents;
  let activeMenu: Menu | null = null;
  let generation = 0;
  let disposed = false;

  const closeMenu = () => {
    generation += 1;
    const menu = activeMenu;
    activeMenu = null;
    if (menu && !window.isDestroyed()) menu.closePopup(window);
  };

  const onContextMenu = (_event: Event, params: ContextMenuParams) => {
    closeMenu();
    if (disposed || window.isDestroyed() || contents.isDestroyed()) return;
    // Leave repository, file and graph context menus to their existing renderer handlers.
    if (!params.isEditable && !TEXT_CONTROLS.has(params.formControlType)) return;

    const labels = LABELS[getLanguage()];
    const menuGeneration = generation;
    const run = (action: () => void) => () => {
      if (!disposed && generation === menuGeneration && !window.isDestroyed() && !contents.isDestroyed()) action();
    };
    const template: MenuItemConstructorOptions[] = [];
    // A native spelling marker is authoritative; some Chromium versions leave spellcheckEnabled unset.
    const canCorrect = params.isEditable && params.formControlType !== 'input-password' && Boolean(params.misspelledWord);

    if (canCorrect) {
      for (const suggestion of params.dictionarySuggestions) {
        template.push({
          // Ampersands are menu mnemonics on Windows/Linux; display the actual suggestion.
          label: process.platform === 'darwin' ? suggestion : suggestion.replace(/&/g, '&&'),
          click: run(() => contents.replaceMisspelling(suggestion)),
        });
      }
      if (params.dictionarySuggestions.length === 0) template.push({ label: labels.noSuggestions, enabled: false });
      template.push(
        { label: labels.addToDictionary, click: run(() => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord)) },
        { type: 'separator' },
      );
    }

    const flags = params.editFlags;
    if (params.isEditable) {
      template.push(
        { label: labels.undo, accelerator: 'CmdOrCtrl+Z', enabled: flags.canUndo, click: run(() => contents.undo()) },
        {
          label: labels.redo,
          accelerator: process.platform === 'win32' ? 'Ctrl+Y' : 'CmdOrCtrl+Shift+Z',
          enabled: flags.canRedo,
          click: run(() => contents.redo()),
        },
        { type: 'separator' },
        { label: labels.cut, accelerator: 'CmdOrCtrl+X', enabled: flags.canCut, click: run(() => contents.cut()) },
      );
    }
    template.push({ label: labels.copy, accelerator: 'CmdOrCtrl+C', enabled: flags.canCopy, click: run(() => contents.copy()) });
    if (params.isEditable) {
      template.push(
        { label: labels.paste, accelerator: 'CmdOrCtrl+V', enabled: flags.canPaste, click: run(() => contents.paste()) },
        { label: labels.delete, enabled: flags.canDelete, click: run(() => contents.delete()) },
      );
    }
    template.push(
      { type: 'separator' },
      { label: labels.selectAll, accelerator: 'CmdOrCtrl+A', enabled: flags.canSelectAll, click: run(() => contents.selectAll()) },
    );

    const menu = Menu.buildFromTemplate(template);
    activeMenu = menu;
    menu.popup({
      window,
      ...(params.frame ? { frame: params.frame } : {}),
      x: params.x,
      y: params.y,
      sourceType: params.menuSourceType,
      callback: () => {
        // Do not invalidate actions here: native menu-close and click ordering differs by OS.
        if (activeMenu === menu) activeMenu = null;
      },
    });
  };

  const dispose = () => {
    disposed = true;
    closeMenu();
    contents.removeListener('context-menu', onContextMenu);
    contents.removeListener('did-start-navigation', closeMenu);
    contents.removeListener('destroyed', dispose);
    window.removeListener('closed', dispose);
  };

  contents.on('context-menu', onContextMenu);
  contents.on('did-start-navigation', closeMenu);
  contents.once('destroyed', dispose);
  window.once('closed', dispose);
}
