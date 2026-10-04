import { useCallback, useEffect, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
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

// eslint-disable-next-line no-control-regex -- strip terminal ANSI escapes before rendering text logs.
const cleanLog = (text: string) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
const isRunning = (run: HostingRun) =>
  !run.conclusion && !['completed', 'success', 'failed', 'error', 'cancelled', 'stopped'].includes(run.status.toLowerCase());
export function HostingCiPanel({ repository, capabilities }: { repository: HostedRepository; capabilities: HostingCapabilities }) {
  const { tr } = useI18n();
  const revision = useHostingState((s) => s.revision);
  const [branch, setBranch] = useState(repository.defaultBranch);
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
  const [workflow, setWorkflow] = useState('');
  const [inputs, setInputs] = useState('{}');
  const [status, setStatus] = useState<HostingStatus | null>(null);
  const [message, setMessage] = useState('');
  const reload = useCallback(() => hostingClient.request('runs', { repository: repository.ref, branch: branch || undefined }), [repository, branch]);
  useEffect(() => {
    setRun(null);
    setPage({ items: [], nextCursor: null });
    setStatus(null);
  }, [branch]);
  const refreshCi = () => {
    useHostingState.getState().refresh();
    if (run) setRun({ ...run });
    if (capabilities.runs) void task.run(reload, setPage);
    else void task.run(() => hostingClient.request('status', { repository: repository.ref, ref: branch }), setStatus);
  };
  useEffect(() => {
    if (capabilities.runs) void runTask(reload, setPage);
    else void runTask(() => hostingClient.request('status', { repository: repository.ref, ref: branch || repository.defaultBranch }), setStatus);
  }, [repository, branch, revision, capabilities.runs, reload, runTask]);
  useEffect(() => {
    if (!page.items.some(isRunning)) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void runTask(reload, setPage);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [page, reload, runTask]);
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
  return (
    <div className="hosting-ci">
      <div className="hosting-actions">
        <input aria-label="Ref" value={branch} onChange={(e) => setBranch(e.target.value)} />
        <button disabled={task.busy} onClick={refreshCi}>
          {tr('Aktualisieren', 'Refresh')}
        </button>
      </div>
      {!capabilities.runs && (
        <>
          <p>
            {tr(
              'Externe Buildstatus. Die Bedienung des CI-Systems erfolgt über dessen Buildlink.',
              'External build statuses. Control your CI system through its build link.',
            )}
          </p>
          {status?.checks.map((check) => (
            <p key={check.id}>
              {check.name}: {check.status}{' '}
              {check.htmlUrl && <button onClick={() => void appClient.openExternalUrl(check.htmlUrl!)}>{tr('Build öffnen', 'Open build')}</button>}
            </p>
          ))}
        </>
      )}
      {page.items.map((item) => (
        <button className="hosting-run" key={item.id} aria-pressed={run?.id === item.id} onClick={() => setRun(item)}>
          <strong>
            {item.name} #{item.number ?? item.id}
          </strong>
          <small>
            {item.branch} · {item.conclusion ?? item.status} · {item.createdAt}
          </small>
        </button>
      ))}
      {page.nextCursor && (
        <button
          disabled={task.busy}
          onClick={() =>
            void task.run(
              () => hostingClient.request('runs', { repository: repository.ref, branch: branch || undefined, cursor: page.nextCursor! }),
              (next) => setPage({ ...next, items: [...page.items, ...next.items] }),
            )
          }
        >
          {tr('Weitere laden', 'Load more')}
        </button>
      )}
      {run && (
        <article className="hosting-card">
          <h3>{run.name}</h3>
          <code>{run.headSha}</code>
          <div className="hosting-actions">
            <button onClick={() => void appClient.openExternalUrl(run.htmlUrl)}>{tr('Im Browser öffnen', 'Open in browser')}</button>
            {capabilities.cancelRun && isRunning(run) && (
              <button
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await hostingClient.request('cancelRun', { repository: repository.ref, runId: run.id });
                    return reload();
                  }, setPage)
                }
              >
                {tr('Abbrechen', 'Cancel')}
              </button>
            )}
            {capabilities.retryRun && !isRunning(run) && (
              <button
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await hostingClient.request('retryRun', { repository: repository.ref, runId: run.id });
                    return reload();
                  }, setPage)
                }
              >
                {tr('Wiederholen', 'Retry')}
              </button>
            )}
          </div>
          {jobs.items.map((job) => (
            <div className="hosting-job" key={job.id}>
              <strong>{job.name}</strong> · {job.conclusion ?? job.status}
              {job.steps.map((step) => (
                <small key={step.id}>
                  {step.name}: {step.conclusion ?? step.status}
                </small>
              ))}
              {capabilities.logs && (
                <button disabled={detailTask.busy} onClick={() => loadLog(job.id)}>
                  Logs
                </button>
              )}
              {job.htmlUrl && <button onClick={() => void appClient.openExternalUrl(job.htmlUrl)}>{tr('Öffnen', 'Open')}</button>}
              {job.status === 'manual' && capabilities.dispatch && (
                <button
                  disabled={task.busy}
                  onClick={() =>
                    void task.run(
                      () => hostingClient.request('dispatch', { repository: repository.ref, workflow: `job:${job.id}`, ref: run.branch }),
                      () => {
                        setMessage(tr('Manuellen Job gestartet', 'Manual job started'));
                        refreshCi();
                      },
                    )
                  }
                >
                  {tr('Manuellen Job starten', 'Start manual job')}
                </button>
              )}
            </div>
          ))}
          {jobs.nextCursor && (
            <button
              disabled={detailTask.busy}
              onClick={() =>
                void detailTask.run(
                  () => hostingClient.request('jobs', { repository: repository.ref, runId: run.id, cursor: jobs.nextCursor! }),
                  (next) => setJobs({ ...next, items: [...jobs.items, ...next.items] }),
                )
              }
            >
              {tr('Weitere Jobs laden', 'Load more jobs')}
            </button>
          )}
          {capabilities.runLogs && (
            <button disabled={detailTask.busy} onClick={() => loadLog()}>
              {tr('Lauf-Logs laden', 'Load run logs')}
            </button>
          )}
          {!capabilities.logs && (
            <p>{tr('Diese Server-API bietet keine Logs an. Logs im Browser öffnen.', 'This server API does not provide logs. Open logs in the browser.')}</p>
          )}
          {log && (
            <>
              <pre className="hosting-log">{log.text}</pre>
              {log.truncated && (
                <p>{tr('Log gekürzt. Weitere Teile nachladen oder im Browser öffnen.', 'Log truncated. Load more or open it in the browser.')}</p>
              )}
              {log.nextCursor && (
                <button disabled={detailTask.busy} onClick={() => loadLog(logJob, log.nextCursor!)}>
                  {tr('Weitere Logs laden', 'Load more logs')}
                </button>
              )}
            </>
          )}
          <h4>{tr('Artefakte', 'Artifacts')}</h4>
          {artifacts.items.map((artifact) => (
            <p key={artifact.id}>
              {artifact.name}
              {artifact.size !== undefined ? ` · ${artifact.size} B` : ''}
              {artifact.expiresAt ? ` · ${artifact.expiresAt}` : ''}{' '}
              {artifact.downloadable ? (
                <button
                  disabled={detailTask.busy}
                  onClick={() =>
                    void detailTask.run(
                      () => hostingClient.request('downloadArtifact', { repository: repository.ref, runId: run.id, artifactId: artifact.id }),
                      (saved) => {
                        if (saved) setMessage(saved.path);
                      },
                    )
                  }
                >
                  {tr('Herunterladen', 'Download')}
                </button>
              ) : artifact.htmlUrl ? (
                <button onClick={() => void appClient.openExternalUrl(artifact.htmlUrl!)}>{tr('Im Browser öffnen', 'Open in browser')}</button>
              ) : null}
            </p>
          ))}
          {!capabilities.artifacts && (
            <p>
              {tr('Artefakte sind über diese API nicht verfügbar.', 'Artifacts are unavailable through this API.')}{' '}
              <button onClick={() => void appClient.openExternalUrl(run.htmlUrl)}>{tr('Im Browser öffnen', 'Open in browser')}</button>
            </p>
          )}
          {artifacts.nextCursor && (
            <button
              disabled={detailTask.busy}
              onClick={() =>
                void detailTask.run(
                  () => hostingClient.request('artifacts', { repository: repository.ref, runId: run.id, cursor: artifacts.nextCursor! }),
                  (next) => setArtifacts({ ...next, items: [...artifacts.items, ...next.items] }),
                )
              }
            >
              {tr('Weitere Artefakte laden', 'Load more artifacts')}
            </button>
          )}
        </article>
      )}
      {capabilities.dispatch && (
        <details className="hosting-card">
          <summary>{tr('Neuen Lauf starten', 'Start a new run')}</summary>
          <form
            className="hosting-form"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                const parsed: unknown = JSON.parse(inputs);
                if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some((v) => typeof v !== 'string'))
                  throw new Error(tr('Inputs müssen ein JSON-Objekt mit Textwerten sein.', 'Inputs must be a JSON object with string values.'));
                await hostingClient.request('dispatch', { repository: repository.ref, workflow, ref: branch, inputs: parsed as Record<string, string> });
                return reload();
              }, setPage);
            }}
          >
            <label>
              {tr('Workflow-Datei / ID / Pipeline-Selector (optional)', 'Workflow file / ID / pipeline selector (optional)')}
              <input value={workflow} onChange={(e) => setWorkflow(e.target.value)} placeholder="ci.yml" />
            </label>
            <label>
              Ref
              <input required value={branch} onChange={(e) => setBranch(e.target.value)} />
            </label>
            <label>
              Inputs (JSON)
              <textarea value={inputs} onChange={(e) => setInputs(e.target.value)} />
            </label>
            <button disabled={task.busy}>{tr('Neuen Lauf starten', 'Start a new run')}</button>
          </form>
        </details>
      )}
      {message && <p role="status">{message}</p>}
      {[task.error, detailTask.error].filter(Boolean).map((error) => (
        <p className="hosting-error" role="alert" key={error}>
          {error}
        </p>
      ))}
    </div>
  );
}
