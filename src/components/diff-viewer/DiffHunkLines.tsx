import type { CSSProperties } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { ParsedHunk, ParsedLine } from '@/shared/diff/parser';
import { hunkSelectionUnits, pairedDiffRows } from '@/shared/diff/lineSelection';
import type { GitFileBlameLineDto } from '@/types/git';
import { useDiffSyntaxHighlighting } from '@/hooks/useDiffSyntaxHighlighting';
import { useI18n } from '@/i18n';
import { DiffBlameCell } from './DiffBlameCell';
import { MAX_SINGLE_LINE_LENGTH } from './diffViewerConstants';

export type DiffLineSelectionControls = {
  operation: 'stage' | 'unstage';
  selected: ReadonlySet<string>;
  disabled: boolean;
  toggle: (id: string, range: boolean) => void;
};
type Props = {
  hunk: ParsedHunk;
  sideBySide: boolean;
  showBlame: boolean;
  isBlameLoading: boolean;
  blameMap: Map<number, GitFileBlameLineDto>;
  onNavigateToCommit?: (hash: string) => void;
  selection?: DiffLineSelectionControls;
};
export function DiffHunkLines({ hunk, sideBySide, selection, ...blame }: Props) {
  const { tr } = useI18n();
  const { highlightLine } = useDiffSyntaxHighlighting();
  const units = hunkSelectionUnits(hunk);
  const byRow = new Map(units.flatMap((unit) => unit.rowIndices.map((index) => [index, unit.id] as const)));
  const code = (text: string) => (
    <span className="diff-code" title={text}>
      {highlightLine(text.length > MAX_SINGLE_LINE_LENGTH ? text.slice(0, MAX_SINGLE_LINE_LENGTH) + ' ...' : text)}
    </span>
  );
  const gutter = (line: ParsedLine | null, id?: string) =>
    !selection ? null : (
      <span className="diff-selection-gutter">
        {id && line && (
          <button
            type="button"
            className="diff-line-action"
            aria-pressed={selection.selected.has(id)}
            disabled={selection.disabled}
            aria-label={tr(
              `Änderung zum ${selection.operation === 'stage' ? 'Stagen' : 'Unstagen'} auswählen: ${line.type === 'del' ? 'alte' : 'neue'} Zeile ${line.leftNo ?? line.rightNo}`,
              `Select change for ${selection.operation === 'stage' ? 'staging' : 'unstaging'}: ${line.type === 'del' ? 'old' : 'new'} line ${line.leftNo ?? line.rightNo}`,
            )}
            title={selection.operation === 'stage' ? tr('Zum Stagen auswählen', 'Select for staging') : tr('Zum Unstagen auswählen', 'Select for unstaging')}
            onClick={(event) => selection.toggle(id, event.shiftKey)}
          >
            {selection.operation === 'stage' ? <Plus size={12} aria-hidden="true" /> : <Minus size={12} aria-hidden="true" />}
          </button>
        )}
      </span>
    );
  const blameCell = (line: ParsedLine | null, prevLine: ParsedLine | undefined, side: 'left' | 'right') => (
    <DiffBlameCell {...blame} line={line ?? { type: 'context', text: '', leftNo: null, rightNo: null }} prevLine={prevLine} side={side} />
  );
  const style = (sbs: boolean): CSSProperties | undefined => {
    if (!selection && !blame.showBlame) return undefined;
    return { gridTemplateColumns: `${blame.showBlame ? (sbs ? '180px ' : '220px ') : ''}${selection ? '28px ' : ''}${sbs ? '' : '52px '}52px minmax(0, 1fr)` };
  };
  if (!sideBySide)
    return (
      <>
        {hunk.rows.map((line, index) => {
          const id = byRow.get(index);
          return (
            <div
              key={index}
              className={`diff-line ${line.type === 'context' ? 'ctx' : line.type}${id && selection?.selected.has(id) ? ' diff-line-selected' : ''}`}
              style={style(false)}
            >
              {blameCell(line, hunk.rows[index - 1], 'right')}
              {gutter(line, id)}
              <span className="diff-lineno">{line.leftNo ?? ''}</span>
              <span className="diff-lineno">{line.rightNo ?? ''}</span>
              {code(line.text)}
            </div>
          );
        })}
      </>
    );
  const rows = pairedDiffRows(hunk);
  return (
    <>
      {rows.map((row, index) => (
        <div key={index} className={`diff-sbs-row${row.selectionId && selection?.selected.has(row.selectionId) ? ' diff-line-selected' : ''}`}>
          {(['left', 'right'] as const).map((side) => {
            const line = row[side];
            return (
              <div key={side} className={`diff-sbs-cell ${!line ? 'empty' : line.type === 'context' ? 'ctx' : line.type}`} style={style(true)}>
                {blameCell(line, rows[index - 1]?.[side] ?? undefined, side)}
                {gutter(line, row.selectionId)}
                <span className="diff-lineno">{(side === 'left' ? line?.leftNo : line?.rightNo) ?? ''}</span>
                {code(line?.text ?? '')}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
