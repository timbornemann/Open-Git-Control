import type { AiAutoCommitGroupDto } from '@/types/aiDtos';
import { useI18n } from '@/i18n';

export function AiCommitPlan({ groups }: { groups: AiAutoCommitGroupDto[] }) {
  const { tr } = useI18n();
  if (!groups.length) return null;
  return (
    <details className="ai-commit-plan">
      <summary>
        {tr('Commit-Plan', 'Commit plan')} · {groups.filter((group) => group.status === 'committed').length}/{groups.length}
      </summary>
      <ol>
        {groups.map((group) => (
          <li key={group.id}>
            <details>
              <summary>
                <span className={group.status === 'committed' ? 'ai-commit-plan-done' : ''}>
                  {group.status === 'committed' ? '✓ ' : ''}
                  {group.title}
                </span>
                <span className="ai-commit-plan-meta">
                  {group.source === 'staged' ? tr('Gestagter Stand', 'Staged snapshot') : tr('Arbeitsstand', 'Working changes')}
                  {' · '}
                  {group.paths.length} {group.paths.length === 1 ? tr('Datei', 'file') : tr('Dateien', 'files')}
                  {group.messageSource === 'fallback' && (
                    <strong>
                      {' · '}
                      {tr('Ersatz-Commit', 'Fallback commit')}
                    </strong>
                  )}
                </span>
              </summary>
              <p>{group.rationale}</p>
              {group.description && <pre>{group.description}</pre>}
              <ul>
                {group.paths.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
              {group.hash && <code>{group.hash.slice(0, 12)}</code>}
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}
