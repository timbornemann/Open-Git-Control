import { useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Link, Plus, RefreshCw, Server, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useGitStore, useUIStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { HostingConnections } from './HostingConnections';
import { HostingRepositoryDetail } from './HostingRepositoryDetail';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { useHostingConnections } from './useHostingConnections';
import { useHostingCatalog } from './useHostingCatalog';
import { HostingCatalog } from './HostingCatalog';
import { HostingRepositoryForms, type HostingRepositoryFormMode } from './HostingRepositoryForms';
import './hosting.css';

export function HostingWorkspace() {
  useHostingConnections();
  const { tr } = useI18n();
  const state = useHostingState();
  const activeRepo = useGitStore((s) => s.activeRepo);
  const onOpenRemoteConfig = useUIStore((s) => s.onOpenRemoteConfig);
  const catalog = useHostingCatalog();
  const [formMode, setFormMode] = useState<HostingRepositoryFormMode>(null);
  const showDetail = Boolean(state.selected && !['connections', 'remotes'].includes(state.section));
  const scroller = useRef<HTMLDivElement>(null);
  const catalogScroll = useRef(0);
  const detailKey = showDetail && state.selected ? hostedRepositoryKey(state.selected) : '';
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = detailKey ? 0 : catalogScroll.current;
  }, [detailKey]);
  const accounts = state.section === 'connections';
  return (
    <div
      className="hosting-workspace"
      ref={scroller}
      onScroll={(event) => {
        if (!showDetail && !accounts) catalogScroll.current = event.currentTarget.scrollTop;
      }}
    >
      <div className="hosting-workspace__inner">
        {showDetail && state.selected ? (
          <HostingRepositoryDetail
            key={detailKey}
            repository={state.selected}
            cloneBusy={catalog.task.busy}
            onClone={catalog.clone}
            localPaths={catalog.clones[detailKey] ?? []}
            onActivateLocal={catalog.activateLocal}
          />
        ) : (
          <>
            <header className="hosting-page-header">
              <div>
                <span className="hosting-eyebrow">Hosting</span>
                <h1>{accounts ? tr('Konten & Server', 'Accounts & servers') : tr('Repositories', 'Repositories')}</h1>
                <p>
                  {accounts
                    ? tr('Deine Verbindungen zu GitHub, Forgejo, GitLab und Bitbucket.', 'Your connections to GitHub, Forgejo, GitLab and Bitbucket.')
                    : tr('Deine Repositories über alle Anbieter, Konten und Server.', 'Your repositories across providers, accounts and servers.')}
                </p>
              </div>
              <div className="hosting-header-actions">
                <Button icon={<RefreshCw size={14} />} onClick={state.refresh} disabled={catalog.task.busy}>
                  {tr('Aktualisieren', 'Refresh')}
                </Button>
                {!accounts && (
                  <Button
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={() => setFormMode('create')}
                    disabled={!state.connections.some((c) => c.authenticated)}
                  >
                    {tr('Neues Repository', 'New repository')}
                  </Button>
                )}
              </div>
            </header>
            <div className="hosting-navigation">
              <SegmentedControl
                ariaLabel={tr('Hosting-Bereiche', 'Hosting sections')}
                value={accounts ? 'connections' : 'repositories'}
                onChange={state.navigate}
                options={[
                  {
                    value: 'repositories',
                    label: (
                      <>
                        <BookOpen size={14} />
                        {tr('Repositories', 'Repositories')}
                      </>
                    ),
                  },
                  {
                    value: 'connections',
                    label: (
                      <>
                        <Server size={14} />
                        {tr('Konten & Server', 'Accounts & servers')}
                      </>
                    ),
                  },
                ]}
              />
              <div className="hosting-header-actions">
                {!accounts && (
                  <Button variant="ghost" icon={<Link size={14} />} onClick={() => setFormMode('url')}>
                    {tr('Repository per URL öffnen', 'Open repository by URL')}
                  </Button>
                )}
                {activeRepo && (
                  <Button variant="ghost" icon={<Settings2 size={14} />} onClick={onOpenRemoteConfig}>
                    {tr('Remote-Konfiguration', 'Remote configuration')}
                  </Button>
                )}
              </div>
            </div>
            {accounts ? (
              <HostingConnections />
            ) : state.section === 'remotes' && activeRepo ? (
              <section className="hosting-empty">
                <Settings2 size={28} />
                <p>{tr('Remote-Einstellungen gehören zum lokalen Repository.', 'Remote settings belong to the local repository.')}</p>
                <Button onClick={onOpenRemoteConfig}>{tr('Remote-Konfiguration öffnen', 'Open remote configuration')}</Button>
              </section>
            ) : (
              <HostingCatalog catalog={catalog} />
            )}
          </>
        )}
        {catalog.task.error && (
          <p className="hosting-error" role="alert">
            {catalog.task.error}
          </p>
        )}
        {showDetail && catalog.task.busy && (
          <p className="hosting-notice" role="status">
            {tr('Repository wird geladen …', 'Loading repository …')}
          </p>
        )}
      </div>
      {formMode && <HostingRepositoryForms mode={formMode} onClose={() => setFormMode(null)} />}
    </div>
  );
}
