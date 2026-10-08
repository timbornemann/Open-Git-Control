import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { openSystemTools, useSystemTools } from '@/app/state/systemToolsStore';

export function SystemToolsWarning() {
  const { tr } = useI18n();
  const git = useSystemTools((state) => state.status?.tools.find((tool) => tool.id === 'git'));
  if (!git || git.state === 'checking' || git.state === 'available') return null;
  const label = tr('Git ist nicht nutzbar. Werkzeuge öffnen.', 'Git is not usable. Open system tools.');
  return (
    <button type="button" className="icon-btn activity-tools-warning" title={label} aria-label={label} onClick={() => openSystemTools()}>
      <AlertTriangle size={21} aria-hidden="true" />
    </button>
  );
}
