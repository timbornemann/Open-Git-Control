import { describe, expect, it } from 'vitest';
import {
  SHORTCUT_ACTIONS,
  findShortcutConflict,
  formatShortcut,
  getShortcutBinding,
  matchesShortcut,
  normalizeShortcutOverrides,
  shortcutFromEvent,
  validateShortcutBinding,
  validateShortcutOverrides,
} from './keyboardShortcuts';

const custom = { key: 'k', primary: true, alt: false, shift: true };
const event = (partial = {}) => ({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, ...partial });

describe('shared keyboard shortcuts', () => {
  it('has thirteen distinct defaults and supports legacy settings, overrides and disabling', () => {
    expect(SHORTCUT_ACTIONS).toHaveLength(13);
    expect(validateShortcutOverrides({})).toBeNull();
    expect(normalizeShortcutOverrides(undefined)).toEqual({});
    expect(getShortcutBinding('settings')?.key).toBe('4');
    expect(getShortcutBinding('fetch', { fetch: custom })).toEqual(custom);
    expect(getShortcutBinding('fetch', { fetch: null })).toBeNull();
    expect(normalizeShortcutOverrides({ fetch: { ...custom, key: 'K' }, saveFile: null })).toEqual({ fetch: custom, saveFile: null });
  });
  it('rejects collisions with defaults and overrides, and allows freeing a binding first', () => {
    const palette = getShortcutBinding('commandPalette')!;
    expect(findShortcutConflict('fetch', palette, {})).toBe('commandPalette');
    expect(validateShortcutOverrides({ fetch: palette })?.reason).toBe('conflict');
    expect(validateShortcutOverrides({ fetch: custom, quickTodo: custom })?.reason).toBe('conflict');
    expect(validateShortcutOverrides({ fetch: palette, commandPalette: null })).toBeNull();
  });
  it.each([
    ['Tab', true, false, false],
    ['Escape', false, true, false],
    ['F12', false, false, false],
    ['c', true, false, false],
    ['z', true, false, true],
    ['i', true, false, true],
    ['j', true, true, false],
    ['F4', false, true, false],
    ['r', true, false, false],
    ['Insert', true, false, false],
  ])('protects reserved key %s', (key, primary, alt, shift) => {
    expect(validateShortcutBinding('fetch', { key, primary, alt, shift })?.reason).toBe('reserved');
  });
  it('rejects malformed data and requires held modifiers for the repository switcher', () => {
    expect(validateShortcutOverrides({ unknown: custom })?.reason).toBe('invalid');
    expect(validateShortcutOverrides([])?.reason).toBe('invalid');
    expect(validateShortcutBinding('fetch', { ...custom, key: 'Control' })?.reason).toBe('invalid');
    expect(validateShortcutBinding('fetch', { ...custom, key: 'k', primary: false })?.reason).toBe('invalid');
    expect(validateShortcutBinding('nextRepository', { ...custom, key: 'F8', primary: false })?.reason).toBe('repositoryModifier');
    expect(validateShortcutBinding('fetch', { ...custom, key: 'F8', primary: false })).toBeNull();
    expect(validateShortcutBinding('saveFile', getShortcutBinding('nextRepository'))?.reason).toBe('reserved');
    expect(validateShortcutBinding('saveFile', custom)?.reason).toBe('reserved');
    expect(normalizeShortcutOverrides({ fetch: { ...custom, shift: 'true' } })).toEqual({});
  });
  it('matches exact modifiers across Ctrl/Cmd, normalizes case and excludes consumed/repeat/IME events', () => {
    expect(matchesShortcut(event({ key: 'K' }), custom)).toBe(true);
    expect(matchesShortcut(event({ ctrlKey: false, metaKey: true }), custom)).toBe(true);
    for (const extra of [
      { altKey: true },
      { shiftKey: false },
      { isComposing: true },
      { defaultPrevented: true },
      { repeat: true },
      { ctrlKey: true, metaKey: true },
      { getModifierState: () => true },
    ]) {
      expect(matchesShortcut(event(extra), custom)).toBe(false);
    }
    expect(matchesShortcut(event({ repeat: true }), custom, true)).toBe(true);
    expect(matchesShortcut(event(), null)).toBe(false);
    expect(shortcutFromEvent(event({ isComposing: true }))).toBeNull();
  });
  it('formats German, English and macOS labels', () => {
    expect(formatShortcut(custom, 'de')).toEqual(['Strg', 'Umschalt', 'K']);
    expect(formatShortcut(custom, 'en', true)).toEqual(['Cmd', 'Shift', 'K']);
    expect(formatShortcut(getShortcutBinding('nextRepository'), 'en')).toEqual(['Ctrl', '↓']);
    expect(formatShortcut(null, 'de')).toEqual([]);
  });
});
