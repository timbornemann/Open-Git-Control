import { Copy, FolderGit2, GitBranch, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostingConnection } from '@/types/hostingDtos';

export function HostingRepositoryOverview({
  repository,
  connection,
  localPaths,
  activeRepo,
  onActivateLocal,
  busy,
}: {
  repository: HostedRepository;
  connection?: HostingConnection;
  localPaths: string[];
  activeRepo: string | null;
  onActivateLocal?: (path: string) => void;
  busy: boolean;
}) {
  const { tr } = useI18n();
  return (
    <div className="hosting-overview">
      <Panel className="hosting-card">
        <h3>{tr('Repository', 'Repository')}</h3>
        <dl className="hosting-properties">
          <div>
            <dt>{tr('Sichtbarkeit', 'Visibility')}</dt>
            <dd>
              <StatusBadge icon={repository.private ? <Lock size={12} /> : <Globe size={12} />}>
                {repository.private ? tr('Privat', 'Private') : tr('Öffentlich', 'Public')}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt>{tr('Standardbranch', 'Default branch')}</dt>
            <dd>
              <GitBranch size={13} />
              {repository.defaultBranch}
            </dd>
          </div>
          <div>
            <dt>{tr('Konto', 'Account')}</dt>
            <dd>{connection?.label ?? '—'}</dd>
          </div>
          <div>
            <dt>{tr('Server', 'Server')}</dt>
            <dd title={connection?.baseUrl}>{connection?.baseUrl ?? '—'}</dd>
          </div>
          {repository.parent && (
            <div>
              <dt>{tr('Fork von', 'Fork of')}</dt>
              <dd>{repository.parent.fullPath}</dd>
            </div>
          )}
        </dl>
      </Panel>
      <Panel className="hosting-card">
        <h3>{tr('Lokale Arbeit', 'Local work')}</h3>
        <p className="hosting-help">
          {localPaths.length
            ? tr('Öffne einen lokalen Klon für Git-Aktionen.', 'Open a local clone for Git actions.')
            : tr('Dieses Repository ist noch nicht lokal geöffnet.', 'This repository is not open locally yet.')}
        </p>
        <div className="hosting-local-paths">
          {localPaths.map((path) => (
            <Button variant="ghost" key={path} icon={<FolderGit2 size={15} />} title={path} disabled={busy} onClick={() => onActivateLocal?.(path)}>
              <span>{path}</span>
              {path === activeRepo && <StatusBadge tone="success">{tr('Aktiv', 'Active')}</StatusBadge>}
            </Button>
          ))}
        </div>
      </Panel>
      <Panel className="hosting-card hosting-overview__clone">
        <h3>{tr('Clone-Adressen', 'Clone URLs')}</h3>
        {[{ name: 'HTTPS', url: repository.cloneUrl }, ...(repository.sshUrl ? [{ name: 'SSH', url: repository.sshUrl }] : [])].map(({ name, url }) => (
          <label className="hosting-clone-url" key={name}>
            <span>{name}</span>
            <TextField value={url} readOnly aria-label={`${name} clone URL`} />
            <IconButton
              icon={<Copy size={14} />}
              aria-label={tr(`${name}-Adresse kopieren`, `Copy ${name} URL`)}
              onClick={() => void navigator.clipboard.writeText(url)}
            />
          </label>
        ))}
      </Panel>
    </div>
  );
}
