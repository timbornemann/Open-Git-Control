import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Ban, ChevronDown, ChevronRight, RefreshCw, RotateCcw, Workflow } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useUIContext } from '@/contexts/AppStateContext';
import { githubClient } from '@/services/githubClient';
import type { GithubWorkflowJobDto, GithubWorkflowRunDto } from '@/types/githubDtos';

type Props = { owner: string; repo: string };
const POLL_INTERVAL_MS = 45_000;

export const GithubActions: React.FC<Props> = ({ owner, repo }) => {
  const { tr, locale } = useI18n();
  const ui = useUIContext();
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [runs, setRuns] = useState<GithubWorkflowRunDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRun, setSelectedRun] = useState<GithubWorkflowRunDto | null>(null);
  const [jobs, setJobs] = useState<GithubWorkflowJobDto[]>([]);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsHasMore, setJobsHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const requestId = useRef(0);
  const nextAllowedAt = useRef(0);
  const retryDelay = useRef(POLL_INTERVAL_MS);

  const loadRuns = useCallback(
    async (manual = false) => {
      if ((!manual && (inFlight.current || Date.now() < nextAllowedAt.current)) || document.visibilityState !== 'visible') return;
      const currentRequest = ++requestId.current;
      inFlight.current = true;
      if (manual) {
        nextAllowedAt.current = 0;
        retryDelay.current = POLL_INTERVAL_MS;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await githubClient.getWorkflowRunsPage({ owner, repo, branch: branch || undefined, status: status || undefined, page, perPage: 20 });
        if (currentRequest !== requestId.current) return;
        if (!result.success) throw new Error(result.error || 'Actions-Läufe konnten nicht geladen werden.');
        setRuns(result.data.runs);
        setSelectedRun((current) => (current ? result.data.runs.find((run) => run.id === current.id) || null : null));
        setHasMore(result.data.hasMore);
        setTotalCount(result.data.totalCount);
        retryDelay.current = POLL_INTERVAL_MS;
        nextAllowedAt.current = Date.now() + POLL_INTERVAL_MS;
      } catch (caught) {
        if (currentRequest !== requestId.current) return;
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
        retryDelay.current = Math.min(retryDelay.current * 2, 5 * 60_000);
        nextAllowedAt.current = Date.now() + retryDelay.current;
      } finally {
        if (currentRequest === requestId.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [owner, repo, branch, status, page],
  );

  useEffect(() => {
    void loadRuns(true);
  }, [loadRuns]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadRuns();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadRuns();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadRuns]);
  useEffect(() => {
    let active = true;
    void githubClient.getBranches(owner, repo).then((result) => {
      if (active && result.success) setBranches(result.data);
    });
    return () => {
      active = false;
    };
  }, [owner, repo]);
  useEffect(() => {
    if (!selectedRun) {
      setJobs([]);
      return;
    }
    let active = true;
    setJobsLoading(true);
    void githubClient
      .getWorkflowJobsPage({ owner, repo, runId: selectedRun.id, page: jobsPage, perPage: 50 })
      .then((result) => {
        if (!active) return;
        if (!result.success) throw new Error(result.error || 'Jobs konnten nicht geladen werden.');
        setJobs(result.data.jobs);
        setJobsHasMore(result.data.hasMore);
      })
      .catch((caught) => {
        if (active) setActionError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setJobsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [owner, repo, selectedRun, jobsPage]);

  const controlRun = async (run: GithubWorkflowRunDto, action: 'rerun' | 'cancel') => {
    setActionError(null);
    const result = action === 'rerun' ? await githubClient.rerunFailedJobs(owner, repo, run.id) : await githubClient.cancelWorkflowRun(owner, repo, run.id);
    if (!result.success) {
      setActionError(result.error || tr('Aktion fehlgeschlagen. Prüfe die Actions-Schreibrechte.', 'Action failed. Check Actions write permission.'));
      return;
    }
    void loadRuns(true);
  };

  const confirmCancel = (run: GithubWorkflowRunDto) => {
    ui.setConfirmDialog({
      variant: 'danger',
      title: tr('Workflow-Lauf abbrechen?', 'Cancel workflow run?'),
      message: tr(`Der laufende Actions-Lauf #${run.id} wird abgebrochen.`, `The running Actions run #${run.id} will be cancelled.`),
      contextItems: [
        { label: 'Workflow', value: run.workflowName },
        { label: 'Branch', value: run.branch },
      ],
      irreversible: true,
      consequences: tr('Laufende Jobs werden gestoppt.', 'Running jobs will be stopped.'),
      confirmLabel: tr('Lauf abbrechen', 'Cancel run'),
      onConfirm: () => controlRun(run, 'cancel'),
    });
  };

  return (
    <section className="github-detail-panel">
      <div className="github-detail-panel__toolbar">
        <div>
          <h2>GitHub Actions</h2>
          <p>{tr('Workflow-Läufe aller Branches', 'Workflow runs across all branches')}</p>
        </div>
        <button onClick={() => void loadRuns(true)} aria-label={tr('Actions aktualisieren', 'Refresh Actions')}>
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="github-detail-panel__filters">
        <select
          aria-label={tr('Branch filtern', 'Filter branch')}
          value={branch}
          onChange={(event) => {
            setBranch(event.target.value);
            setPage(1);
            setSelectedRun(null);
          }}
        >
          <option value="">{tr('Alle Branches', 'All branches')}</option>
          {branches.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label={tr('Status filtern', 'Filter status')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
            setSelectedRun(null);
          }}
        >
          <option value="">{tr('Alle Status', 'All statuses')}</option>
          <option value="queued">Queued</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {error && (
        <div className="github-workspace__error" role="alert">
          {error} · {tr('Automatische Aktualisierung wartet bei Fehlern länger.', 'Automatic refresh backs off after errors.')}
        </div>
      )}
      {actionError && (
        <div className="github-workspace__error" role="alert">
          {actionError}
        </div>
      )}
      {loading && !runs.length ? (
        <div className="github-workspace__empty">{tr('Actions-Läufe werden geladen …', 'Loading Actions runs …')}</div>
      ) : runs.length === 0 ? (
        <div className="github-workspace__empty">{tr('Keine passenden Läufe gefunden.', 'No matching runs found.')}</div>
      ) : (
        <div className="github-detail-panel__list">
          {runs.map((run) => (
            <article className="github-run-row" key={run.id}>
              <button
                className="github-run-row__select"
                onClick={() => {
                  setSelectedRun(selectedRun?.id === run.id ? null : run);
                  setJobsPage(1);
                }}
                aria-expanded={selectedRun?.id === run.id}
              >
                {selectedRun?.id === run.id ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                <Workflow size={17} />
                <span>
                  <strong>{run.workflowName}</strong>
                  <small>
                    {run.branch || '—'} · {run.event} ·{' '}
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.createdAt))}
                  </small>
                </span>
              </button>
              <span className={`github-run-row__status github-run-row__status--${run.conclusion || run.status}`}>{run.conclusion || run.status}</span>
              <div className="github-pr-row__actions">
                <button
                  aria-label={tr('Auf GitHub öffnen', 'Open on GitHub')}
                  title={tr('Logs auf GitHub', 'Logs on GitHub')}
                  onClick={() => void githubClient.openExternalUrl(run.htmlUrl)}
                >
                  <ArrowUpRight size={15} />
                </button>
                {run.conclusion === 'failure' && (
                  <button title={tr('Fehlgeschlagene Jobs neu starten', 'Rerun failed jobs')} onClick={() => void controlRun(run, 'rerun')}>
                    <RotateCcw size={14} />
                  </button>
                )}
                {run.status !== 'completed' && (
                  <button title={tr('Lauf abbrechen', 'Cancel run')} onClick={() => confirmCancel(run)}>
                    <Ban size={14} />
                  </button>
                )}
              </div>
              {selectedRun?.id === run.id && (
                <div className="github-run-row__jobs">
                  {jobsLoading
                    ? tr('Jobs werden geladen …', 'Loading jobs …')
                    : jobs.length === 0
                      ? tr('Keine Jobs vorhanden.', 'No jobs available.')
                      : jobs.map((job) => (
                          <div className="github-job" key={job.id}>
                            <div className="github-job__head">
                              <strong>{job.name}</strong>
                              <span>{job.conclusion || job.status}</span>
                              <button onClick={() => void githubClient.openExternalUrl(job.htmlUrl || run.htmlUrl)}>
                                <ArrowUpRight size={14} /> {tr('Logs auf GitHub', 'Logs on GitHub')}
                              </button>
                            </div>
                            <ol>
                              {job.steps.map((step) => (
                                <li key={step.number}>
                                  <span>{step.name}</span>
                                  <span>{step.conclusion || step.status}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                  {(jobsPage > 1 || jobsHasMore) && (
                    <div className="github-detail-panel__pagination">
                      <button disabled={jobsPage <= 1} onClick={() => setJobsPage((value) => value - 1)}>
                        ←
                      </button>
                      <span>
                        {tr('Jobs-Seite', 'Jobs page')} {jobsPage}
                      </span>
                      <button disabled={!jobsHasMore} onClick={() => setJobsPage((value) => value + 1)}>
                        →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="github-detail-panel__pagination">
        <span>
          {totalCount} {tr('Läufe', 'runs')}
          {loading ? ' · …' : ''}
        </span>
        <div>
          <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            ←
          </button>
          <span>{page}</span>
          <button disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>
            →
          </button>
        </div>
      </div>
    </section>
  );
};
