/** Serializable shortcuts shared by the renderer and the settings store. */
export type ShortcutBinding = { key: string; primary: boolean; alt: boolean; shift: boolean };
type Text = readonly [de: string, en: string];
type Group = 'navigation' | 'repository' | 'files';
const binding = (key: string, shift = false): ShortcutBinding => ({ key, primary: true, alt: false, shift });
const action = <Id extends string>(id: Id, group: Group, label: Text, description: Text, defaultBinding: ShortcutBinding) =>
  ({ id, group, label, description, defaultBinding }) as const;

export const SHORTCUT_ACTIONS = [
  action(
    'localRepos',
    'navigation',
    ['Lokale Repositories', 'Local repositories'],
    ['Lokale Repositories anzeigen.', 'Show local repositories.'],
    binding('1'),
  ),
  action('repo', 'navigation', ['Repository', 'Repository'], ['Zur Repository-Ansicht wechseln.', 'Switch to the repository view.'], binding('2')),
  action('hosting', 'navigation', ['Hosting', 'Hosting'], ['Hosting-Verbindungen anzeigen.', 'Show hosting connections.'], binding('3')),
  action('settings', 'navigation', ['Einstellungen', 'Settings'], ['Einstellungen öffnen.', 'Open settings.'], binding('4')),
  action('planner', 'navigation', ['Planner', 'Planner'], ['Projektplanung öffnen.', 'Open project planning.'], binding('5')),
  action('analytics', 'navigation', ['Analytics', 'Analytics'], ['Repository-Statistiken anzeigen.', 'Show repository statistics.'], binding('6')),
  action('commandPalette', 'navigation', ['Befehlspalette', 'Command palette'], ['Nach App-Befehlen suchen.', 'Search app commands.'], binding('p', true)),
  action(
    'fetch',
    'repository',
    ['Fetch', 'Fetch'],
    ['Remote-Änderungen für das aktive Repository abrufen.', 'Fetch remote changes for the active repository.'],
    binding('f', true),
  ),
  action(
    'quickTodo',
    'repository',
    ['Neues Todo', 'New todo'],
    [
      'Ein Todo für das aktive Repository oder das ausgewählte Planner-Projekt erstellen.',
      'Create a todo for the active repository or selected planner project.',
    ],
    binding('t', true),
  ),
  action(
    'previousRepository',
    'repository',
    ['Vorheriges Repository', 'Previous repository'],
    ['Unter den geöffneten Repositories zurückwechseln.', 'Cycle backwards through open repositories.'],
    binding('ArrowUp'),
  ),
  action(
    'nextRepository',
    'repository',
    ['Nächstes Repository', 'Next repository'],
    ['Unter den geöffneten Repositories weiterwechseln.', 'Cycle forwards through open repositories.'],
    binding('ArrowDown'),
  ),
  action(
    'commit',
    'repository',
    ['Commit erstellen', 'Create commit'],
    [
      'Commit-Bereich öffnen und vorbereitete Änderungen committen; ohne Titel die Eingabe fokussieren.',
      'Open the commit area and commit prepared changes; focus the message field if the title is empty.',
    ],
    binding('Enter'),
  ),
  action(
    'saveFile',
    'files',
    ['Datei speichern', 'Save file'],
    ['Die bearbeitete Datei im Dateibetrachter speichern.', 'Save the edited file in the file viewer.'],
    binding('s'),
  ),
] as const;

export type ShortcutActionId = (typeof SHORTCUT_ACTIONS)[number]['id'];
export type ShortcutOverrides = Partial<Record<ShortcutActionId, ShortcutBinding | null>>;
export const EMPTY_SHORTCUT_OVERRIDES: ShortcutOverrides = {};
export type ShortcutIssue = { reason: 'invalid' | 'reserved' | 'repositoryModifier' | 'conflict'; action?: ShortcutActionId };

export const normalizeShortcutKey = (key: string): string => (key === ' ' ? 'Space' : key.length === 1 ? key.toLowerCase() : key);
export const getShortcutBinding = (id: ShortcutActionId, overrides: ShortcutOverrides = EMPTY_SHORTCUT_OVERRIDES): ShortcutBinding | null =>
  overrides[id] === undefined ? SHORTCUT_ACTIONS.find((entry) => entry.id === id)!.defaultBinding : overrides[id]!;

