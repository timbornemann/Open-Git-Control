import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type {
  AnalyticsChanges,
  AnalyticsCoupling,
  AnalyticsDetailRequest,
  AnalyticsDetails,
  RepositoryAnalyticsSnapshot,
} from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty, AnalyticsTable, count, dateLabel, percent } from './AnalyticsCharts';
import { AnalyticsHotspotHeatmap } from './AnalyticsHotspotHeatmap';

type Kind = Exclude<AnalyticsDetailRequest['kind'], 'commits'>;
type Props = {
  snapshot: RepositoryAnalyticsSnapshot;
  kind: Kind;
  onFile: (path: string, hash: string) => void;
  onPath: (path: string) => void;
};
const fallbackRows = (snapshot: RepositoryAnalyticsSnapshot, kind: Kind): AnalyticsDetails['items'] => {
  if (kind === 'comparison') return snapshot.comparison?.paths ?? [];
  if (kind === 'directories') return snapshot.directories;
  if (kind === 'coupling') return snapshot.coupling;
  return snapshot.hotspots;
};
export function AnalyticsDetailsView({ snapshot, kind, onFile, onPath }: Props) {
  const { tr } = useI18n();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AnalyticsDetails | null>(null);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setPending(true);
    void gitClient
      .getRepositoryAnalyticsDetails({ repoPath: snapshot.repoPath, snapshotId: snapshot.id, kind, offset: page * 50, limit: 50 })
      .then((result) => {
        if (active) {
          if (result.success && result.data) {
            const lastPage = Math.max(0, Math.ceil(result.data.total / 50) - 1);
            if (page > lastPage) setPage(lastPage);
            else setData(result.data);
          }
          setPending(false);
        }
      })
      .catch(() => {
        if (active) {
          setPending(false);
        }
      });
    return () => {
      active = false;
    };
  }, [snapshot.id, snapshot.savedAt, snapshot.repoPath, kind, page, retry]);
  const rows = (data?.items ?? fallbackRows(snapshot, kind).slice(page * 50, (page + 1) * 50)).filter(
    (row): row is AnalyticsChanges | AnalyticsCoupling => 'changes' in row || 'first' in row,
  );
  const total = data?.total ?? fallbackRows(snapshot, kind).length;
  const heatmap = kind === 'hotspots' || kind === 'directories';
  const headings =
    kind === 'coupling'
      ? [tr('Datei A', 'File A'), tr('Datei B', 'File B'), tr('Gemeinsame Commits', 'Shared commits'), tr('Anteil', 'Share')]
      : [
          tr(kind === 'directories' ? 'Verzeichnis' : 'Datei', kind === 'directories' ? 'Directory' : 'File'),
          tr('Änderungen', 'Changes'),
          '+ / −',
          tr('Personen', 'People'),
          tr('Letzte Änderung', 'Last change'),
          tr('Aktionen', 'Actions'),
        ];
  return (
    <>
      {heatmap ? (
        <AnalyticsHotspotHeatmap
          rows={rows.filter((row): row is AnalyticsChanges => 'changes' in row)}
          maxChanges={Math.max(0, ...(kind === 'directories' ? snapshot.directories : snapshot.hotspots).map((row) => row.changes))}
          directory={kind === 'directories'}
          onFile={onFile}
          onPath={onPath}
        />
      ) : (
        <AnalyticsTable headings={headings}>
          {rows.map((row) => {
            if ('first' in row) return <CouplingRow key={`${row.first}\0${row.second}`} row={row} onPath={onPath} />;
            return <ChangeRow key={row.path} row={row} directory={false} onFile={onFile} onPath={onPath} />;
          })}
        </AnalyticsTable>
      )}
      {!rows.length && (
        <AnalyticsEmpty>
          {pending ? tr('Details werden geladen…', 'Loading details…') : tr('Keine Einträge für diese Auswahl.', 'No entries for this selection.')}
        </AnalyticsEmpty>
      )}
      <div className="analytics-pagination">
        <span>
          {total ? `${count(page * 50 + 1)}–${count(Math.min(total, (page + 1) * 50))} / ${count(total)}` : '0'}
          {!data && total >= 100 ? ` · ${tr('gespeicherte Vorschau', 'saved preview')}` : ''}
        </span>
        <Button size="xs" disabled={page === 0 || pending} onClick={() => setPage((value) => value - 1)}>
          {tr('Zurück', 'Previous')}
        </Button>
        <Button size="xs" disabled={(page + 1) * 50 >= total || pending} onClick={() => setPage((value) => value + 1)}>
          {tr('Weiter', 'Next')}
        </Button>
        {!data && !pending && (
          <Button size="xs" onClick={() => setRetry((value) => value + 1)}>
            {tr('Details nachladen', 'Load details')}
          </Button>
        )}
      </div>
    </>
  );
}
function CouplingRow({ row, onPath }: { row: AnalyticsCoupling; onPath: Props['onPath'] }) {
  return (
    <tr>
      <td>
        <button className="analytics-link" onClick={() => onPath(row.first)}>
          {row.first}
        </button>
      </td>
      <td>
        <button className="analytics-link" onClick={() => onPath(row.second)}>
          {row.second}
        </button>
      </td>
      <td>{count(row.commits)}</td>
      <td>{percent(row.share)}</td>
    </tr>
  );
}
function ChangeRow({ row, directory, onFile, onPath }: { row: AnalyticsChanges; directory: boolean; onFile: Props['onFile']; onPath: Props['onPath'] }) {
  const { tr } = useI18n();
  return (
    <tr>
      <td title={row.path}>
        <button className="analytics-link" onClick={() => (directory ? onPath(row.path === '.' ? '' : row.path) : onFile(row.path, row.hash))}>
          {row.path}
        </button>
        {row.oldPath && <small>← {row.oldPath}</small>}
      </td>
      <td>{count(row.changes)}</td>
      <td>
        {row.binary && !row.additions && !row.deletions ? (
          tr('Binär / LFS', 'Binary / LFS')
        ) : (
          <>
            <span className="analytics-added">+{count(row.additions)}</span> / <span className="analytics-deleted">−{count(row.deletions)}</span>
          </>
        )}
      </td>
      <td>{count(row.authors)}</td>
      <td>{dateLabel(row.lastChanged)}</td>
      <td>
        <button className="analytics-link" onClick={() => onPath(row.path === '.' ? '' : row.path)}>
          {tr('Analysieren', 'Analyze')}
        </button>
      </td>
    </tr>
  );
}
