import { DialogFrame } from '@/components/DialogFrame';
import { Button } from '@/components/ui/Button';
import { ClipboardCopy, ExternalLink } from 'lucide-react';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import { closeSystemTools, installSystemTool, reviewSystemTool, toolInstallationRunning, useSystemTools } from '@/app/state/systemToolsStore';
import { SystemToolsList } from './SystemToolsList';
import { toolName } from './toolLabels';
import { useEffect } from 'react';

export function SystemToolsDialog() {
  const { tr } = useI18n();
  const state = useSystemTools();
  useEffect(() => {
    if (!state.dialogOpen) return;
    const timer = window.setTimeout(() => {
      const row = document.querySelector(`.system-tools-dialog [data-tool="${state.selectedTool}"]`);
      row?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [state.dialogOpen, state.selectedTool]);
  const git = state.status?.tools.find((tool) => tool.id === 'git');
  const missingGit = git?.state === 'missing' || git?.state === 'unusable';
  const review = state.status?.tools.find((tool) => tool.id === state.reviewTool);
  const event = state.status?.installation;
  const agreements = event?.phase === 'agreements-required' ? event : null;
  const installationTool = agreements ? state.status?.tools.find((tool) => tool.id === agreements.toolId) : review;
  const closeReview = () => {
    reviewSystemTool(null);
    if (agreements && state.status) useSystemTools.setState({ status: { ...state.status, installation: null } });
  };
  return (
    <>
      <DialogFrame
        open={state.dialogOpen}
        title={missingGit ? tr('Git wird benötigt', 'Git is required') : tr('Werkzeuge', 'System tools')}
        onClose={closeSystemTools}
        cancelLabel={missingGit ? tr('Später', 'Later') : tr('Schließen', 'Close')}
      >
        <div className="system-tools-dialog">
          <p className="system-tools-intro">
            {missingGit
              ? tr(
                  'Git ist noch nicht nutzbar. Installiere Git, um Repositorys zu öffnen, Änderungen zu committen und zu übertragen. Deine gespeicherten Repositorys bleiben erhalten.',
                  'Git is not usable yet. Install Git to open repositories, commit changes and transfer them. Your saved repositories are preserved.',
                )
              : tr(
                  'Programme werden auf diesem Computer geprüft. Optionale Werkzeuge brauchst du nur für die jeweiligen Funktionen.',
                  'Tools are checked on this computer. Optional tools are needed only for their specific features.',
                )}
          </p>
          <SystemToolsList />
        </div>
      </DialogFrame>
      <DialogFrame
        open={Boolean(installationTool)}
        title={
          agreements ? tr('Vereinbarungen prüfen', 'Review agreements') : `${toolName(installationTool?.id || 'git')} ${tr('installieren', 'installation')}`
        }
        onClose={closeReview}
        onConfirm={
          installationTool?.installation?.available
            ? () => {
                const id = installationTool.id;
                closeReview();
                void installSystemTool(id, Boolean(agreements));
              }
            : undefined
        }
        confirmLabel={agreements ? tr('Zustimmen und installieren', 'Agree and install') : tr('Installieren', 'Install')}
        confirmDisabled={toolInstallationRunning(event) || installationTool?.state === 'available'}
      >
        {installationTool && (
          <div className="system-tools-install-review">
            <p>
              {tr('Werkzeug', 'Tool')}: <strong>{toolName(installationTool.id)}</strong>
            </p>
            {installationTool.installation ? (
              <>
                <p>
                  {tr('Paketquelle', 'Package source')}: {installationTool.installation.source} · {installationTool.installation.packageName}
                </p>
                <pre className="system-tool-command">{installationTool.installation.command}</pre>
                {!installationTool.installation.available && <p>{installationTool.installation.reason}</p>}
                <Button icon={<ClipboardCopy size={13} />} onClick={() => void navigator.clipboard?.writeText(installationTool.installation!.command)}>
                  {tr('Befehl kopieren', 'Copy command')}
                </Button>
              </>
            ) : (
              <p>
                {tr(
                  'Kein unterstützter Paketmanager gefunden. Verwende die offizielle Installationsanleitung.',
                  'No supported package manager found. Use the official installation instructions.',
                )}
              </p>
            )}
            {agreements?.agreements && <pre className="system-tool-agreements">{agreements.agreements}</pre>}
            <p className="system-tools-hint">
              {tr(
                'Das Betriebssystem fragt bei Bedarf nach Administratorrechten. Das Schließen dieses Dialogs beendet keine laufende Installation.',
                'The operating system requests administrator rights when needed. Closing this dialog does not stop an installation in progress.',
              )}
            </p>
            <Button icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(installationTool.instructionsUrl)}>
              {tr('Offizielle Anleitung', 'Official instructions')}
            </Button>
          </div>
        )}
      </DialogFrame>
    </>
  );
}
