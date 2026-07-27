import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useUIContext } from '@/contexts/AppStateContext';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { TextFileEncodingDto, WorkingDirectoryFileInfoDto } from '@/shared/ipc/contracts/git';
import { copyTextToClipboard } from '@/utils/clipboard';
import type { LineEnding } from '@/utils/lineEndings';
import { compactTextToSingleLine, getJsonPathAtOffset } from './fileContentTransforms';
import { validateJsonWithSchema, validateYamlText } from './structuredContentTransforms';
import { addToLines, replaceTextSelection, selectedTextOrDocument, type TextSelection } from './textContentTransforms';
import { textEncodingLabel } from './WorkingDirectoryFileStatusBar';
import { WorkingDirectoryFileToolsMenu } from './WorkingDirectoryFileToolsMenu';
import { buildWorkingDirectoryFileToolGroups } from './workingDirectoryFileToolGroups';
import '@/styles/working-directory-file-tools.css';

type Props = {
  repoPath?: string;
  path: string;
  text: string;
  selection?: TextSelection;
  encoding?: TextFileEncodingDto;
  lineEnding?: LineEnding;
  showWhitespace?: boolean;
  onChange: (text: string) => void;
  onEncodingChange?: (encoding: TextFileEncodingDto) => void;
  onLineEndingChange?: (lineEnding: LineEnding) => void;
  onShowWhitespaceChange?: (show: boolean) => void;
};

type FileHashes = NonNullable<WorkingDirectoryFileInfoDto['hashes']>;
type HashAlgorithm = keyof FileHashes;

