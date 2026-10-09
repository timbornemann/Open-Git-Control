import { useI18n } from '@/i18n';
import type { AnalyticsFilters, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty, AnalyticsTable, ActivityCalendar, PeriodChart, count, percent, periodInterval } from './AnalyticsCharts';

type Props = { snapshot: RepositoryAnalyticsSnapshot; onPerson: (id: string) => void; onPeriod: (date: string) => void; onDay?: (date: string) => void };
export function AnalyticsContributions({ snapshot, onPerson, onPeriod, onDay = onPeriod }: Props) {
  const { tr } = useI18n();
  return (
    <>
      <section className="analytics-section">
        <ActivityCalendar periods={snapshot.calendar} onSelect={onDay} />
      </section>
      <section className="analytics-section">
        <h3>{tr('Beiträge über Zeit', 'Contributions over time')}</h3>
        <PeriodChart periods={snapshot.periods} interval={periodInterval(snapshot)} onSelect={onPeriod} />
      </section>
      <section className="analytics-section">
        <h3>{tr('Mitwirkende', 'Contributors')}</h3>
        <AnalyticsTable headings={[tr('Person', 'Person'), 'Commits', 'Merges', tr('Dateien', 'Files'), tr('Hinzugefügt', 'Added'), tr('Gelöscht', 'Deleted')]}>
          {snapshot.contributors.map((person) => (
            <tr key={person.id}>
              <td>
                <button className="analytics-link" onClick={() => onPerson(person.id)}>
                  {person.name}
                </button>
                <small>{person.email}</small>
              </td>
              <td>{count(person.commits)}</td>
              <td>{count(person.merges)}</td>
              <td>{count(person.files)}</td>
              <td className="analytics-added">+{count(person.additions)}</td>
              <td className="analytics-deleted">−{count(person.deletions)}</td>
            </tr>
          ))}
        </AnalyticsTable>
      </section>
    </>
  );
}
export function AnalyticsOwnership({ snapshot, onPerson }: Pick<Props, 'snapshot' | 'onPerson'>) {
  const { tr } = useI18n();
  const project = snapshot.project;
  return (
    <section className="analytics-section">
      <h3>{tr('Zuletzt geänderte Zeilen', 'Last changed lines')}</h3>
      <p className="analytics-description">
        {tr(
          'Standard-Blame des gewählten Projektstands, ohne zusätzliche Whitespace- oder Kopiererkennung. Dies zeigt die letzte Änderung vorhandener Textzeilen.',
          'Standard blame of the selected project tree, without additional whitespace or copy detection. This shows the last change to existing text lines.',
        )}
      </p>
      <p>
        {tr('Abdeckung', 'Coverage')}: {count(project.blamedLines)} / {count(project.lines)} {tr('Textzeilen', 'text lines')} (
        {percent(project.lines ? project.blamedLines / project.lines : 1)}) · {count(project.unblamedFiles)}{' '}
        {tr('Dateien nicht zuordenbar', 'files could not be attributed')}
      </p>
      {!snapshot.sections.includes('blame') && (
        <p className="analytics-description">
          {tr(
            'Blame wird noch berechnet. Vorhandene Zuordnungen sind bereits sichtbar.',
            'Blame is still being calculated. Available attributions are shown below.',
          )}
        </p>
      )}
      <AnalyticsTable headings={[tr('Person', 'Person'), tr('Textzeilen', 'Text lines'), tr('Anteil der zugeordneten Zeilen', 'Share of attributed lines')]}>
        {project.ownership.map((person) => (
          <tr key={person.id}>
            <td>
              <button className="analytics-link" onClick={() => onPerson(person.id)}>
                {person.name}
              </button>
              <small>{person.email}</small>
            </td>
            <td>{count(person.lines)}</td>
            <td>
              <span className="analytics-share">
                <span style={{ width: percent(project.blamedLines ? person.lines / project.blamedLines : 0) }} />
              </span>
              {percent(project.blamedLines ? person.lines / project.blamedLines : 0)}
            </td>
          </tr>
        ))}
      </AnalyticsTable>
      {!project.ownership.length && <AnalyticsEmpty>{tr('Noch keine zuordenbaren Textzeilen.', 'No attributable text lines yet.')}</AnalyticsEmpty>}
    </section>
  );
}
export function AnalyticsChurn({ snapshot, onPeriod }: Pick<Props, 'snapshot' | 'onPeriod'>) {
  const { tr } = useI18n();
  const total = snapshot.additions + snapshot.deletions;
  return (
    <section className="analytics-section">
      <h3>Code Churn</h3>
      <dl className="analytics-metrics analytics-metrics--secondary">
        {[
          [tr('Hinzugefügt', 'Added'), `+${count(snapshot.additions)}`],
          [tr('Gelöscht', 'Deleted'), `−${count(snapshot.deletions)}`],
          [tr('Änderungsmenge', 'Total changes'), count(total)],
          [tr('Nettoveränderung', 'Net change'), count(snapshot.additions - snapshot.deletions)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="analytics-description">
        {percent(total ? snapshot.additions / total : 0)} {tr('hinzugefügt', 'added')} · {percent(total ? snapshot.deletions / total : 0)}{' '}
        {tr('gelöscht', 'deleted')} ·{' '}
        {tr('Binärdaten und LFS-Pointer liefern keine Textzeilenzahlen.', 'Binary data and LFS pointers do not contribute text line counts.')}
      </p>
      <PeriodChart periods={snapshot.periods} interval={periodInterval(snapshot)} churn onSelect={onPeriod} />
    </section>
  );
}
export function periodRange(date: string, snapshot: RepositoryAnalyticsSnapshot, aggregation: AnalyticsFilters['aggregation']) {
  const span = snapshot.totals.lastActivity - snapshot.totals.firstActivity;
  const effective = aggregation === 'auto' ? (span > 365 * 86400000 ? 'month' : span > 90 * 86400000 ? 'week' : 'day') : aggregation;
  const end = new Date(`${date}T12:00:00`);
  if (effective === 'month') end.setMonth(end.getMonth() + 1, 0);
  if (effective === 'week') end.setDate(end.getDate() + 6);
  return { since: date, until: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` };
}
