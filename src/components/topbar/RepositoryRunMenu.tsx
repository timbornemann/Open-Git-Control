import React from 'react';
import { ChevronDown, Play, Square } from 'lucide-react';
import { useI18n } from '@/i18n';
import { REPOSITORY_RUN_ACTION_IDS, type RepositoryRunActionId, type RepositoryRunConfigStateDto, type RepositoryRunStateDto } from '@/types/repositoryRun';

type Props = {
  activeRepo: string | null;
  activeRunConfig: RepositoryRunConfigStateDto | null;
  repositoryRun: RepositoryRunStateDto | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  onStart: (action: RepositoryRunActionId) => Promise<boolean>;
  onStop: () => Promise<boolean>;
  onOpenConsole: () => void;
  onOpenSettings: () => void;
};

const actionLabels: Record<RepositoryRunActionId, string> = { run: 'Run', test: 'Test', format: 'Format', start: 'Start', build: 'Build' };

export const RepositoryRunMenu: React.FC<Props> = ({
  activeRepo,
  activeRunConfig,
  repositoryRun,
  open,
  setOpen,
  onStart,
  onStop,
  onOpenConsole,
  onOpenSettings,
}) => {
  const { tr } = useI18n();
  const isRunning = repositoryRun?.status === 'running';
  const runAction = (action: RepositoryRunActionId) => {
    setOpen(false);
    void onStart(action);
  };

  return (
    <div className="topbar-split-wrap topbar-action-secondary">
      <button
        className="icon-btn topbar-action-btn topbar-action-btn-sync topbar-split-main"
        onClick={() => (isRunning ? onOpenConsole() : runAction('run'))}
        disabled={!activeRepo || (!isRunning && !activeRunConfig?.availableActions.run)}
        title={isRunning ? tr('Laufende Konsole öffnen', 'Open running console') : tr('Standardbefehl ausführen', 'Run default command')}
      >
        <Play size={16} className={isRunning ? 'spin' : ''} />
        <span className="topbar-action-label">Run</span>
      </button>
      <button
        className="icon-btn topbar-action-btn topbar-split-toggle"
        onClick={() => setOpen(!open)}
        disabled={!activeRepo}
        aria-label={tr('Run-Aktionen öffnen', 'Open run actions')}
        title={tr('Run-Aktionen öffnen', 'Open run actions')}
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="topbar-dropdown">
          {isRunning ? (
            <>
              <div className="topbar-dropdown-header">{tr('Befehl läuft', 'Command running')}</div>
              <button
                className="topbar-dropdown-item"
                onClick={() => {
                  setOpen(false);
                  onOpenConsole();
                }}
              >
                <span className="topbar-dropdown-item-label">{tr('Konsole öffnen', 'Open console')}</span>
                <span className="topbar-dropdown-item-hint">{repositoryRun?.repoPath}</span>
              </button>
              <button
                className="topbar-dropdown-item danger"
                onClick={() => {
                  setOpen(false);
                  void onStop();
                }}
              >
                <Square size={13} />
                <span className="topbar-dropdown-item-label">{tr('Prozess stoppen', 'Stop process')}</span>
              </button>
            </>
          ) : (
            <>
              <div className="topbar-dropdown-header">{tr('Repository-Befehle', 'Repository commands')}</div>
              {REPOSITORY_RUN_ACTION_IDS.map((action) => {
                const configured = Boolean(activeRunConfig?.availableActions[action]);
                return (
                  <button key={action} className="topbar-dropdown-item" disabled={!configured} onClick={() => runAction(action)}>
                    <span className="topbar-dropdown-item-label">{actionLabels[action]}</span>
                    <span className="topbar-dropdown-item-hint">
                      {configured ? tr('Konfigurierte Aktion ausführen', 'Run configured action') : tr('Noch nicht konfiguriert', 'Not configured yet')}
                    </span>
                  </button>
                );
              })}
            </>
          )}
          <div className="topbar-dropdown-sep" />
          <button
            className="topbar-dropdown-item"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <span className="topbar-dropdown-item-label">{tr('Run-Konfiguration', 'Run configuration')}</span>
            <span className="topbar-dropdown-item-hint">.Open-Git-Control/run.json</span>
          </button>
        </div>
      )}
    </div>
  );
};
