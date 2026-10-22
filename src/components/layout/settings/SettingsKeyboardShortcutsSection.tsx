import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { beginShortcutCapture } from '@/hooks/keyboardShortcutRuntime';
import {
  EMPTY_SHORTCUT_OVERRIDES,
  SHORTCUT_ACTIONS,
  findShortcutConflict,
  formatShortcut,
  getShortcutBinding,
  normalizeShortcutKey,
  shortcutFromEvent,
  validateShortcutBinding,
  type ShortcutActionId,
  type ShortcutBinding,
  type ShortcutOverrides,
} from '@/shared/keyboardShortcuts';
import { SettingsSection, type SettingsSectionProps } from './SettingsSectionPrimitives';
import './settingsKeyboardShortcuts.css';

export function SettingsKeyboardShortcutsSection({ settings, onUpdateSettings, variant, visible = true }: SettingsSectionProps & { visible?: boolean }) {
  const { tr } = useI18n();
  const language = settings.language;
  const mac = /Mac/i.test(navigator.platform);
  const overrides = settings.keyboardShortcuts ?? EMPTY_SHORTCUT_OVERRIDES;
  const [recording, setRecording] = useState<ShortcutActionId | null>(null);
  const [saving, setSaving] = useState<ShortcutActionId | 'all' | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ShortcutActionId | 'all', string>>>({});
  const savingRef = useRef(false);
  const recorderRef = useRef<HTMLInputElement>(null);
  const changeButtons = useRef<Partial<Record<ShortcutActionId, HTMLButtonElement | null>>>({});
  const restoreFocus = useRef<ShortcutActionId | null>(null);
  const label = (id: ShortcutActionId) => SHORTCUT_ACTIONS.find((entry) => entry.id === id)!.label[language === 'de' ? 0 : 1];

  useEffect(() => {
    if (recording || saving || !restoreFocus.current || !visible) return;
    changeButtons.current[restoreFocus.current]?.focus({ preventScroll: true });
    restoreFocus.current = null;
  }, [recording, saving, visible]);

  const persist = useCallback(
    async (id: ShortcutActionId | 'all', next: ShortcutOverrides) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(id);
      setErrors({});
      try {
        const result = await onUpdateSettings({ keyboardShortcuts: next });
        if (result && !result.success) throw new Error(result.error);
      } catch (failure) {
        setErrors({
          [id]: `${tr('Tastenkürzel konnte nicht gespeichert werden.', 'Could not save shortcut.')} ${failure instanceof Error ? failure.message : String(failure)}`,
        });
      } finally {
        savingRef.current = false;
        setSaving(null);
      }
    },
    [onUpdateSettings, tr],
  );

  const check = useCallback(
    (id: ShortcutActionId, b: ShortcutBinding | null): string | null => {
      const issue = validateShortcutBinding(id, b);
      if (issue?.reason === 'reserved')
        return tr(
          'Diese Kombination ist für die Standardbedienung oder das System reserviert.',
          'This combination is reserved for standard controls or the system.',
        );
      if (issue?.reason === 'repositoryModifier')
        return tr('Für den Repository-Wechsel Strg/Cmd oder Alt verwenden.', 'Use Ctrl/Cmd or Alt for repository switching.');
      if (issue)
        return tr('Strg/Cmd oder Alt mit einer Taste verwenden, alternativ eine Funktionstaste.', 'Use Ctrl/Cmd or Alt with a key, or a function key.');
      const conflict = findShortcutConflict(id, b, overrides);
      if (conflict) {
        const entry = SHORTCUT_ACTIONS.find((item) => item.id === conflict)!;
        return tr(
          `Bereits belegt durch „${entry.label[0]}“. Entferne zuerst diese Belegung.`,
          `Already assigned to “${entry.label[1]}”. Remove that binding first.`,
        );
      }
      return null;
    },
    [overrides, tr],
  );

  useEffect(() => {
    if (!visible) setRecording(null);
    if (!recording || !visible) return;
    const release = beginShortcutCapture();
    recorderRef.current?.focus();
    let pending: ShortcutBinding | null = null;
    const cancel = () => setRecording(null);
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        cancel();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        restoreFocus.current = recording;
        cancel();
        return;
      }
      if (event.repeat || ['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return;
      const b = shortcutFromEvent(event);
      const error = b ? check(recording, b) : tr('Diese Eingabe kann nicht als Tastenkürzel verwendet werden.', 'This input cannot be used as a shortcut.');
      pending = error ? null : b;
      setErrors(error ? { [recording]: error } : {});
    };
    const up = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!pending || normalizeShortcutKey(event.key) !== pending.key) return;
      const next = { ...overrides, [recording]: pending };
      restoreFocus.current = recording;
      cancel();
      void persist(recording, next);
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', cancel);
    return () => {
      release();
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', cancel);
    };
  }, [recording, visible, overrides, check, persist, tr]);

  const reset = (id: ShortcutActionId) => {
    const error = check(id, getShortcutBinding(id));
    if (error) {
      setErrors({ [id]: error });
      return;
    }
    const next = { ...overrides };
    delete next[id];
    void persist(id, next);
  };
  const groups = [
    { id: 'navigation', title: tr('Navigation', 'Navigation'), scope: tr('Appweit, außerhalb von Eingabefeldern', 'Throughout the app, outside input fields') },
    {
      id: 'repository',
      title: tr('Repository-Aktionen', 'Repository actions'),
      scope: tr('Im aktiven Repository; Commit nur in der Commit-Eingabe', 'In the active repository; commit only in commit fields'),
    },
    { id: 'files', title: tr('Dateibearbeitung', 'File editing'), scope: tr('Im Dateibetrachter und Codeeditor', 'In the file viewer and code editor') },
  ];

  return (
    <SettingsSection
      group="keyboard-shortcuts"
      variant={variant}
      actions={
        <Button
          size="xs"
          icon={<RotateCcw size={13} />}
          disabled={saving !== null || recording !== null || !Object.keys(overrides).length}
          onClick={() => void persist('all', {})}
        >
          {tr('Alle zurücksetzen', 'Reset all')}
        </Button>
      }
    >
      <p className="shortcuts-intro">
        <Keyboard size={15} aria-hidden="true" />
        {tr(
          'Ändern anklicken und die gewünschte Kombination drücken. Änderungen werden sofort gespeichert.',
          'Click Change and press the desired combination. Changes are saved immediately.',
        )}
      </p>
      {errors.all && (
        <p className="shortcuts-error" role="alert">
          {errors.all}
        </p>
      )}
      {groups.map((group) => (
        <div className="shortcuts-group" key={group.id} role="group" aria-labelledby={`shortcuts-${group.id}`}>
          <div className="shortcuts-group-heading">
            <h4 id={`shortcuts-${group.id}`}>{group.title}</h4>
            <p>{group.scope}</p>
          </div>
          {SHORTCUT_ACTIONS.filter((entry) => entry.group === group.id).map((entry) => {
            const b = getShortcutBinding(entry.id, overrides);
            const editing = recording === entry.id;
            const name = label(entry.id);
            const errorId = `shortcut-${entry.id}-error`;
            return (
              <div className={`shortcut-row${editing ? ' shortcut-row--recording' : ''}`} key={entry.id} data-shortcut={entry.id}>
                <div className="shortcut-description">
                  <strong>{name}</strong>
                  <small>{entry.description[language === 'de' ? 0 : 1]}</small>
                </div>
                <div className="shortcut-controls">
                  {editing ? (
                    <input
                      ref={recorderRef}
                      className="ui-field ui-field--sm shortcut-recorder"
                      readOnly
                      aria-label={tr(`Tastenkürzel für ${name} aufnehmen`, `Record shortcut for ${name}`)}
                      aria-describedby={errors[entry.id] ? errorId : undefined}
                      aria-invalid={Boolean(errors[entry.id])}
                      value={tr('Tastenkombination drücken …', 'Press a key combination …')}
                      onBlur={() => setRecording(null)}
                    />
                  ) : (
                    <span className="shortcut-binding" aria-label={b ? formatShortcut(b, language, mac).join('+') : tr('Nicht belegt', 'Unassigned')}>
                      {b ? (
                        formatShortcut(b, language, mac).map((key, index) => <kbd key={`${index}-${key}`}>{key}</kbd>)
                      ) : (
                        <span className="shortcut-unassigned">{tr('Nicht belegt', 'Unassigned')}</span>
                      )}
                    </span>
                  )}
                  <div className="shortcut-actions">
                    <Button
                      ref={(element) => {
                        changeButtons.current[entry.id] = element;
                      }}
                      size="xs"
                      disabled={saving !== null}
                      aria-label={
                        editing
                          ? tr(`Aufnahme für ${name} abbrechen`, `Cancel recording for ${name}`)
                          : tr(`Tastenkürzel für ${name} ändern`, `Change shortcut for ${name}`)
                      }
                      onClick={() => {
                        setErrors({});
                        setRecording(editing ? null : entry.id);
                      }}
                    >
                      {editing ? tr('Abbrechen', 'Cancel') : tr('Ändern', 'Change')}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={saving !== null || recording !== null || b === null}
                      aria-label={tr(`Tastenkürzel für ${name} entfernen`, `Remove shortcut for ${name}`)}
                      onClick={() => void persist(entry.id, { ...overrides, [entry.id]: null })}
                    >
                      {tr('Entfernen', 'Remove')}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={saving !== null || recording !== null || overrides[entry.id] === undefined}
                      aria-label={tr(`Tastenkürzel für ${name} zurücksetzen`, `Reset shortcut for ${name}`)}
                      onClick={() => reset(entry.id)}
                    >
                      {tr('Zurücksetzen', 'Reset')}
                    </Button>
                  </div>
                </div>
                {errors[entry.id] && (
                  <p id={errorId} className="shortcuts-error" role="alert">
                    {errors[entry.id]}
                  </p>
                )}
                {saving === entry.id && (
                  <p className="shortcut-status" role="status">
                    {tr('Wird gespeichert …', 'Saving …')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <p>
        {tr(
          'Repository-Wechsel: Modifikator gedrückt halten, durch die Auswahl wechseln und zum Bestätigen loslassen. Escape bricht ab.',
          'Repository switching: hold the modifier, cycle through the selection and release to confirm. Escape cancels.',
        )}
      </p>
      <p>
        {tr(
          'Tab, Enter, Escape sowie Zwischenablage und normale Editor-Bedienung behalten ihre Standardfunktion.',
          'Tab, Enter, Escape, clipboard and normal editor controls keep their standard behavior.',
        )}
      </p>
    </SettingsSection>
  );
}
