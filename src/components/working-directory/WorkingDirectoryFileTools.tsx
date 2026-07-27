import React, { useEffect, useRef, useState } from 'react';
import { Braces, ChevronDown, Minimize2, Sparkles, WrapText } from 'lucide-react';
import { useUIContext } from '@/contexts/AppStateContext';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { compactTextToSingleLine, formatJsonText, isCsvFilePath, isJsonFilePath, minifyJsonText } from './fileContentTransforms';
import '@/styles/working-directory-file-tools.css';

type Props = {
  path: string;
  text: string;
  onChange: (text: string) => void;
};

export const WorkingDirectoryFileTools: React.FC<Props> = ({ path, text, onChange }) => {
  const { tr } = useI18n();
  const { setConfirmDialog } = useUIContext();
  const showToast = useAppToast();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const isJson = isJsonFilePath(path);
  const isCsv = isCsvFilePath(path);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (isCsv) return null;

  const applyJsonTransform = (transform: (source: string) => string, successMessage: string) => {
    setOpen(false);
    try {
      const transformed = transform(text);
      onChange(transformed);
      showToast(successMessage, false);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : tr('JSON konnte nicht verarbeitet werden.', 'Could not process JSON.'), true);
    }
  };

  const requestTextCompaction = () => {
    setOpen(false);
    const compacted = compactTextToSingleLine(text);
    if (compacted === text) {
      showToast(tr('Der Text ist bereits einzeilig komprimiert.', 'The text is already compacted to one line.'), false);
      return;
    }
    setConfirmDialog({
      variant: 'danger',
      title: tr('Text auf eine Zeile komprimieren?', 'Compact text to one line?'),
      message: tr(
        'Dabei werden Leerzeilen sowie führende und nachfolgende Leerzeichen entfernt und alle übrigen Zeilen verbunden.',
        'This removes blank lines and leading or trailing whitespace, then joins all remaining lines.',
      ),
      contextItems: [
        { label: tr('Datei', 'File'), value: path },
        { label: tr('Zeichen vorher', 'Characters before'), value: text.length.toLocaleString() },
        { label: tr('Zeichen danach', 'Characters after'), value: compacted.length.toLocaleString() },
      ],
      irreversible: false,
      consequences: tr(
        'Dies kann die Bedeutung von Quellcode oder formatiertem Text verändern. Die Änderung bleibt zunächst ungespeichert und kann überprüft werden.',
        'This can change the meaning of source code or formatted text. The result remains unsaved so it can be reviewed.',
      ),
      confirmLabel: tr('Komprimieren', 'Compact'),
      onConfirm: () => {
        onChange(compacted);
        showToast(tr('Text komprimiert. Speichern zum Übernehmen.', 'Text compacted. Save to apply it.'), false);
      },
    });
  };

  return (
    <div className="working-file-tools" ref={hostRef}>
      <button
        type="button"
        className={`working-file-viewer__button${open ? ' is-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Sparkles size={14} />
        {tr('Werkzeuge', 'Tools')}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="working-file-tools__menu" role="menu" aria-label={tr('Dateiwerkzeuge', 'File tools')}>
          {isJson ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => applyJsonTransform(formatJsonText, tr('JSON formatiert. Speichern zum Übernehmen.', 'JSON formatted. Save to apply it.'))}
              >
                <Braces size={14} />
                <span>
                  <strong>{tr('JSON formatieren', 'Format JSON')}</strong>
                  <small>{tr('Lesbar mit zwei Leerzeichen einrücken', 'Indent readably with two spaces')}</small>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => applyJsonTransform(minifyJsonText, tr('JSON minifiziert. Speichern zum Übernehmen.', 'JSON minified. Save to apply it.'))}
              >
                <Minimize2 size={14} />
                <span>
                  <strong>{tr('JSON minifizieren', 'Minify JSON')}</strong>
                  <small>{tr('Unnötige Leerzeichen entfernen', 'Remove unnecessary whitespace')}</small>
                </span>
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" onClick={requestTextCompaction}>
              <WrapText size={14} />
              <span>
                <strong>{tr('Auf eine Zeile komprimieren', 'Compact to one line')}</strong>
                <small>{tr('Leerzeilen und äußere Leerzeichen entfernen', 'Remove blank lines and outer whitespace')}</small>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
