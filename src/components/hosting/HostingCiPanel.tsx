import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Loader2, Play, RefreshCw, Workflow } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type {
  HostedRepository,
  HostingArtifact,
  HostingCapabilities,
  HostingJob,
  HostingLog,
  HostingPage,
  HostingRun,
  HostingStatus,
} from '@/types/hostingDtos';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingCiRunList, HostingCiBuildStatus, isHostingRunActive } from './HostingCiRunList';
import { HostingCiRunDetails } from './HostingCiRunDetails';
import { HostingCiStartRun } from './HostingCiStartRun';
import './hosting-ci.css';

// eslint-disable-next-line no-control-regex -- strip terminal ANSI escapes before rendering text logs.
const cleanLog = (text: string) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');

export function HostingCiPanel({
  repository,
  capabilities,
  repoPath = null,
}: {
  repository: HostedRepository;
  capabilities: HostingCapabilities;
  repoPath?: string | null;
}) {
  const { tr } = useI18n();
  const onToast = useGitStore((state) => state.onToast);
  const revision = useHostingState((state) => state.revision);
  const filterId = useId();
  const startId = useId();
  const [branch, setBranch] = useState(repository.defaultBranch);
  const [startOpen, setStartOpen] = useState(false);
  const task = useHostingTask(`${hostedRepositoryKey(repository)}/${branch}`);
  const { run: runTask } = task;
  const [page, setPage] = useState<HostingPage<HostingRun>>({ items: [], nextCursor: null });
  const [run, setRun] = useState<HostingRun | null>(null);
  const detailTask = useHostingTask(`${hostedRepositoryKey(repository)}/${run?.id ?? ''}`);
  const { run: runDetail, setError: setDetailError } = detailTask;
  const [jobs, setJobs] = useState<HostingPage<HostingJob>>({ items: [], nextCursor: null });
  const [artifacts, setArtifacts] = useState<HostingPage<HostingArtifact>>({ items: [], nextCursor: null });
  const [log, setLog] = useState<HostingLog | null>(null);
  const [logJob, setLogJob] = useState<string | undefined>();
  const [status, setStatus] = useState<HostingStatus | null>(null);
  const reload = useCallback(() => hostingClient.request('runs', { repository: repository.ref, branch: branch || undefined }), [repository, branch]);
  const applyPage = useCallback((next: HostingPage<HostingRun>) => {
    setPage(next);
    setRun((selected) => {
      const updated = next.items.find((item) => item.id === selected?.id);
      return updated && (updated.status !== selected?.status || updated.conclusion !== selected?.conclusion) ? updated : selected;
    });
  }, []);
  useEffect(() => {
    setRun(null);
    setPage({ items: [], nextCursor: null });
    setStatus(null);
  }, [branch]);
  const refreshCi = useCallback(() => {
    useHostingState.getState().refresh();
    setRun((selected) => (selected ? { ...selected } : null));
  }, []);
  useEffect(() => {
    if (capabilities.runs) void runTask(reload, applyPage);
    else void runTask(() => hostingClient.request('status', { repository: repository.ref, ref: branch || repository.defaultBranch }), setStatus);
  }, [repository, branch, revision, capabilities.runs, reload, runTask, applyPage]);
  useEffect(() => {
    if (!page.items.some(isHostingRunActive)) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void runTask(reload, applyPage);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [page, reload, runTask, applyPage]);
  useEffect(() => {
    let active = true;
    setJobs({ items: [], nextCursor: null });
    setArtifacts({ items: [], nextCursor: null });
    setLog(null);
    if (!run) return;
    void runDetail(async () => {
      const results = await Promise.allSettled([
        capabilities.jobs || capabilities.steps
          ? hostingClient.request('jobs', { repository: repository.ref, runId: run.id })
          : Promise.resolve({ items: [], nextCursor: null } as HostingPage<HostingJob>),
        capabilities.artifacts
          ? hostingClient.request('artifacts', { repository: repository.ref, runId: run.id })
          : Promise.resolve({ items: [], nextCursor: null } as HostingPage<HostingArtifact>),
      ]);
      if (!active) return;
      if (results[0].status === 'fulfilled') setJobs(results[0].value);
      else setDetailError(String(results[0].reason));
      if (results[1].status === 'fulfilled') setArtifacts(results[1].value);
      else setDetailError(String(results[1].reason));
    });
    return () => {
      active = false;
    };
  }, [run, repository, capabilities.jobs, capabilities.steps, capabilities.artifacts, runDetail, setDetailError]);
  const loadLog = (jobId?: string, cursor?: string) => {
    if (run)
      void detailTask.run(
        () => hostingClient.request('logs', { repository: repository.ref, runId: run.id, jobId, cursor }),
        (next) => {
          setLogJob(jobId);
          setLog({ ...next, text: cleanLog(cursor ? `${log?.text ?? ''}\n${next.text}` : next.text).slice(-1000000) });
        },
      );
  };
  const changeRun = (operation: 'cancelRun' | 'retryRun') => {
    if (run)
      void task.run(async () => {
        await hostingClient.request(operation, { repository: repository.ref, runId: run.id });
        useHostingState.getState().refresh();
        return reload();
      }, applyPage);
  };
  return (
    <div className="hosting-ci">
      <header className="hosting-ci-toolbar">
        <div className="hosting-ci-toolbar__title">
          <Workflow size={17} aria-hidden="true" />
          <h2>{capabilities.runs ? tr('Lauf-Verlauf', 'Run history') : tr('Buildstatus', 'Build status')}</h2>
          {page.items.length > 0 && <span title={tr('Geladene Läufe', 'Loaded runs')}>{page.items.length}</span>}
        </div>
        <div className="hosting-ci-toolbar__actions">
          <Button icon={<RefreshCw size={14} />} disabled={task.busy} onClick={refreshCi}>
            {tr('Aktualisieren', 'Refresh')}
          </Button>
          {capabilities.dispatch && (
            <Button
              variant="primary"
              icon={<Play size={14} />}
              aria-expanded={startOpen}
              aria-controls={startOpen ? startId : undefined}
              disabled={startOpen}
              onClick={() => setStartOpen(true)}
            >
              {tr('Neuen Lauf starten', 'Start a new run')}
            </Button>
          )}
        </div>
      </header>
      {capabilities.dispatch && startOpen && (
        <HostingCiStartRun
          key={hostedRepositoryKey(repository)}
          id={startId}
          repository={repository}
          repoPath={repoPath}
          defaultRef={branch || repository.defaultBranch}
          onClose={() => setStartOpen(false)}
          onStarted={() => {
            onToast(tr('Lauf gestartet.', 'Run started.'), false);
            setStartOpen(false);
            refreshCi();
          }}
        />
      )}
      <div className="hosting-ci-filter">
        <label htmlFor={filterId}>{tr('Branch / Ref', 'Branch / ref')}</label>
        <TextField id={filterId} value={branch} onChange={(event) => setBranch(event.target.value)} placeholder={tr('Alle Branches', 'All branches')} />
        {task.busy && <Loader2 size={14} className="spin" aria-label={tr('Laden …', 'Loading …')} />}
      </div>
      {!capabilities.runs && <HostingCiBuildStatus status={status} busy={task.busy} error={task.error} />}
      {page.items.length > 0 && <HostingCiRunList runs={page.items} selected={run?.id} onSelect={setRun} />}
      {capabilities.runs && !page.items.length && !task.busy && !task.error && (
        <div className="hosting-empty hosting-ci-empty">
          <Workflow size={28} aria-hidden="true" />
          <h3>{tr('Keine Läufe für diesen Ref', 'No runs for this ref')}</h3>
          <p>
            {tr('Wähle einen anderen Branch oder starte einen neuen Lauf, sofern unterstützt.', 'Choose another branch or start a new run where supported.')}
          </p>
        </div>
      )}
      {task.busy && !page.items.length && (
        <p className="hosting-ci-loading" role="status">
          <Loader2 size={15} className="spin" aria-hidden="true" />
          {tr('Läufe werden geladen …', 'Loading runs …')}
        </p>
      )}
      {page.nextCursor && (
        <div className="hosting-ci-pagination">
          <Button
            disabled={task.busy}
            onClick={() =>
              void task.run(
                () => hostingClient.request('runs', { repository: repository.ref, branch: branch || undefined, cursor: page.nextCursor! }),
                (next) => setPage((previous) => ({ ...next, items: [...previous.items, ...next.items] })),
              )
            }
          >
            {tr('Weitere laden', 'Load more')}
          </Button>
        </div>
      )}
      {run && (
        <HostingCiRunDetails
          run={run}
          capabilities={capabilities}
          jobs={jobs}
          artifacts={artifacts}
          log={log}
          logName={jobs.items.find((job) => job.id === logJob)?.name ?? run.name}
          busy={detailTask.busy}
          actionBusy={task.busy}
          error={detailTask.error}
          onCancel={() => changeRun('cancelRun')}
          onRetry={() => changeRun('retryRun')}
          onLog={loadLog}
          onMoreLog={() => loadLog(logJob, log?.nextCursor ?? undefined)}
          onMoreJobs={() =>
            void detailTask.run(
              () => hostingClient.request('jobs', { repository: repository.ref, runId: run.id, cursor: jobs.nextCursor! }),
              (next) => setJobs((previous) => ({ ...next, items: [...previous.items, ...next.items] })),
            )
          }
          onMoreArtifacts={() =>
            void detailTask.run(
              () => hostingClient.request('artifacts', { repository: repository.ref, runId: run.id, cursor: artifacts.nextCursor! }),
              (next) => setArtifacts((previous) => ({ ...next, items: [...previous.items, ...next.items] })),
            )
          }
          onDownload={(artifactId) =>
            void detailTask.run(
              () => hostingClient.request('downloadArtifact', { repository: repository.ref, runId: run.id, artifactId }),
              (saved) => {
                if (saved) onToast(tr(`Artefakt gespeichert: ${saved.path}`, `Artifact saved: ${saved.path}`), false);
              },
            )
          }
          onManualJob={(jobId) =>
            void task.run(
              () => hostingClient.request('dispatch', { repository: repository.ref, workflow: `job:${jobId}`, ref: run.branch }),
              () => {
                onToast(tr('Manuellen Job gestartet.', 'Manual job started.'), false);
                refreshCi();
              },
            )
          }
        />
      )}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </div>
  );
}
