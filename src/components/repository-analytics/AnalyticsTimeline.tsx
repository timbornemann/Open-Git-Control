import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { FileTimelineView } from '@/components/FileTimelineView';
import { useI18n } from '@/i18n';
import type { AnalyticsFilters, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty } from './AnalyticsCharts';
import { loadAnalyticsTimeline, readAnalyticsTimeline, timelineContextKey, TIMELINE_LIMIT, type TimelineReport } from './analyticsTimelineData';
import './analyticsTimeline.css';

type Props = { repoPath: string; snapshot: RepositoryAnalyticsSnapshot | null; filters: AnalyticsFilters; running: boolean };
export function AnalyticsTimeline({ repoPath, snapshot, filters, running }: Props) {
  const { tr } = useI18n();
  const context = timelineContextKey(repoPath, filters);
  const [report, setReport] = useState<{ context: string; data: TimelineReport } | null>(() => {
    const data = snapshot && readAnalyticsTimeline(snapshot, filters);
    return data ? { context, data } : null;
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const source = snapshot?.project.oid || snapshot?.head || '';
  const input = useRef({ snapshot, filters });
  input.current = { snapshot, filters };
  useEffect(() => {
    const { snapshot, filters } = input.current;
    if (!snapshot) return;
    let active = true;
    setError('');
    setLoading(true);
    void loadAnalyticsTimeline(snapshot, filters).then(
      (data) => {
        if (!active) return;
        setReport((previous) => (previous?.context === context && previous.data === data ? previous : { context, data }));
        setLoading(false);
      },
      (failure: unknown) => {
        if (!active) return;
        setLoading(false);
        // A saved main report may not have its filtered details hydrated yet. Retry when analytics becomes ready.
        if (!running) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      active = false;
    };
    // The immutable source/filter identifiers determine validity; unrelated aggregate updates do not reload history.
  }, [repoPath, context, source, snapshot?.id, snapshot?.savedAt, running, retry]);
  const data = report?.context === context ? report.data : null;
  return (
    <section className="analytics-timeline">
      <div className="analytics-timeline-heading">
        <div>
          <h3>Timeline</h3>
          <p>
            {tr(
              'Dateibaum entlang der ersten Elternlinie des Projektstands. Filter bestimmen die angezeigten Commits.',
              'File tree along the project tree’s first-parent history. Filters determine the displayed commits.',
            )}
          </p>
        </div>
        {source && <code title={source}>{source.slice(0, 8)}</code>}
      </div>
      {error && (
        <div className="analytics-timeline-error" role="alert">
          <span>{tr('Die Timeline konnte nicht geladen werden.', 'The timeline could not be loaded.')}</span>
          <Button size="xs" onClick={() => setRetry((value) => value + 1)}>
            {tr('Erneut versuchen', 'Retry')}
          </Button>
          <details>
            <summary>{tr('Technische Details', 'Technical details')}</summary>
            <pre>{error}</pre>
          </details>
        </div>
      )}
      {data ? (
        <>
          {data.commits.length === TIMELINE_LIMIT && (
            <p className="analytics-timeline-limit">
              {tr('Die Timeline zeigt die letzten 5.000 Commits dieser Elternlinie.', 'The timeline shows the latest 5,000 commits on this parent line.')}
            </p>
          )}
          <FileTimelineView
            key={context}
            commits={data.commits}
            visibleCommitHashes={data.visibleCommitHashes}
            pathFilter={filters.path}
            contextKey={context}
          />
        </>
      ) : (
        <AnalyticsEmpty>
          {loading || running ? tr('Timeline wird geladen…', 'Loading timeline…') : tr('Noch keine Timeline verfügbar.', 'No timeline available yet.')}
        </AnalyticsEmpty>
      )}
    </section>
  );
}
