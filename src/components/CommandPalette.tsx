import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

export type PaletteCommand = {
  id: string;
  label: string;
  keywords?: string[];
  action: () => void;
  icon?: React.ReactNode;
};

type Props = {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
};

export const CommandPalette: React.FC<Props> = ({ open, commands, onClose }) => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = commands.filter((cmd) => {
    const q = query.toLowerCase();
    if (!q) return true;
    if (cmd.label.toLowerCase().includes(q)) return true;
    return cmd.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false;
  });

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const runCommand = useCallback((cmd: PaletteCommand) => {
    cmd.action();
    onClose();
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[activeIdx]) {
      e.preventDefault();
      runCommand(filtered[activeIdx]);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          className="cmd-palette-input"
          placeholder={t('generated.components.commandpalette.search_command_e3feb446')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div ref={listRef} className="cmd-palette-list">
          {filtered.length === 0 && (
            <div className="cmd-palette-empty">{t('generated.components.commandpalette.no_matches_60e7ba98')}</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              data-idx={i}
              className={`cmd-palette-item ${i === activeIdx ? 'active' : ''}`}
              onClick={() => runCommand(cmd)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              {cmd.icon && <span className="cmd-palette-item-icon">{cmd.icon}</span>}
              <span>{cmd.label}</span>
            </button>
          ))}
        </div>
        <div className="cmd-palette-footer">
          {t('generated.components.commandpalette.arrows_navigate_enter_runs_esc_closes_73b4d914')}
        </div>
      </div>
    </div>
  );
};
