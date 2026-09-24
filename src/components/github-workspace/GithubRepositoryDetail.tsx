/* eslint-disable complexity -- repository detail coordinates the three intentionally distinct tabs. */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Download, FolderGit2, GitPullRequest, LockKeyhole, Workflow } from 'lucide-react';
import { useI18n } from '@/i18n';
import { githubClient } from '@/services/githubClient';
import type { GitHubRepositoryDetailsDto, GitHubRepositoryDto } from '@/types/githubDtos';
import { toRepoIdentity } from '@/components/layout/sidebar/useGithubRepoOriginMap';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { GithubPullRequests } from './GithubPullRequests';
import { GithubActions } from './GithubActions';

type Props = {
  repository: GitHubRepositoryDto;
  localRepos: Map<string, string[]>;
  activeRepo: string | null;
  online: boolean;
  warning: string | null;
  onBack: () => void;
  onClone: () => void;
  onActivateLocal: (path: string) => Promise<boolean>;
  onOpenLocal: () => void;
  onOpenReleaseCreator: () => void;
};

export const GithubRepositoryDetail: React.FC<Props> = ({
  repository,
  localRepos,
  activeRepo,
  online,
  warning,
  onBack,
  onClone,
  onActivateLocal,
  onOpenLocal,
  onOpenReleaseCreator,
}) => {
  const { tr, locale } = useI18n();
  const [tab, setTab] = useState<'overview' | 'prs' | 'actions'>('overview');
  const [details, setDetails] = useState<GitHubRepositoryDetailsDto | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [upstreamDefaultBranch, setUpstreamDefaultBranch] = useState<string | null>(null);
  const [owner, repo] = repository.fullName.split('/');
  const localPaths = localRepos.get(toRepoIdentity(repository.htmlUrl) || '') || [];
  const activeLocalPath = localPaths.find((path) => activeRepo && normalizeRepoPathKey(path) === normalizeRepoPathKey(activeRepo)) || null;
  const upstreamUrl = useMemo(
    () => (details?.parent ? `${new URL(repository.htmlUrl).origin}/${details.parent.owner}/${details.parent.repo}` : null),
    [details, repository.htmlUrl],
  );
  const upstreamPaths = upstreamUrl ? localRepos.get(toRepoIdentity(upstreamUrl) || '') || [] : [];
  const activeUpstreamPath = upstreamPaths.find((path) => activeRepo && normalizeRepoPathKey(path) === normalizeRepoPathKey(activeRepo)) || null;
  const [useUpstream, setUseUpstream] = useState(false);
  const target = useUpstream && details?.parent ? details.parent : { owner, repo };
  const targetUrl = useUpstream && upstreamUrl ? upstreamUrl : repository.htmlUrl;

  useEffect(() => {
    setTab('overview');
    setUseUpstream(false);
    setDetails(null);
    setDetailError(null);
    setUpstreamDefaultBranch(null);
    if (!online) return;
    let active = true;
    void githubClient
      .getRepository(owner, repo)
      .then((result) => {
        if (!active) return;
        if (!result.success) throw new Error(result.error || 'Repository-Details konnten nicht geladen werden.');
        setDetails(result.data);
      })
      .catch((caught) => {
        if (active) setDetailError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      active = false;
    };
  }, [repository.id, online, owner, repo]);

  useEffect(() => {
    if (!online || !details?.parent) return;
    let active = true;
    void githubClient
      .getRepository(details.parent.owner, details.parent.repo)
      .then((result) => {
        if (active && result.success) setUpstreamDefaultBranch(result.data.defaultBranch);
      })
      .catch(() => {
        /* The branch picker still loads the available upstream branches. */
      });
    return () => {
      active = false;
    };
  }, [online, details?.parent]);

  const activate = async (path: string) => {
    setActivationMessage(null);
    try {
      const activated = await onActivateLocal(path);
      if (!activated)
        setActivationMessage(
          tr(
            'Lokaler Wechsel abgebrochen. Die Remote-Ansicht bleibt geöffnet; lokale Aktionen sind gesperrt.',
            'Local switch cancelled. The remote view remains open; local actions are disabled.',
          ),
        );
    } catch (caught) {
      setActivationMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="github-workspace__inner">
      <div className="github-detail__back">
        <button onClick={onBack}>
          <ArrowLeft size={16} /> {tr('Alle Repositories', 'All repositories')}
        </button>
      </div>
      <div className="github-detail__hero">
        <div className="github-detail__identity">
          <span className="github-repo-card__signet">
            <FolderGit2 size={23} />
          </span>
          <div>
            <span>{owner}</span>
            <h1>{repo}</h1>
            <p>{repository.description || tr('Keine Beschreibung vorhanden.', 'No description available.')}</p>
          </div>
        </div>
        <div className="github-detail__hero-actions">
          <button onClick={() => void githubClient.openExternalUrl(repository.htmlUrl)}>
            <ArrowUpRight size={16} /> GitHub
          </button>
          {online && !localPaths.length && (
            <button onClick={onClone}>
              <Download size={16} /> {tr('Klonen', 'Clone')}
            </button>
          )}
          {activeLocalPath && (
            <button onClick={onOpenLocal}>
              <FolderGit2 size={16} /> {tr('Repo-Tab öffnen', 'Open repository tab')}
            </button>
          )}
        </div>
      </div>
      {(warning || detailError || activationMessage) && (
        <div className="github-workspace__notice" role="status">
          {warning || detailError || activationMessage}
        </div>
      )}
      <div className="github-detail__tabs" role="tablist" aria-label={tr('Repository-Bereiche', 'Repository sections')}>
        <button role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>
          {tr('Überblick', 'Overview')}
        </button>
        <button role="tab" aria-selected={tab === 'prs'} disabled={!online} onClick={() => setTab('prs')}>
          <GitPullRequest size={15} /> {tr('Pull Requests', 'Pull requests')}
        </button>
        <button role="tab" aria-selected={tab === 'actions'} disabled={!online} onClick={() => setTab('actions')}>
          <Workflow size={15} /> Actions
        </button>
      </div>
      {tab === 'overview' && (
        <div className="github-detail__overview">
          <section className="github-detail__info">
            <h2>{tr('Repository', 'Repository')}</h2>
            <dl>
              <div>
                <dt>{tr('Sichtbarkeit', 'Visibility')}</dt>
                <dd>
                  {repository.private ? (
                    <>
                      <LockKeyhole size={14} /> {tr('Privat', 'Private')}
                    </>
                  ) : (
                    tr('Öffentlich', 'Public')
                  )}
                </dd>
              </div>
              <div>
                <dt>{tr('Aktualisiert', 'Updated')}</dt>
                <dd>{repository.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(repository.updatedAt)) : '—'}</dd>
              </div>
              <div>
                <dt>{tr('Standard-Branch', 'Default branch')}</dt>
                <dd>{details?.defaultBranch || '—'}</dd>
              </div>
              <div>
                <dt>{tr('Lokaler Status', 'Local status')}</dt>
                <dd>{localPaths.length ? `${localPaths.length} ${tr('Klone', 'clones')}` : tr('Nur Remote', 'Remote only')}</dd>
              </div>
              {details?.fork && details.parent && (
                <div>
                  <dt>Fork</dt>
                  <dd>
                    {details.parent.owner}/{details.parent.repo}
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section className="github-detail__info">
            <h2>{tr('Lokale Arbeit', 'Local work')}</h2>
            {localPaths.length ? (
              <>
                <p>
                  {activeLocalPath
                    ? tr('Ein passender Klon ist aktiv.', 'A matching clone is active.')
                    : tr('Aktiviere einen Klon für lokale Aktionen.', 'Activate a clone for local actions.')}
                </p>
                <div className="github-detail__local-list">
                  {localPaths.map((path) => (
                    <button key={path} disabled={!online || path === activeLocalPath} onClick={() => void activate(path)}>
                      <FolderGit2 size={15} />
                      <span title={path}>{path.split(/[\\/]/).pop()}</span>
                      {path === activeLocalPath ? tr('Aktiv', 'Active') : tr('Aktivieren', 'Activate')}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p>{tr('Dieses Repository ist noch nicht lokal geklont.', 'This repository has not been cloned locally.')}</p>
            )}
            <div className="github-detail__release">
              <button onClick={online && activeLocalPath ? onOpenReleaseCreator : () => void githubClient.openExternalUrl(`${repository.htmlUrl}/releases`)}>
                {tr('Releases', 'Releases')} <ArrowUpRight size={14} />
              </button>
              <span>
                {online && activeLocalPath
                  ? tr('Release Creator im Repo-Tab', 'Release Creator in repository tab')
                  : tr('Releases auf GitHub öffnen', 'Open releases on GitHub')}
              </span>
            </div>
          </section>
        </div>
      )}
      {tab === 'prs' && online && (
        <>
          <div className="github-detail__scope">
            {details?.fork && details.parent && (
              <label>
                <input type="checkbox" checked={useUpstream} onChange={(event) => setUseUpstream(event.target.checked)} />{' '}
                {tr('Pull Requests des Upstreams anzeigen', 'Show upstream pull requests')} ({details.parent.owner}/{details.parent.repo})
              </label>
            )}
          </div>
          <GithubPullRequests
            key={`${target.owner}/${target.repo}`}
            owner={target.owner}
            repo={target.repo}
            sourceOwner={owner}
            sourceRepo={repo}
            defaultBranch={useUpstream ? upstreamDefaultBranch || details?.defaultBranch || 'main' : details?.defaultBranch || 'main'}
            activeLocalPath={useUpstream ? activeUpstreamPath : activeLocalPath}
            repositoryUrl={targetUrl}
          />
        </>
      )}
      {tab === 'actions' && online && <GithubActions owner={owner} repo={repo} />}
    </div>
  );
};
