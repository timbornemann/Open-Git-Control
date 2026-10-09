import { useCallback, useEffect, useState } from 'react';
import { SegmentedControl, TextField } from '@/components/ui';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import type { AnalyticsFilters, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { changeAnalyticsFilters, rememberAnalyticsSnapshot, useAnalyticsFilters } from './analyticsWorkspaceState';
import { useRepositoryAnalytics } from './useRepositoryAnalytics';
import { usePublishAnalyticsToolbar } from './analyticsToolbarState';
import { AnalyticsOverview } from './AnalyticsOverview';
import { AnalyticsContributions, periodRange } from './AnalyticsActivity';
import { AnalyticsChurn } from './AnalyticsChurn';
import { AnalyticsDetailsView } from './AnalyticsDetails';
import { AnalyticsEmpty, count } from './AnalyticsCharts';
import { analyticsSections, selectAnalyticsTab, useAnalyticsTab, type AnalyticsTab } from './analyticsNavigationState';
import './repositoryAnalytics.css';
import './analyticsControls.css';

type Props = {
  repoPath: string | null;
  refreshTrigger: number;
  busy?: boolean;
  onOpenFile: (path: string, hash: string) => void;
};
export function RepositoryAnalyticsView(props: Props) {
  const { tr } = useI18n();
  if (!props.repoPath)
    return (
      <AnalyticsEmpty>{tr('Öffne ein lokales Repository, um seine Git-Daten auszuwerten.', 'Open a local repository to analyze its Git data.')}</AnalyticsEmpty>
    );
  return <AnalyticsDashboard key={props.repoPath} {...props} repoPath={props.repoPath} />;
}
function AnalyticsDashboard({ repoPath, refreshTrigger, busy = false, onOpenFile }: Props & { repoPath: string }) {
  const { tr } = useI18n();
  const filters = useAnalyticsFilters(repoPath);
  const tab = useAnalyticsTab(repoPath);
  const setTab = (value: AnalyticsTab) => selectAnalyticsTab(repoPath, value);
  const [hotspotKind, setHotspotKind] = useState<'hotspots' | 'directories'>('hotspots');
  const [showCoverage, setShowCoverage] = useState(false);
  const onFilters = useCallback((value: AnalyticsFilters) => changeAnalyticsFilters(repoPath, value), [repoPath]);
  const { snapshot, running, paused, error, reload, cancel } = useRepositoryAnalytics(repoPath, filters, refreshTrigger, busy);
  const openCoverage = useCallback(() => setShowCoverage(true), []);
  usePublishAnalyticsToolbar({
    repoPath,
    savedAt: snapshot?.savedAt,
    running,
    paused,
    failed: !!error,
    hasWarnings: !!snapshot?.warnings.length,
    reload,
    cancel,
    showCoverage: openCoverage,
  });
  useEffect(() => {
    if (snapshot) rememberAnalyticsSnapshot(snapshot);
  }, [snapshot]);
  const onPath = (path: string) => {
    onFilters({ ...filters, path });
    setTab('hotspots');
  };
  const onPerson = (author: string) => {
    onFilters({ ...filters, author });
    setTab('contributions');
  };
  const onPeriod = (date: string) => {
    if (snapshot) onFilters({ ...filters, ...periodRange(date, snapshot, filters.aggregation) });
    if (tab !== 'churn') setTab('contributions');
  };
  const labels = analyticsSections(tr);
  const details = (kind: 'hotspots' | 'directories' | 'coupling' | 'comparison') =>
    snapshot && <AnalyticsDetailsView key={JSON.stringify([repoPath, filters, kind])} snapshot={snapshot} kind={kind} onPath={onPath} onFile={onOpenFile} />;
  return (
    <div className="repository-analytics">
      <div
        className={`analytics-content${tab === 'overview' ? ' analytics-content--overview' : tab === 'churn' ? ' analytics-content--churn' : tab === 'coupling' ? ' analytics-content--coupling' : ''}`}
        tabIndex={0}
        aria-label={labels.find(({ id }) => id === tab)?.label}
      >
        {!snapshot ? (
          <AnalyticsEmpty>
            {running || busy
              ? tr('Die lokale Auswertung wird vorbereitet…', 'Preparing local analysis…')
              : tr('Noch keine Auswertung vorhanden. Starte die Analyse mit „Aktualisieren“.', 'No analysis yet. Start it with “Refresh”.')}
          </AnalyticsEmpty>
        ) : (
          <>
            {tab === 'overview' && (
              <AnalyticsOverview
                snapshot={snapshot}
                onPeriod={onPeriod}
                onPath={onPath}
                onFile={onOpenFile}
                onVersion={(compareFrom) => {
                  onFilters({ ...filters, compareFrom });
                  setTab('comparison');
                }}
              />
            )}
            {tab === 'hotspots' && (
              <section className="analytics-section analytics-hotspots">
                <div className="analytics-section-toolbar">
                  <h3>{tr('Änderungsschwerpunkte', 'Change hotspots')}</h3>
                  <SegmentedControl
                    className="analytics-hotspot-grouping"
                    ariaLabel={tr('Gruppierung', 'Grouping')}
                    value={hotspotKind}
                    onChange={setHotspotKind}
                    options={[
                      { value: 'hotspots', label: tr('Dateien', 'Files') },
                      { value: 'directories', label: tr('Verzeichnisse', 'Directories') },
                    ]}
                  />
                </div>
                <p className="analytics-description">
                  {tr(
                    'Änderungshäufigkeit und Zeilenänderungen gewöhnlicher Commits. Dies ist keine Messung der Code-Komplexität.',
                    'Change frequency and line changes from ordinary commits. This is not a measurement of code complexity.',
                  )}
                </p>
                {details(hotspotKind)}
              </section>
            )}
            {tab === 'contributions' && (
              <AnalyticsContributions
                snapshot={snapshot}
                onPerson={onPerson}
                onPeriod={onPeriod}
                onDay={(date) => {
                  onFilters({ ...filters, since: date, until: date });
                  setTab('contributions');
                }}
              />
            )}
            {tab === 'churn' && <AnalyticsChurn snapshot={snapshot} onPeriod={onPeriod} />}
            {tab === 'coupling' && (
              <section className="analytics-section analytics-coupling-section">
                <h3>{tr('Dateikopplung', 'File coupling')}</h3>
                <p className="analytics-description">
                  {tr(
                    'Welche Dateien ändern sich häufig zusammen? Verbindungen erscheinen ab drei gemeinsamen Commits.',
                    'Which files often change together? Connections appear from three shared commits.',
                  )}
                  {snapshot.excludedCouplingCommits > 0 && (
                    <>
                      {' '}
                      · {count(snapshot.excludedCouplingCommits)}{' '}
                      {tr('Commits mit über 50 Dateien sind hier ausgeschlossen.', 'commits with over 50 files are excluded here.')}
                    </>
                  )}
                </p>
                {details('coupling')}
              </section>
            )}
            {tab === 'comparison' && (
              <>
                <ComparisonHeader snapshot={snapshot} filters={filters} onChange={onFilters} />
                {details('comparison')}
              </>
            )}
          </>
        )}
      </div>
      <DialogFrame
        open={showCoverage && !!snapshot?.warnings.length}
        title={tr('Hinweise zur Abdeckung', 'Coverage notes')}
        onClose={() => setShowCoverage(false)}
        cancelLabel={tr('Schließen', 'Close')}
      >
        {snapshot?.warnings.map((warning) => (
          <p key={warning}>{translateWarning(warning, tr)}</p>
        ))}
      </DialogFrame>
    </div>
  );
}
function ComparisonHeader({
  snapshot,
  filters,
  onChange,
}: {
  snapshot: RepositoryAnalyticsSnapshot;
  filters: AnalyticsFilters;
  onChange: (value: AnalyticsFilters) => void;
}) {
  const { tr } = useI18n();
  const comparison = snapshot.comparison;
  return (
    <section className="analytics-section">
      <h3>{tr('Release-Vergleich', 'Release comparison')}</h3>
      <div className="analytics-comparison-fields">
        <label>
          {tr('Basis A', 'Base A')}
          <TextField
            key={filters.compareFrom}
            list="analytics-revisions"
            defaultValue={filters.compareFrom || comparison?.from || ''}
            placeholder={tr('Tag oder Revision', 'Tag or revision')}
            onBlur={(event) => {
              if (event.target.value !== (filters.compareFrom || comparison?.from || '')) onChange({ ...filters, compareFrom: event.target.value });
            }}
          />
        </label>
        <label>
          {tr('Ziel B', 'Target B')}
          <TextField
            key={filters.compareTo}
            list="analytics-revisions"
            defaultValue={filters.compareTo}
            onBlur={(event) => {
              if (event.target.value !== filters.compareTo) onChange({ ...filters, compareTo: event.target.value || 'HEAD' });
            }}
          />
        </label>
      </div>
      {comparison ? (
        <>
          <p>
            {comparison.from} → {comparison.to} · {count(comparison.commits)} {tr('neue erreichbare Commits', 'new reachable commits')} ·{' '}
            {count(comparison.contributors)} {tr('Personen', 'people')}
          </p>
          <p className="analytics-description">
            {tr('Separater Baumvergleich (Nettoänderungen)', 'Separate tree comparison (net changes)')}: {count(comparison.files)} {tr('Dateien', 'files')} · +
            {count(comparison.additions)} / −{count(comparison.deletions)}
          </p>
          {!comparison.ancestor && (
            <p>
              {tr(
                'A ist kein Vorfahr von B. A..B und der Baumvergleich beschreiben daher unterschiedliche Änderungen.',
                'A is not an ancestor of B. A..B and the tree comparison therefore describe different changes.',
              )}
            </p>
          )}
        </>
      ) : (
        <AnalyticsEmpty>{tr('Wähle zwei lokale Tags oder Revisionen für den Vergleich.', 'Choose two local tags or revisions to compare.')}</AnalyticsEmpty>
      )}
    </section>
  );
}
function translateWarning(warning: string, tr: (de: string, en: string) => string) {
  if (warning.startsWith('Shallow repository')) return tr('Flacher Klon: Die Auswertung umfasst nur die lokal vorhandene Historie.', warning);
  if (warning.startsWith('Some text files'))
    return tr('Einige Textdateien konnten nicht vollständig zugeordnet werden. Die Blame-Abdeckung wird separat angezeigt.', warning);
  return warning;
}
