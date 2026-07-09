import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, DownloadCloud, FolderOpen, GitFork, RefreshCw, Search } from 'lucide-react';
import type { GitHubRepositoryDto } from '@/types/githubDtos';
import { useI18n } from '@/i18n';
import { toRepoIdentity, useGithubRepoOriginMap } from './useGithubRepoOriginMap';

type GithubRepoListProps = {
  repos: GitHubRepositoryDto[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  isCloning: boolean;
  openRepos: string[];
  activeRepo: string | null;
  onClone: (cloneUrl: string, repoName: string) => void;
  onCloneByUrl: () => void;
  onForkByUrl: () => void;
  onSwitchRepo: (repoPath: string) => void;
  onLoadMore: () => void;
  onRefresh: (search?: string) => void;
};

export const GithubRepoList: React.FC<GithubRepoListProps> = ({
  repos,
  hasMore,
  isLoading,
  isLoadingMore,
  isCloning,
  openRepos,
  activeRepo,
  onClone,
  onCloneByUrl,
  onForkByUrl,
  onSwitchRepo,
  onLoadMore,
  onRefresh,
}) => {
  const { t } = useI18n();
  const [repoSearch, setRepoSearch] = useState('');
  const hasMountedSearchRef = useRef(false);
  const refreshGithubReposRef = useRef(onRefresh);
  const localRepoByIdentity = useGithubRepoOriginMap(openRepos);

  useEffect(() => {
    refreshGithubReposRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!hasMountedSearchRef.current) {
      hasMountedSearchRef.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      refreshGithubReposRef.current(repoSearch);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [repoSearch]);

  return (
    <>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={repoSearch}
            onChange={(e) => setRepoSearch(e.target.value)}
            placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.search_github_repositories_6886fc19')}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '6px 8px 6px 28px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-panel)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
            }}
          />
        </div>
        <button
          className="icon-btn"
          style={{ padding: '6px' }}
          onClick={() => onRefresh(repoSearch)}
          title={t('generated.components.layout.sidebar.githubconnectedcontent.refresh_list_4d33cd9b')}
        >
          <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button
          className="staging-btn-sm"
          onClick={onCloneByUrl}
          title={t('generated.components.layout.sidebar.githubconnectedcontent.clone_any_repository_via_http_ssh_url_a4c092a4')}
        >
          <DownloadCloud size={12} /> {t('generated.components.layout.sidebar.githubconnectedcontent.clone_via_url_2a8ca14d')}
        </button>
        <button
          className="staging-btn-sm"
          onClick={onForkByUrl}
          title={t('generated.components.layout.sidebar.githubconnectedcontent.fork_and_clone_a_github_repository_from_url_6d14f3d1')}
        >
          <GitFork size={12} /> {t('generated.components.layout.sidebar.githubconnectedcontent.fork_via_url_37240822')}
        </button>
      </div>

      {isLoading && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {t('generated.components.layout.sidebar.githubconnectedcontent.loading_repositories_c7b4fd01')}
        </div>
      )}

      {!isLoading &&
        repos.map((repo) => {
          const repoIdentity = toRepoIdentity(repo.cloneUrl);
          const localRepoPath = repoIdentity ? localRepoByIdentity.get(repoIdentity) : undefined;
          const isLocallyAvailable = Boolean(localRepoPath);
          const isActiveLocalRepo = Boolean(localRepoPath && localRepoPath === activeRepo);

          return (
            <div
              key={repo.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px',
                backgroundColor: 'var(--bg-panel)',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                gap: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '0.85rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
                title={repo.fullName}
              >
                {repo.fullName}
              </span>

              {isLocallyAvailable ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: 'var(--status-success)',
                      backgroundColor: 'var(--status-success-soft)',
                      border: '1px solid var(--status-success-border)',
                      borderRadius: '999px',
                      padding: '2px 8px',
                    }}
                    title={t('generated.components.layout.sidebar.githubconnectedcontent.already_available_locally_e6f1b562')}
                  >
                    <CheckCircle2 size={12} /> {t('generated.components.layout.sidebar.githubconnectedcontent.local_0a3c619d')}
                  </span>
                  <button
                    onClick={() => localRepoPath && onSwitchRepo(localRepoPath)}
                    className="icon-btn"
                    style={{ padding: '4px', opacity: isActiveLocalRepo ? 0.55 : 1 }}
                    title={
                      isActiveLocalRepo
                        ? t('generated.components.layout.sidebar.githubconnectedcontent.already_active_27e8dc92')
                        : t('generated.components.layout.sidebar.githubconnectedcontent.open_local_repository_a84c251c')
                    }
                    disabled={!localRepoPath || isActiveLocalRepo}
                  >
                    <FolderOpen size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onClone(repo.cloneUrl, repo.name)}
                  disabled={isCloning}
                  className="icon-btn"
                  style={{ padding: '4px' }}
                  title={t('generated.components.layout.cloneprogressmodal.clone_repository_25099131')}
                >
                  <DownloadCloud size={14} />
                </button>
              )}
            </div>
          );
        })}

      {!isLoading && repos.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {t('generated.components.layout.sidebar.githubconnectedcontent.no_repositories_found_fb34108a')}
        </div>
      )}

      {hasMore && (
        <button className="staging-tool-btn" onClick={onLoadMore} disabled={isLoadingMore} style={{ alignSelf: 'center' }}>
          {isLoadingMore
            ? t('generated.components.layout.sidebar.githubconnectedcontent.loading_more_b6e2cbcf')
            : t('generated.components.layout.sidebar.githubconnectedcontent.load_more_74d5e677')}
        </button>
      )}
    </>
  );
};
