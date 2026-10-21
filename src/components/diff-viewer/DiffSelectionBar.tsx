import { useI18n } from '@/i18n';

type Props = { source: 'staged' | 'unstaged'; count: number; disabled: boolean; onApply: () => void; onClear: () => void };
export function DiffSelectionBar({ source, count, disabled, onApply, onClear }: Props) {
  const { tr } = useI18n();
  return (
    <div className="diff-selection-bar" aria-label={tr('Zeilenauswahl', 'Line selection')}>
      <div className="diff-selection-summary">
        <span role="status">
          {tr(`${count} ${count === 1 ? 'Änderung' : 'Änderungen'} ausgewählt`, `${count} ${count === 1 ? 'change' : 'changes'} selected`)}
        </span>
        <small>
          {tr(
            'Alt und Neu einer Ersetzung werden gemeinsam ausgewählt. Umschalt-Klick wählt einen Bereich.',
            'Old and new lines of a replacement are selected together. Shift-click selects a range.',
          )}
        </small>
      </div>
      <button className="diff-hunk-action-btn" disabled={disabled || !count} onClick={onApply}>
        {source === 'unstaged' ? tr('Auswahl stagen', 'Stage selection') : tr('Auswahl unstagen', 'Unstage selection')}
      </button>
      <button className="diff-hunk-action-btn" disabled={disabled || !count} onClick={onClear}>
        {tr('Auswahl aufheben', 'Clear selection')}
      </button>
    </div>
  );
}