const namedKeys = new Set([
  'Enter',
  'Space',
  'Escape',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
const isBinding = (value: unknown): value is ShortcutBinding => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const b = value as ShortcutBinding;
  if (typeof b.key !== 'string' || !['primary', 'alt', 'shift'].every((key) => typeof value[key as keyof typeof value] === 'boolean')) return false;
  const key = normalizeShortcutKey(b.key);
  return (key.length === 1 && /[\p{L}\p{N}\p{P}\p{S}]/u.test(key)) || namedKeys.has(key) || /^F([1-9]|1\d|2[0-4])$/.test(key);
};
const fingerprint = (b: ShortcutBinding) => JSON.stringify([normalizeShortcutKey(b.key), b.primary, b.alt, b.shift]);
export const findShortcutConflict = (id: ShortcutActionId, b: ShortcutBinding | null, overrides: ShortcutOverrides): ShortcutActionId | undefined =>
  b
    ? SHORTCUT_ACTIONS.find(
        (entry) => entry.id !== id && getShortcutBinding(entry.id, overrides) && fingerprint(getShortcutBinding(entry.id, overrides)!) === fingerprint(b),
      )?.id
    : undefined;

const isReservedEditorBinding = (b: ShortcutBinding): boolean => {
  const key = normalizeShortcutKey(b.key);
  // These are fixed commands from the code editor's basicSetup, including
  // text navigation, search, selection history, comments and completion.
  return (
    key === 'F3' ||
    (b.primary && !b.alt && ['b', 'd', 'e', 'i', 'k', 'l', 'm', 'n', 'o', 'p', 't', 'u', '[', ']', '/', 'Enter', 'Space'].includes(key)) ||
    (b.primary && key === '\\' && (b.alt || b.shift)) ||
    (b.primary && b.alt && ['g', '[', ']'].includes(key)) ||
    (!b.primary && b.alt && ['a', 'i', 'l', 'u', '`'].includes(key)) ||
    (!b.primary && b.alt && b.shift && key === 'm')
  );
};

export function validateShortcutBinding(id: ShortcutActionId, value: unknown): ShortcutIssue | null {
  if (value === null) return null;
  if (!isBinding(value)) return { reason: 'invalid' };
  const b = value;
  const key = normalizeShortcutKey(b.key);
  if (id === 'previousRepository' || id === 'nextRepository') {
    if (!b.primary && !b.alt) return { reason: 'repositoryModifier' };
  }
  if (!b.primary && !b.alt && !/^F\d+$/.test(key)) return { reason: 'invalid' };
  // Keep focus navigation, clipboard, search, undo and OS/window controls available.
  if (
    (id === 'saveFile' && isReservedEditorBinding(b)) ||
    ['Escape', 'Tab', 'F12'].includes(key) ||
    (b.alt && !b.primary && key === 'F4') ||
    (b.primary && !b.alt && key === 'Insert') ||
    (b.primary && !b.alt && (['a', 'c', 'x', 'v', 'z', 'y', 'h', 'g'].includes(key) || (!b.shift && key === 'f'))) ||
    (b.primary && ['q', 'w', 'r'].includes(key)) ||
    (b.primary && (b.shift || b.alt) && ['i', 'j', 'c'].includes(key)) ||
    ((id === 'saveFile' || id === 'commit') &&
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete'].includes(key))
  ) {
    return { reason: 'reserved' };
  }
  return null;
}

export function validateShortcutOverrides(value: unknown): ShortcutIssue | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { reason: 'invalid' };
  const ids = new Set<string>(SHORTCUT_ACTIONS.map((entry) => entry.id));
  for (const [id, b] of Object.entries(value)) {
    if (!ids.has(id)) return { reason: 'invalid' };
    const issue = validateShortcutBinding(id as ShortcutActionId, b);
    if (issue) return issue;
  }
  const seen = new Map<string, ShortcutActionId>();
  for (const entry of SHORTCUT_ACTIONS) {
    const b = getShortcutBinding(entry.id, value as ShortcutOverrides);
    if (!b) continue;
    const key = fingerprint(b);
    const other = seen.get(key);
    if (other) return { reason: 'conflict', action: other };
    seen.set(key, entry.id);
  }
  return null;
}

export function normalizeShortcutOverrides(value: unknown): ShortcutOverrides {
  if (validateShortcutOverrides(value)) return {};
  return Object.fromEntries(
    Object.entries(value as ShortcutOverrides).map(([id, b]) => [
      id,
      b ? { key: normalizeShortcutKey(b.key), primary: b.primary, alt: b.alt, shift: b.shift } : null,
    ]),
  );
}

type ShortcutEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
  getModifierState?: (key: string) => boolean;
};
export const shortcutFromEvent = (event: ShortcutEvent): ShortcutBinding | null => {
  if (event.isComposing || event.getModifierState?.('AltGraph') || (event.ctrlKey && event.metaKey)) return null;
  return { key: normalizeShortcutKey(event.key), primary: event.ctrlKey || event.metaKey, alt: event.altKey, shift: event.shiftKey };
};
export function matchesShortcut(event: ShortcutEvent, b: ShortcutBinding | null, allowRepeat = false): boolean {
  if (!b || event.defaultPrevented || (event.repeat && !allowRepeat)) return false;
  const pressed = shortcutFromEvent(event);
  return Boolean(pressed && fingerprint(pressed) === fingerprint(b));
}

export function formatShortcut(b: ShortcutBinding | null, language: 'de' | 'en', mac = false): string[] {
  if (!b) return [];
  const keys: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: language === 'de' ? 'Leertaste' : 'Space' };
  return [
    b.primary ? (mac ? 'Cmd' : language === 'de' ? 'Strg' : 'Ctrl') : '',
    b.alt ? 'Alt' : '',
    b.shift ? (language === 'de' ? 'Umschalt' : 'Shift') : '',
    keys[b.key] || (b.key.length === 1 ? b.key.toUpperCase() : b.key),
  ].filter(Boolean);
}
