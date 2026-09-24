import React, { useEffect, useState } from 'react';
import { GithubAuthContent } from '@/components/layout/sidebar/GithubAuthContent';
import { useGithubContext, useRepositoryContext, useUIContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { GitHubRepositoryDto } from '@/types/githubDtos';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { toRepoIdentity } from '@/components/layout/sidebar/useGithubRepoOriginMap';
import { useGithubCatalog } from './useGithubCatalog';
import { useLocalGithubRepos } from './useLocalGithubRepos';
import { readGithubPinnedIds, setGithubRepoPinned, GITHUB_PINS_CHANGED_EVENT } from './githubPinStore';
import { GithubCatalog } from './GithubCatalog';
import { GithubCreateRepoDialog } from './GithubCreateRepoDialog';
import { GithubRepositoryDetail } from './GithubRepositoryDetail';

const sameSet = (left: Set<number>, right: Set<number>): boolean => left.size === right.size && [...left].every((value) => right.has(value));

export const GithubWorkspaceView: React.FC = () => {
  const { tr, locale } = useI18n();
  const github = useGithubContext();
  const repository = useRepositoryContext();
  const { repoMeta, onSetRepoPins } = repository;
  const ui = useUIContext();
  const catalog = useGithubCatalog(github.isAuthenticated, github.githubUser);
  const localRepos = useLocalGithubRepos(repository.openRepos);
  const [selected, setSelected] = useState<GitHubRepositoryDto | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  const accountHost = catalog.account?.host || '';
  const accountUser = catalog.account?.username || '';

  useEffect(() => {
    setPinnedIds(readGithubPinnedIds(accountHost, accountUser));
    const onChanged = () => setPinnedIds(readGithubPinnedIds(accountHost, accountUser));
    window.addEventListener(GITHUB_PINS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(GITHUB_PINS_CHANGED_EVENT, onChanged);
  }, [accountHost, accountUser]);

  useEffect(() => {
    if (!accountHost || !accountUser || !catalog.repos.length) return;
    const next = readGithubPinnedIds(accountHost, accountUser);
    for (const repo of catalog.repos) {
      const paths = localRepos.get(toRepoIdentity(repo.htmlUrl) || '') || [];
      if (paths.some((path) => repoMeta[path]?.pinned)) next.add(repo.id);
      if (next.has(repo.id) && paths.some((path) => !repoMeta[path]?.pinned)) onSetRepoPins(paths, true);
    }
    if (!sameSet(next, readGithubPinnedIds(accountHost, accountUser))) {
      for (const repo of catalog.repos) {
        if (next.has(repo.id)) setGithubRepoPinned(accountHost, accountUser, repo.id, true);
      }
    }
    setPinnedIds((current) => (sameSet(current, next) ? current : next));
  }, [accountHost, accountUser, catalog.repos, localRepos, repoMeta, onSetRepoPins]);

  useEffect(() => {
    if (!github.isAuthenticated) setSelected(null);
  }, [github.isAuthenticated]);

  const online = github.isAuthenticated && !catalog.offline;
  const togglePin = (repo: GitHubRepositoryDto) => {
    if (!online || !accountHost || !accountUser) return;
    const pinned = !pinnedIds.has(repo.id);
    setGithubRepoPinned(accountHost, accountUser, repo.id, pinned);
    setPinnedIds(readGithubPinnedIds(accountHost, accountUser));
    const paths = localRepos.get(toRepoIdentity(repo.htmlUrl) || '') || [];
    repository.onSetRepoPins(paths, pinned);
  };

  const openRepository = (repo: GitHubRepositoryDto) => {
    setSelected(repo);
    setWarning(null);
    const paths = localRepos.get(toRepoIdentity(repo.htmlUrl) || '') || [];
    if (!online || !paths.length || paths.some((path) => repository.activeRepo && normalizeRepoPathKey(path) === normalizeRepoPathKey(repository.activeRepo)))
      return;
    void repository
      .onSwitchRepo(paths[0])
      .then((activated) => {
        if (!activated)
          setWarning(
            tr(
              'Lokaler Repo-Wechsel abgebrochen. Du kannst die Remote-Ansicht weiter nutzen.',
              'Local repository switch cancelled. You can still use the remote view.',
            ),
          );
      })
      .catch((caught) => setWarning(caught instanceof Error ? caught.message : String(caught)));
  };

  const onCreated = (result: { repository: GitHubRepositoryDto; brandedReadme: boolean; warning?: string }) => {
    setShowCreate(false);
    catalog.setRepos((current) => [result.repository, ...current.filter((repo) => repo.id !== result.repository.id)]);
    setSelected(result.repository);
    setWarning(
      result.brandedReadme
        ? null
        : result.warning ||
            tr('Repo erstellt. Die README-Vorlage konnte nicht angewendet werden.', 'Repository created. The README template could not be applied.'),
    );
    void catalog.refresh();
  };

  return (
    <div className="github-workspace">
      {!github.isAuthenticated && (
        <div className="github-workspace__login">
          <GithubAuthContent
            tokenInput={github.tokenInput}
            setTokenInput={github.setTokenInput}
            isAuthenticating={github.isAuthenticating}
            authError={github.authError}
            setAuthError={github.setAuthError}
            onTokenLogin={github.onTokenLogin}
            oauthConfigured={github.oauthConfigured}
            deviceFlow={github.deviceFlow}
            isDeviceFlowRunning={github.isDeviceFlowRunning}
            deviceFlowError={github.deviceFlowError}
            onStartDeviceFlowLogin={github.onStartDeviceFlowLogin}
            onCancelAuthentication={github.onCancelAuthentication}
            onCancelDeviceFlow={github.onCancelDeviceFlow}
            isWebFlowRunning={github.isWebFlowRunning}
            webFlowError={github.webFlowError}
            onStartWebFlowLogin={github.onStartWebFlowLogin}
            selectedGithubAuthHelpMethod={github.selectedGithubAuthHelpMethod}
            onSelectGithubAuthHelpMethod={github.onSelectGithubAuthHelpMethod}
          />
        </div>
      )}
      {(catalog.offline || catalog.error) && catalog.repos.length > 0 && (
        <div className="github-workspace__offline" role="status">
          {tr('Offline-Momentaufnahme', 'Offline snapshot')} ·{' '}
          {catalog.savedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(catalog.savedAt)) : '—'}
          {catalog.error ? ` · ${catalog.error}` : ''}
        </div>
      )}
      {catalog.error && catalog.repos.length === 0 && (
        <div className="github-workspace__error" role="alert">
          {catalog.error}
        </div>
      )}
      {!selected ? (
        (github.isAuthenticated || catalog.repos.length > 0) && (
          <GithubCatalog
            repos={catalog.repos}
            localRepos={localRepos}
            pinnedIds={pinnedIds}
            online={online}
            loading={catalog.loading}
            loadedCount={catalog.loadedCount}
            onOpen={openRepository}
            onTogglePin={togglePin}
            onClone={(repo) => github.onClone(repo.cloneUrl, repo.name)}
            onCreate={() => setShowCreate(true)}
          />
        )
      ) : (
        <GithubRepositoryDetail
          repository={selected}
          localRepos={localRepos}
          activeRepo={repository.activeRepo}
          online={online}
          warning={warning}
          onBack={() => {
            setSelected(null);
            setWarning(null);
          }}
          onClone={() => github.onClone(selected.cloneUrl, selected.name)}
          onActivateLocal={repository.onSwitchRepo}
          onOpenLocal={() => ui.setActiveTab('repo')}
          onOpenReleaseCreator={() => {
            ui.setActiveTab('repo');
            github.onOpenReleaseCreator();
          }}
        />
      )}
      {showCreate && <GithubCreateRepoDialog onClose={() => setShowCreate(false)} onCreated={onCreated} />}
    </div>
  );
};
