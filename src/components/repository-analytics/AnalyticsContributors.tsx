import { useI18n } from '@/i18n';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsEmpty, AnalyticsTable, count, percent, percentWidth } from './AnalyticsCharts';
import './analyticsContributors.css';

export function AnalyticsContributors({ snapshot, onPerson }: { snapshot: RepositoryAnalyticsSnapshot; onPerson: (id: string) => void }) {
  const { tr } = useI18n();
  const { project } = snapshot;
  const activity = new Map(snapshot.contributors.map((person) => [person.id, person]));
  const ownership = new Map(project.ownership.map((person) => [person.id, person]));
  const people = [...snapshot.contributors, ...project.ownership.filter((person) => !activity.has(person.id))].filter(
    (person) => !snapshot.filters.author || person.id === snapshot.filters.author,
  );
  const historyReady = snapshot.sections.includes('history');
  const blameReady = snapshot.sections.includes('blame');
  return (
    <section className="analytics-section analytics-contributors">
      <h3>{tr('Mitwirkende', 'Contributors')}</h3>
      <p className="analytics-description">
        {tr(
          'Aktivität gemäß Historienfiltern. Zuletzt geänderte Zeilen zeigen die letzte Bearbeitung im Projektstand',
          'Activity follows history filters. Last changed lines show the last editor in project tree',
        )}{' '}
        <strong>{snapshot.filters.revision}</strong>.
      </p>
      {people.length ? (
        <AnalyticsTable
          scrollLabel={tr('Mitwirkende: Aktivität und Zeilenanteile', 'Contributor activity and line shares')}
          headings={[
            tr('Person', 'Person'),
            'Commits',
            'Merges',
            tr('Dateien', 'Files'),
            tr('Hinzugefügt', 'Added'),
            tr('Gelöscht', 'Deleted'),
            tr('Zuletzt geänderte Zeilen', 'Last changed lines'),
            tr('Zeilenanteil', 'Line share'),
          ]}
        >
          {people.map((person) => {
            const changes = activity.get(person.id);
            const attributed = ownership.get(person.id);
            const lines = attributed?.lines ?? (blameReady && !project.unblamedFiles ? 0 : null);
            const share = lines !== null && project.blamedLines ? lines / project.blamedLines : null;
            return (
              <tr key={person.id}>
                <td>
                  <button className="analytics-link" onClick={() => onPerson(person.id)}>
                    {person.name}
                  </button>
                  <small>{person.email}</small>
                </td>
                <td>{historyReady ? count(changes?.commits ?? 0) : '—'}</td>
                <td>{historyReady ? count(changes?.merges ?? 0) : '—'}</td>
                <td>{historyReady ? count(changes?.files ?? 0) : '—'}</td>
                <td className="analytics-added">{historyReady ? `+${count(changes?.additions ?? 0)}` : '—'}</td>
                <td className="analytics-deleted">{historyReady ? `−${count(changes?.deletions ?? 0)}` : '—'}</td>
                <td>{lines === null ? '—' : count(lines)}</td>
                <td>
                  {share === null ? (
                    '—'
                  ) : (
                    <>
                      <span className="analytics-share" aria-hidden="true">
                        <span style={{ width: percentWidth(share) }} />
                      </span>
                      {percent(share)}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </AnalyticsTable>
      ) : (
        <AnalyticsEmpty>{tr('Keine Mitwirkenden für diese Auswahl.', 'No contributors for this selection.')}</AnalyticsEmpty>
      )}
      <p className="analytics-description analytics-contributors-coverage">
        {snapshot.sections.includes('project') && (
          <>
            {tr('Zeilenabdeckung', 'Line coverage')}: {count(project.blamedLines)} / {count(project.lines)}
            {project.lines > 0 && ` (${percent(project.blamedLines / project.lines)})`}
            {project.unblamedFiles > 0 && (
              <>
                {' '}
                · {count(project.unblamedFiles)}{' '}
                {project.unblamedFiles === 1
                  ? tr('Datei nicht zuordenbar', 'file could not be attributed')
                  : tr('Dateien nicht zuordenbar', 'files could not be attributed')}
              </>
            )}
          </>
        )}
        {!blameReady && (
          <>
            {snapshot.sections.includes('project') && ' · '}
            {tr('Zeilenzuordnung unvollständig; verfügbare Werte werden angezeigt.', 'Line attribution incomplete; available values are shown.')}
          </>
        )}
      </p>
    </section>
  );
}
