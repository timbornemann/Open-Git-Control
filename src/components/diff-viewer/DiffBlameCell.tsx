import type { GitFileBlameLineDto } from '../../types/git';
import type { ParsedLine } from '../../utils/diffParser';
import { useI18n } from '../../i18n';
import { formatBlameDate } from './diffViewerLabels';

type DiffBlameCellProps = {
  line: ParsedLine;
  prevLine?: ParsedLine;
  side?: 'left' | 'right';
  showBlame: boolean;
  isBlameLoading: boolean;
  blameMap: Map<number, GitFileBlameLineDto>;
  onNavigateToCommit?: (hash: string) => void;
};

export const DiffBlameCell: React.FC<DiffBlameCellProps> = ({
  line,
  prevLine,
  side = 'right',
  showBlame,
  isBlameLoading,
  blameMap,
  onNavigateToCommit,
}) => {
  const { tr } = useI18n();

  if (!showBlame) return null;

  if (side === 'left' || !line.rightNo) {
    return <div className="diff-blame-cell empty" />;
  }

  const blame = blameMap.get(line.rightNo);
  if (!blame) {
    return (
      <div className="diff-blame-cell empty">
        {isBlameLoading && <span className="spinner-mini" />}
      </div>
    );
  }

  const isUncommitted = blame.commitHash.startsWith('00000000');
  const isClickable = !!onNavigateToCommit && !isUncommitted;

  let isNew = true;
  if (prevLine?.rightNo) {
    const prevBlame = blameMap.get(prevLine.rightNo);
    if (prevBlame?.commitHash === blame.commitHash) {
      isNew = false;
    }
  }

  const cellClass = `diff-blame-cell ${isClickable ? 'clickable' : ''} ${isNew ? 'new-block' : 'sub-block'}`;
  const handleClick = () => {
    if (isClickable) {
      onNavigateToCommit?.(blame.commitHash);
    }
  };

  if (!isNew) {
    return (
      <div className={cellClass} onClick={handleClick} title={`${blame.author} - ${blame.summary}`}>
        <span className="diff-blame-dot">&bull;</span>
      </div>
    );
  }

  const displayHash = isUncommitted ? '' : blame.abbrevHash || blame.commitHash.substring(0, 8);
  const displayAuthor = isUncommitted ? tr('Nicht committet', 'Not committed yet') : blame.author;
  const displayDate = isUncommitted ? '' : formatBlameDate(blame.authorTime, tr);

  return (
    <div className={cellClass} onClick={handleClick} title={`${blame.author} - ${blame.summary}`}>
      {!isUncommitted && <span className="diff-blame-hash">{displayHash}</span>}
      <span className="diff-blame-author">{displayAuthor}</span>
      {!isUncommitted && <span className="diff-blame-date">{displayDate}</span>}
    </div>
  );
};
