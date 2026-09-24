import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, GitMerge, GitPullRequest, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useSettingsContext, useUIContext, useWorkflowContext } from '@/contexts/AppStateContext';
import { githubClient } from '@/services/githubClient';
import { gitClient } from '@/services/gitClient';
import type { PullRequestDto } from '@/types/githubDtos';

type Props = {
  owner: string;
  repo: string;
  sourceOwner: string;
  sourceRepo: string;
  defaultBranch: string;
  activeLocalPath: string | null;
  repositoryUrl: string;
};

const PAGE_SIZE = 10;

export const GithubPullRequests: React.FC<Props> = ({ owner, repo, sourceOwner, sourceRepo, defaultBranch, activeLocalPath, repositoryUrl }) => {
  const { tr } = useI18n();
  const ui = useUIContext();
  const workflow = useWorkflowContext();
  const settings = useSettingsContext();
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [prs, setPrs] = useState<PullRequestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ci, setCi] = useState<Record<number, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [sourceBranches, setSourceBranches] = useState<string[]>([]);
  const [baseBranches, setBaseBranches] = useState<string[]>([]);
  const [head, setHead] = useState('');
  const [base, setBase] = useState(defaultBranch);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setPrs([]);
    setCi({});
    void githubClient
      .getPullRequests(owner, repo, filter)
      .then((result) => {
        if (!active) return;
        if (!result.success) throw new Error(result.error || 'Pull Requests konnten nicht geladen werden.');
        setPrs(result.data);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [owner, repo, filter, refreshKey]);

  useEffect(() => {
    let active = true;
    setSourceBranches([]);
    setBaseBranches([]);
    void Promise.all([
      githubClient.getBranches(sourceOwner, sourceRepo),
      sourceOwner === owner && sourceRepo === repo ? githubClient.getBranches(sourceOwner, sourceRepo) : githubClient.getBranches(owner, repo),
    ]).then(([source, target]) => {
      if (!active) return;
      if (source.success) {
        setSourceBranches(source.data);
        setHead(source.data.find((branch) => branch !== defaultBranch) || source.data[0] || '');
      }
      if (target.success) {
        setBaseBranches(target.data);
        setBase(target.data.includes(defaultBranch) ? defaultBranch : target.data[0] || defaultBranch);
      }
    });
    return () => {
      active = false;
    };
  }, [owner, repo, sourceOwner, sourceRepo, defaultBranch]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return prs.filter((pr) => !query || `${pr.title} ${pr.number} ${pr.user} ${pr.head} ${pr.base}`.toLowerCase().includes(query));
  }, [prs, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(() => filtered.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE), [filtered, page, pages]);

  useEffect(() => {
    let active = true;
    void Promise.all(
      visible
        .filter((pr) => pr.headSha)
        .map(async (pr) => {
          const checks = await githubClient.getStatusChecks({ owner, repo, ref: pr.headSha });
          if (!checks.success) return [pr.number, tr('CI nicht verfügbar', 'CI unavailable')] as const;
          const states = [
            ...checks.data.checkRuns.map((check) => check.conclusion || check.status),
            ...checks.data.statusContexts.map((status) => status.state),
          ];
          const summary =
            states.length === 0
              ? tr('Keine Checks', 'No checks')
              : states.some((state) => ['failure', 'error', 'timed_out', 'action_required'].includes(state))
                ? tr('CI fehlgeschlagen', 'CI failed')
                : states.some((state) => ['pending', 'queued', 'in_progress', 'waiting', 'requested'].includes(state))
                  ? tr('CI läuft', 'CI running')
                  : tr('CI erfolgreich', 'CI passed');
          return [pr.number, summary] as const;
        }),
    )
      .then((entries) => {
        if (active) setCi((previous) => ({ ...previous, ...Object.fromEntries(entries) }));
      })
      .catch(() => {
        /* CI errors stay local to each row. */
      });
    return () => {
      active = false;
    };
  }, [owner, repo, visible, tr]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !head || !base || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await githubClient.createPullRequest({
        owner,
        repo,
        title: title.trim(),
        body,
        head: sourceOwner === owner && sourceRepo === repo ? head : `${sourceOwner}:${head}`,
        base,
      });
      if (!result.success) throw new Error(result.error || 'Pull Request konnte nicht erstellt werden.');
      setShowCreate(false);
      setTitle('');
      setBody('');
      setFilter('open');
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const merge = (pr: PullRequestDto) => {
    if (!pr.headSha) {
      setError(tr('Der PR-Head konnte nicht geprüft werden. Bitte die Liste aktualisieren.', 'The PR head could not be verified. Refresh the list.'));
      return;
    }
    const execute = async () => {
      setError(null);
      const result = await githubClient.mergePullRequest({ owner, repo, pullNumber: pr.number, mergeMethod: 'merge', expectedHeadSha: pr.headSha });
      if (!result.success) {
        setError(result.error || tr('Merge fehlgeschlagen. Der PR-Head hat sich möglicherweise geändert.', 'Merge failed. The PR head may have changed.'));
        return;
      }
      setRefreshKey((value) => value + 1);
    };
    if (!settings.settings.confirmDangerousOps) {
      void execute();
      return;
    }
    ui.setConfirmDialog({
      variant: 'danger',
      title: tr(`Pull Request #${pr.number} mergen?`, `Merge pull request #${pr.number}?`),
      message: tr(
        `PR #${pr.number} wird in ${owner}/${repo} gemergt. GitHub prüft dabei den erwarteten Head-Commit.`,
        `PR #${pr.number} will be merged into ${owner}/${repo}. GitHub will verify the expected head commit.`,
      ),
      contextItems: [
        { label: 'Repository', value: `${owner}/${repo}` },
        { label: 'Head', value: pr.headSha.slice(0, 12) },
      ],
      irreversible: true,
      consequences: tr('Der Remote-Branch wird auf GitHub zusammengeführt.', 'The remote branch will be merged on GitHub.'),
      confirmLabel: tr('PR mergen', 'Merge PR'),
      onConfirm: execute,
    });
  };

  const checkout = async (pr: PullRequestDto) => {
    if (!activeLocalPath) return;
    const branch = gitClient.getPullRequestBranchName(pr.number, pr.head);
    const remote = `${repositoryUrl.replace(/\/$/, '')}.git`;
    const fetched = await workflow.runGitCommand(
      gitClient.buildFetchPullRequestBranchArgs(pr.number, remote),
      tr('PR-Branch geladen.', 'PR branch fetched.'),
      undefined,
      { expectedRepoPath: activeLocalPath, skipDirtyGuard: true },
    );
    if (!fetched) return;
    const existing = await gitClient.runGitCommandForRepo(activeLocalPath, 'branch', '--list', branch);
    if (!existing.success) {
      setError(existing.error || 'Lokaler Branch konnte nicht geprüft werden.');
      return;
    }
    const exists = String(existing.data || '')
      .split(/\r?\n/)
      .some((line) => line.trim().replace(/^\*\s+/, '') === branch);
    const args = exists ? gitClient.buildCheckoutExistingPullRequestBranchArgs(branch) : gitClient.buildCheckoutPullRequestBranchArgs(branch);
    const checkedOut = await workflow.runGitCommand(args, tr(`PR-Branch ${branch} ausgecheckt.`, `Checked out PR branch ${branch}.`), undefined, {
      expectedRepoPath: activeLocalPath,
    });
    if (!checkedOut) return;
    const [remoteArgs, mergeArgs] = gitClient.buildPullRequestUpstreamConfigArgs(branch, remote, pr.number);
    await gitClient.runGitCommandForRepo(activeLocalPath, remoteArgs[0], ...remoteArgs.slice(1));
    await gitClient.runGitCommandForRepo(activeLocalPath, mergeArgs[0], ...mergeArgs.slice(1));
  };

  return (
    <section className="github-detail-panel">
      <div className="github-detail-panel__toolbar">
        <div>
          <h2>{tr('Pull Requests', 'Pull requests')}</h2>
          <p>
            {owner}/{repo}
          </p>
        </div>
        <button onClick={() => setRefreshKey((value) => value + 1)} aria-label={tr('Pull Requests aktualisieren', 'Refresh pull requests')}>
          <RefreshCw size={15} />
        </button>
        <button className="github-workspace__primary" onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? tr('Schließen', 'Close') : tr('PR erstellen', 'Create PR')}
        </button>
      </div>
      {showCreate && (
        <form className="github-detail-panel__form" onSubmit={(event) => void create(event)}>
          <label>
            {tr('Titel', 'Title')}
            <input required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="github-detail-panel__form-grid">
            <label>
              {tr('Head-Branch', 'Head branch')}
              <select value={head} onChange={(event) => setHead(event.target.value)}>
                {sourceBranches.map((branch) => (
                  <option key={branch}>{branch}</option>
                ))}
              </select>
            </label>
            <label>
              {tr('Base-Branch', 'Base branch')}
              <select value={base} onChange={(event) => setBase(event.target.value)}>
                {baseBranches.map((branch) => (
                  <option key={branch}>{branch}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {tr('Beschreibung', 'Description')}
            <textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <button className="github-workspace__primary" disabled={submitting || !sourceBranches.length || !baseBranches.length}>
            {submitting ? tr('Erstelle …', 'Creating …') : tr('Pull Request erstellen', 'Create pull request')}
          </button>
        </form>
      )}
      <div className="github-detail-panel__filters">
        <select
          aria-label={tr('PR-Status', 'PR status')}
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value as typeof filter);
            setPage(1);
          }}
        >
          <option value="open">{tr('Offen', 'Open')}</option>
          <option value="closed">{tr('Geschlossen', 'Closed')}</option>
          <option value="all">{tr('Alle', 'All')}</option>
        </select>
        <input
          aria-label={tr('Pull Requests durchsuchen', 'Search pull requests')}
          placeholder={tr('Titel, Nummer, Branch …', 'Title, number, branch …')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>
      {error && (
        <div className="github-workspace__error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="github-workspace__empty">{tr('Pull Requests werden geladen …', 'Loading pull requests …')}</div>
      ) : visible.length === 0 ? (
        <div className="github-workspace__empty">{tr('Keine passenden Pull Requests.', 'No matching pull requests.')}</div>
      ) : (
        <div className="github-detail-panel__list">
          {visible.map((pr) => (
            <article className="github-pr-row" key={pr.number}>
              <GitPullRequest size={18} />
              <div className="github-pr-row__body">
                <strong>{pr.title}</strong>
                <span>
                  #{pr.number} · {pr.user} · {pr.head} → {pr.base}
                  {pr.draft ? ` · ${tr('Entwurf', 'Draft')}` : ''}
                </span>
                <span className="github-pr-row__ci">{ci[pr.number] || tr('CI wird geladen …', 'Loading CI …')}</span>
              </div>
              <div className="github-pr-row__actions">
                <button
                  title={tr('Auf GitHub öffnen', 'Open on GitHub')}
                  aria-label={tr(`PR #${pr.number} öffnen`, `Open PR #${pr.number}`)}
                  onClick={() => void githubClient.openExternalUrl(pr.htmlUrl)}
                >
                  <ArrowUpRight size={15} />
                </button>
                {pr.state === 'open' && (
                  <>
                    <button
                      disabled={!activeLocalPath}
                      title={
                        activeLocalPath ? tr('Lokal auschecken', 'Check out locally') : tr('Passenden lokalen Klon aktivieren', 'Activate matching local clone')
                      }
                      onClick={() => void checkout(pr)}
                    >
                      {tr('Checkout', 'Checkout')}
                    </button>
                    <button onClick={() => merge(pr)}>
                      <GitMerge size={14} /> {tr('Mergen', 'Merge')}
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="github-detail-panel__pagination">
        <span>
          {filtered.length} {tr('Pull Requests', 'pull requests')}
        </span>
        <div>
          <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            ←
          </button>
          <span>
            {Math.min(page, pages)} / {pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
            →
          </button>
        </div>
      </div>
    </section>
  );
};
