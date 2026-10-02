import { EmptyState } from '@/components/EmptyState';
import { useI18n } from '@/i18n';

type Props = { error: string; hasLayout?: boolean; onRetry: () => void };

export const CommitGraphLoadError = ({ error, hasLayout = false, onRetry }: Props) => {
  const { tr } = useI18n();
  if (!hasLayout) {
    return (
      <EmptyState
        title={tr('Verlauf konnte nicht geladen werden', 'Could not load history')}
        description={error}
        action={{ label: tr('Erneut versuchen', 'Try again'), onClick: onRetry }}
      />
    );
  }
  return (
    <div className="commit-graph-refresh-error" role="status">
      <span title={error}>{tr('Der Verlauf konnte nicht aktualisiert werden.', 'Could not refresh history.')}</span>
      <button type="button" className="staging-tool-btn" onClick={onRetry}>
        {tr('Erneut versuchen', 'Try again')}
      </button>
    </div>
  );
};
