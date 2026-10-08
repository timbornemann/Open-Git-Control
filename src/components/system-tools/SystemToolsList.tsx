import { Download, ExternalLink, RefreshCw, Terminal } from 'lucide-react';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { reviewSystemTool, recheckSystemTools, toolInstallationRunning, useSystemTools } from '@/app/state/systemToolsStore';
import { toolName, toolPurpose, toolStateLabel } from './toolLabels';

export function SystemToolsList() {
  const { tr } = useI18n();
  const { status, checking } = useSystemTools();
  const busy = toolInstallationRunning(status?.installation);
  return (
    <div className="system-tools-list">
      {!status && <p className="system-tools-hint">{tr('Werkzeuge werden geprüft …', 'Checking system tools …')}</p>}
      {status?.tools.map((tool) => (
        <div className="system-tool-row" key={tool.id} data-tool={tool.id}>
          <Terminal size={17} className="system-tool-icon" aria-hidden="true" />
          <div className="system-tool-content">
            <div className="system-tool-heading">
              <strong>{toolName(tool.id)}</strong>
              <span className="system-tool-requirement">{tool.required ? tr('Erforderlich', 'Required') : tr('Optional', 'Optional')}</span>
              <StatusBadge tone={tool.state === 'available' ? 'success' : tool.state === 'checking' ? 'neutral' : tool.required ? 'warning' : 'neutral'}>
                {toolStateLabel(tool.state, tr)}
              </StatusBadge>
              {tool.version && <code>{tool.version}</code>}
            </div>
            <p>{toolPurpose(tool.id, tr)}</p>
            {tool.detail && (
              <details className="system-tool-detail">
                <summary>{tr('Prüfdetails', 'Check details')}</summary>
                <pre>{tool.detail}</pre>
              </details>
            )}
            <div className="system-tool-actions">
              {tool.state !== 'available' && (
                <Button
                  icon={<Download size={13} />}
                  variant={tool.required ? 'primary' : 'secondary'}
                  disabled={busy || tool.state === 'checking' || !tool.installation?.available}
                  onClick={() => reviewSystemTool(tool.id)}
                >
                  {tr('Installieren', 'Install')}
                </Button>
              )}
              <Button icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(tool.downloadUrl)}>
                {tr('Offizieller Download', 'Official download')}
              </Button>
              {tool.state !== 'available' && !tool.installation?.available && tool.state !== 'checking' && (
                <Button variant="ghost" onClick={() => reviewSystemTool(tool.id)}>
                  {tr('Installationsanleitung', 'Installation instructions')}
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
      {status?.platform === 'win32' && (
        <p className="system-tools-hint">
          {tr(
            'Git for Windows enthält Git LFS standardmäßig. Die Komponente kann im Installer abgewählt werden.',
            'Git for Windows includes Git LFS by default. The component can be deselected in the installer.',
          )}
        </p>
      )}
      <div className="system-tool-actions">
        <Button icon={<RefreshCw size={13} className={checking ? 'spin' : undefined} />} disabled={checking || busy} onClick={() => void recheckSystemTools()}>
          {checking ? tr('Prüfung läuft …', 'Checking …') : tr('Erneut prüfen', 'Recheck')}
        </Button>
      </div>
    </div>
  );
}
