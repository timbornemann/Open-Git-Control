import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useAnalyticsToolbar } from './analyticsToolbarState';
import './analyticsToolbar.css';

export function RepositoryAnalyticsToolbar({ repoPath }: { repoPath: string | null }) {
  const { tr, locale } = useI18n();
  const toolbar = useAnalyticsToolbar(repoPath);
  if (!repoPath) return null;
  return (
    <div className="analytics-topbar-actions">
      {toolbar?.hasWarnings && (
        <Button size="xs" variant="ghost" onClick={toolbar.showCoverage}>
          {tr('Hinweise zur Abdeckung', 'Coverage notes')}
        </Button>
      )}
      {toolbar?.savedAt !== undefined && (
        <time
          className="analytics-updated"
          dateTime={new Date(toolbar.savedAt).toISOString()}
          title={`${tr('Lokale Auswertung vom', 'Local report from')} ${new Date(toolbar.savedAt).toLocaleString(locale)}`}
        >
          {tr('Stand', 'Updated')} {new Date(toolbar.savedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
        </time>
      )}
      {toolbar?.running ? (
        <Button size="xs" variant="ghost" className="analytics-refresh-action" onClick={toolbar.cancel}>
          {tr('Abbrechen', 'Cancel')}
        </Button>
      ) : (
        <Button size="xs" variant="ghost" className="analytics-refresh-action" icon={<RefreshCw size={13} />} disabled={!toolbar} onClick={toolbar?.reload}>
          {toolbar?.paused || toolbar?.failed ? tr('Fortsetzen', 'Resume') : tr('Aktualisieren', 'Refresh')}
        </Button>
      )}
    </div>
  );
}