export const WorkingDirectoryFileTools: React.FC<Props> = ({
  repoPath = '',
  path,
  text,
  selection = { from: 0, to: 0 },
  encoding = 'utf8',
  lineEnding = '\n',
  showWhitespace = false,
  onChange,
  onEncodingChange = () => undefined,
  onLineEndingChange = () => undefined,
  onShowWhitespaceChange = () => undefined,
}) => {
  const { tr } = useI18n();
  const { setConfirmDialog, setInputDialog } = useUIContext();
  const showToast = useAppToast();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setActiveGroup(null);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setActiveGroup(null);
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    setActiveGroup(null);
  };

  const applyTransform = (transform: (source: string) => string | Promise<string>, successMessage: string) => {
    closeMenu();
    const commit = (transformed: string) => {
      if (transformed === text) {
        showToast(tr('Keine Änderung erforderlich.', 'No change was needed.'), false);
        return;
      }
      onChange(transformed);
      showToast(successMessage, false);
    };
    const reportError = (error: unknown) => {
      showToast(error instanceof Error ? error.message : tr('Datei konnte nicht verarbeitet werden.', 'Could not process the file.'), true);
    };
    try {
      const transformed = transform(text);
      if (typeof transformed === 'string') commit(transformed);
      else void transformed.then(commit).catch(reportError);
    } catch (error: unknown) {
      reportError(error);
    }
  };

  const applySelectionTransform = (transform: (source: string) => string, successMessage: string) => {
    const target = selectedTextOrDocument(text, selection);
    closeMenu();
    try {
      onChange(replaceTextSelection(text, target.selection, transform(target.value)));
      showToast(successMessage, false);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : tr('Text konnte nicht verarbeitet werden.', 'Could not process the text.'), true);
    }
  };

  const requestLineAffixes = () => {
    closeMenu();
    setInputDialog({
      title: tr('Präfix/Suffix pro Zeile', 'Prefix/suffix per line'),
      message: tr('Die Werte werden an jede Zeile angefügt.', 'The values are applied to every line.'),
      fields: [
        { id: 'prefix', label: tr('Präfix', 'Prefix') },
        { id: 'suffix', label: tr('Suffix', 'Suffix') },
      ],
      contextItems: [{ label: tr('Datei', 'File'), value: path }],
      irreversible: false,
      consequences: tr('Die Änderung bleibt bis zum Speichern im Editor.', 'The change remains in the editor until saved.'),
      confirmLabel: tr('Anwenden', 'Apply'),
      onSubmit: (values) => {
        onChange(addToLines(text, values.prefix || '', values.suffix || ''));
        showToast(tr('Präfix/Suffix ergänzt.', 'Prefix/suffix added.'), false);
      },
    });
  };

  const requestTextCompaction = () => {
    closeMenu();
    const compacted = compactTextToSingleLine(text);
    if (compacted === text) {
      showToast(tr('Der Text ist bereits einzeilig komprimiert.', 'The text is already compacted to one line.'), false);
      return;
    }
    setConfirmDialog({
      variant: 'danger',
      title: tr('Text auf eine Zeile komprimieren?', 'Compact text to one line?'),
      message: tr(
        'Leerzeilen und äußere Leerzeichen werden entfernt, danach werden die Zeilen verbunden.',
        'Blank lines and outer whitespace are removed, then the lines are joined.',
      ),
      contextItems: [{ label: tr('Datei', 'File'), value: path }],
      irreversible: false,
      consequences: tr(
        'Dies kann die Bedeutung von Quellcode ändern. Das Ergebnis bleibt zunächst ungespeichert.',
        'This can change the meaning of source code. The result initially remains unsaved.',
      ),
      confirmLabel: tr('Komprimieren', 'Compact'),
      onConfirm: () => {
        onChange(compacted);
        showToast(tr('Text komprimiert.', 'Text compacted.'), false);
      },
    });
  };

  const requestSchemaValidation = () => {
    closeMenu();
    setInputDialog({
      title: tr('Mit JSON-Schema validieren', 'Validate with JSON Schema'),
      message: tr('Füge das JSON-Schema ein, gegen das die Datei geprüft werden soll.', 'Paste the JSON Schema to validate this file against.'),
      fields: [{ id: 'schema', label: 'JSON Schema', required: true, multiline: true, rows: 12, defaultValue: '{\n  "type": "object"\n}' }],
      contextItems: [{ label: tr('Datei', 'File'), value: path }],
      irreversible: false,
      consequences: tr('Die Datei wird nur geprüft und nicht verändert.', 'The file is only validated and is not changed.'),
      confirmLabel: tr('Validieren', 'Validate'),
      onSubmit: async (values) => {
        try {
          const errors = await validateJsonWithSchema(text, values.schema || '');
          if (errors.length === 0) {
            showToast(tr('JSON entspricht dem Schema.', 'JSON matches the schema.'), false);
            return;
          }
          setConfirmDialog({
            variant: 'confirm',
            title: tr('Schema-Validierung fehlgeschlagen', 'Schema validation failed'),
            message: tr(`${errors.length} Problem(e) gefunden.`, `${errors.length} issue(s) found.`),
            contextItems: errors.slice(0, 12).map((error, index) => ({ label: `#${index + 1}`, value: error })),
            irreversible: false,
            consequences: errors.length > 12 ? tr('Nur die ersten 12 Probleme werden angezeigt.', 'Only the first 12 issues are shown.') : '',
            confirmLabel: tr('Schließen', 'Close'),
            onConfirm: () => undefined,
          });
        } catch (error: unknown) {
          showToast(error instanceof Error ? error.message : tr('Validierung fehlgeschlagen.', 'Validation failed.'), true);
        }
      },
    });
  };

  const copyJsonPath = async () => {
    closeMenu();
    try {
      const jsonPath = getJsonPathAtOffset(text, selection.from);
      const copied = await copyTextToClipboard(jsonPath);
      showToast(
        copied
          ? tr(`JSON-Pfad kopiert: ${jsonPath}`, `Copied JSON path: ${jsonPath}`)
          : tr('JSON-Pfad konnte nicht kopiert werden.', 'Could not copy the JSON path.'),
        !copied,
      );
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : tr('JSON-Pfad konnte nicht ermittelt werden.', 'Could not determine the JSON path.'), true);
    }
  };

  const loadSavedHashes = async (): Promise<FileHashes | null> => {
    const result = await gitClient.getWorkingDirectoryFileInfo(path, repoPath);
    if (!result.success || !result.data?.hashes) {
      showToast(result.data?.hashError || result.error || tr('Hashwerte konnten nicht berechnet werden.', 'Could not calculate hashes.'), true);
      return null;
    }
    return result.data.hashes;
  };

  const copyHashes = async (hashes: FileHashes, algorithm?: HashAlgorithm): Promise<void> => {
    const labels: Record<HashAlgorithm, string> = { sha256: 'SHA-256', sha1: 'SHA-1', md5: 'MD5' };
    const value = algorithm ? hashes[algorithm] : (Object.keys(labels) as HashAlgorithm[]).map((key) => `${labels[key]}: ${hashes[key]}`).join('\n');
    const copied = await copyTextToClipboard(value);
    const targetLabel = algorithm ? labels[algorithm] : tr('Alle Hashwerte', 'All hashes');
    showToast(
      copied ? tr(`${targetLabel} kopiert.`, `${targetLabel} copied.`) : tr(`${targetLabel} konnte nicht kopiert werden.`, `Could not copy ${targetLabel}.`),
      !copied,
    );
  };

  const copySavedHashes = async (algorithm?: HashAlgorithm) => {
    closeMenu();
    const hashes = await loadSavedHashes();
    if (hashes) await copyHashes(hashes, algorithm);
  };

  const showHashes = async () => {
    closeMenu();
    const hashes = await loadSavedHashes();
    if (!hashes) return;
    setConfirmDialog({
      variant: 'confirm',
      title: tr('Hashwerte der gespeicherten Datei', 'Hashes of the saved file'),
      message: tr('Die Werte beziehen sich auf die aktuellen Bytes auf dem Datenträger.', 'These values refer to the current bytes on disk.'),
      contextItems: [
        { label: 'SHA-256', value: hashes.sha256 },
        { label: 'SHA-1', value: hashes.sha1 },
        { label: 'MD5', value: hashes.md5 },
      ],
      irreversible: false,
      consequences: tr('Ungespeicherte Änderungen sind nicht enthalten.', 'Unsaved changes are not included.'),
      confirmLabel: tr('Schließen', 'Close'),
      secondaryActionLabel: tr('Alle kopieren', 'Copy all'),
      secondaryActionVariant: 'default',
      onConfirm: () => undefined,
      onSecondaryAction: () => copyHashes(hashes),
    });
  };

  const setTargetEncoding = (target: TextFileEncodingDto) => {
    closeMenu();
    if (target === 'latin1' && [...text].some((character) => (character.codePointAt(0) || 0) > 0xff)) {
      showToast(tr('Der Text enthält Zeichen, die Latin-1 nicht darstellen kann.', 'The text contains characters that Latin-1 cannot represent.'), true);
      return;
    }
    onEncodingChange(target);
    showToast(
      tr(`Ziel-Encoding: ${textEncodingLabel(target)}. Speichern zum Übernehmen.`, `Target encoding: ${textEncodingLabel(target)}. Save to apply.`),
      false,
    );
  };

  const groups = buildWorkingDirectoryFileToolGroups({
    path,
    selection,
    encoding,
    lineEnding,
    showWhitespace,
    tr,
    applyTransform,
    applySelectionTransform,
    requestLineAffixes,
    requestTextCompaction,
    copyJsonPath: () => void copyJsonPath(),
    requestSchemaValidation,
    validateYaml: async () => {
      closeMenu();
      try {
        await validateYamlText(text);
        showToast(tr('YAML ist gültig.', 'YAML is valid.'), false);
      } catch (error: unknown) {
        showToast(error instanceof Error ? error.message : tr('YAML ist ungültig.', 'YAML is invalid.'), true);
      }
    },
    setTargetEncoding,
    setTargetLineEnding: (target) => {
      closeMenu();
      onLineEndingChange(target);
    },
    toggleWhitespace: () => {
      closeMenu();
      onShowWhitespaceChange(!showWhitespace);
    },
    showHashes: () => void showHashes(),
    copyHash: (algorithm) => void copySavedHashes(algorithm),
    copyAllHashes: () => void copySavedHashes(),
  });

  return (
    <div className="working-file-tools" ref={hostRef}>
      <button
        type="button"
        className={`working-file-viewer__button${open ? ' is-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setActiveGroup(null);
        }}
      >
        <Sparkles size={14} />
        {tr('Werkzeuge', 'Tools')}
        <ChevronDown size={12} />
      </button>
      {open && (
        <WorkingDirectoryFileToolsMenu
          groups={groups}
          activeGroup={activeGroup}
          ariaLabel={tr('Dateiwerkzeuge', 'File tools')}
          backLabel={tr('Zurück zu allen Werkzeugen', 'Back to all tools')}
          onGroupChange={setActiveGroup}
        />
      )}
    </div>
  );
};
