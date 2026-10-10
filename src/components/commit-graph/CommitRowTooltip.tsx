import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Files } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { GitCommit } from '@/utils/gitParsing';
import { formatDateTime } from '@/utils/dateTime';
import './commitRowTooltip.css';

type Props = {
  id: string;
  anchor: HTMLDivElement;
  commit: GitCommit;
  refs: string[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

export function CommitRowTooltip({ id, anchor, commit, refs, onMouseEnter, onMouseLeave }: Props) {
  const { tr, t, locale } = useI18n();
  const tooltip = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      const subject = anchor.querySelector('.commit-subject')?.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = tooltip.current!;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, subject?.left ?? rect.left));
      const below = rect.bottom + 6;
      const top = Math.max(12, Math.min(window.innerHeight - height - 12, below + height + 12 <= window.innerHeight ? below : rect.top - height - 6));
      setPosition((previous) => (previous.left === left && previous.top === top ? previous : { left, top }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    observer.observe(tooltip.current!);
    return () => observer.disconnect();
  }, [anchor, commit]);

  return createPortal(
    <div ref={tooltip} id={id} role="tooltip" className="commit-row-tooltip" style={position} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <strong className="commit-row-tooltip-title">{commit.subject}</strong>
      <dl>
        <div>
          <dt>{tr('Autor', 'Author')}</dt>
          <dd>{commit.author}</dd>
        </div>
        <div>
          <dt>{tr('Datum', 'Date')}</dt>
          <dd>{formatDateTime(commit.date, locale, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
        </div>
        <div>
          <dt>Commit</dt>
          <dd className="commit-row-tooltip-hash">{commit.hash}</dd>
        </div>
        {refs.length > 0 && (
          <div>
            <dt>{tr('Branches / Tags', 'Branches / tags')}</dt>
            <dd>{refs.join(' · ')}</dd>
          </div>
        )}
      </dl>
      {commit.stats ? (
        <div className="commit-row-tooltip-stats" role="img" aria-label={t('generated.components.commit_graph.commitgraph.change_summary', commit.stats)}>
          <span aria-hidden="true">
            <Files size={14} />
            {commit.stats.files} {tr('Dateien', 'files')}
          </span>
          <span className="commit-stats-additions" aria-hidden="true">
            +{commit.stats.additions}
          </span>
          <span className="commit-stats-deletions" aria-hidden="true">
            −{commit.stats.deletions}
          </span>
        </div>
      ) : (
        <span className="commit-row-tooltip-loading">
          {t('generated.components.commit_graph.commitgraph.commit_statistics_are_loading_in_the_background_e5b6b683')}
        </span>
      )}
    </div>,
    document.body,
  );
}
