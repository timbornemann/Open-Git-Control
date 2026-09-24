import type {
  CheckRunApi,
  CheckRunConclusion,
  CheckRunStatus,
  GithubCheckRunDto,
  GithubStatusContextDto,
  GithubWorkflowRunDto,
  GitHubOctokitProvider,
  StatusContextApi,
  WorkflowRunApi,
  WorkflowRunConclusion,
  WorkflowRunState,
} from './types';

const mapWorkflowRun = (run: WorkflowRunApi): GithubWorkflowRunDto => ({
  id: run.id,
  name: run.name || run.display_title || 'Workflow',
  status: (run.status || 'pending') as WorkflowRunState,
  conclusion: (run.conclusion ?? null) as WorkflowRunConclusion,
  event: run.event || 'unknown',
  htmlUrl: run.html_url,
  workflowName: run.display_title || run.name || 'Workflow',
  branch: run.head_branch || '',
  headSha: run.head_sha || '',
  createdAt: run.created_at,
  startedAt: run.run_started_at || run.created_at,
  updatedAt: run.updated_at,
});

export class GitHubWorkflowService {
  constructor(private readonly getOctokit: GitHubOctokitProvider) {}

  async getWorkflowRunsPage(owner: string, repo: string, params: { branch?: string; status?: string; page?: number; perPage?: number } = {}) {
    const octokit = this.getOctokit();
    const page = Number.isFinite(params.page) ? Math.max(1, Math.floor(params.page as number)) : 1;
    const perPage = Number.isFinite(params.perPage) ? Math.max(1, Math.min(100, Math.floor(params.perPage as number))) : 20;
    const status = params.status?.trim() as Parameters<typeof octokit.rest.actions.listWorkflowRunsForRepo>[0]['status'];
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      page,
      per_page: perPage,
      ...(params.branch ? { branch: params.branch } : {}),
      ...(status ? { status } : {}),
    });
    const runs = ((data.workflow_runs || []) as WorkflowRunApi[]).map(mapWorkflowRun);
    return { runs, page, hasMore: page * perPage < data.total_count, totalCount: data.total_count };
  }

  async getWorkflowJobsPage(owner: string, repo: string, runId: number, page = 1, perPage = 50) {
    const octokit = this.getOctokit();
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safePerPage = Number.isFinite(perPage) ? Math.max(1, Math.min(100, Math.floor(perPage))) : 50;
    const { data } = await octokit.rest.actions.listJobsForWorkflowRun({ owner, repo, run_id: runId, page: safePage, per_page: safePerPage });
    const jobs = (data.jobs as Array<{
      id: number; name: string; status: string; conclusion?: string | null; html_url?: string | null;
      started_at?: string | null; completed_at?: string | null;
      steps?: Array<{ number: number; name: string; status: string; conclusion?: string | null; started_at?: string | null; completed_at?: string | null }>;
    }>).map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion || null,
      htmlUrl: job.html_url || '',
      startedAt: job.started_at || null,
      completedAt: job.completed_at || null,
      steps: (job.steps || []).map((step) => ({
        number: step.number,
        name: step.name,
        status: step.status,
        conclusion: step.conclusion || null,
        startedAt: step.started_at || null,
        completedAt: step.completed_at || null,
      })),
    }));
    return { jobs, page: safePage, hasMore: safePage * safePerPage < data.total_count, totalCount: data.total_count };
  }

  async rerunFailedJobs(owner: string, repo: string, runId: number): Promise<true> {
    await this.getOctokit().rest.actions.reRunWorkflowFailedJobs({ owner, repo, run_id: runId });
    return true;
  }

  async cancelWorkflowRun(owner: string, repo: string, runId: number): Promise<true> {
    await this.getOctokit().rest.actions.cancelWorkflowRun({ owner, repo, run_id: runId });
    return true;
  }

  async getWorkflowRuns(owner: string, repo: string, params: { branch?: string; headSha?: string; perPage?: number } = {}) {
    const octokit = this.getOctokit();
    const safePerPage = Number.isFinite(params.perPage) ? Math.max(1, Math.min(Math.floor(params.perPage as number), 100)) : 20;

    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      ...(params.headSha ? { head_sha: params.headSha } : {}),
      ...(!params.headSha && params.branch ? { branch: params.branch } : {}),
      per_page: safePerPage,
    });

    const workflowRuns = (data.workflow_runs || []) as WorkflowRunApi[];
    const runs = workflowRuns.filter((run) => {
      if (!params.headSha) return true;
      return run.head_sha === params.headSha;
    });

    return runs.map(mapWorkflowRun);
  }

  async getStatusChecks(owner: string, repo: string, ref: string) {
    const octokit = this.getOctokit();
    const normalizedRef = (ref || '').trim();
    if (!normalizedRef) {
      throw new Error('Ref is required');
    }

    const perPage = 100;
    const maxPages = 100;
    const loadCheckRuns = async () => {
      const runs = new Map<number, CheckRunApi>();
      let reportedTotal: number | null = null;
      for (let page = 1; page <= maxPages; page += 1) {
        const response = await octokit.rest.checks.listForRef({ owner, repo, ref: normalizedRef, per_page: perPage, page });
        const pageRuns = (response.data.check_runs || []) as CheckRunApi[];
        const currentTotal = Number(response.data.total_count);
        if (Number.isFinite(currentTotal)) reportedTotal = Math.max(reportedTotal ?? 0, currentTotal);
        pageRuns.forEach((run) => runs.set(run.id, run));

        if ((reportedTotal !== null && runs.size >= reportedTotal) || pageRuns.length < perPage) break;
        if (page === maxPages) throw new Error('GitHub returned too many check runs to verify completely.');
      }
      if (reportedTotal !== null && runs.size < reportedTotal) {
        throw new Error(`GitHub check-run response was incomplete (${runs.size}/${reportedTotal}).`);
      }
      return [...runs.values()];
    };

    const loadStatusContexts = async () => {
      const contexts = new Map<number, StatusContextApi>();
      let reportedTotal: number | null = null;
      let state = 'pending';
      let sha = normalizedRef;
      for (let page = 1; page <= maxPages; page += 1) {
        const response = await octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref: normalizedRef, per_page: perPage, page });
        if (page === 1) {
          state = response.data.state || 'pending';
          sha = response.data.sha || normalizedRef;
        }
        const pageContexts = (response.data.statuses || []) as StatusContextApi[];
        const currentTotal = Number(response.data.total_count);
        if (Number.isFinite(currentTotal)) reportedTotal = Math.max(reportedTotal ?? 0, currentTotal);
        pageContexts.forEach((status) => contexts.set(status.id, status));

        if ((reportedTotal !== null && contexts.size >= reportedTotal) || pageContexts.length < perPage) break;
        if (page === maxPages) throw new Error('GitHub returned too many status contexts to verify completely.');
      }
      if (reportedTotal !== null && contexts.size < reportedTotal) {
        throw new Error(`GitHub status response was incomplete (${contexts.size}/${reportedTotal}).`);
      }
      return { contexts: [...contexts.values()], sha, state };
    };

    const [checkRunData, statusData] = await Promise.all([loadCheckRuns(), loadStatusContexts()]);

    const checkRuns = checkRunData.map((run): GithubCheckRunDto => ({
      id: run.id,
      name: run.name || run.app?.name || 'Check',
      status: (run.status || 'pending') as CheckRunStatus,
      conclusion: (run.conclusion ?? null) as CheckRunConclusion,
      detailsUrl: run.details_url || run.html_url || null,
      appName: run.app?.name || null,
      startedAt: run.started_at || null,
      completedAt: run.completed_at || null,
    }));

    const statusContexts = statusData.contexts.map((status): GithubStatusContextDto => ({
      id: status.id,
      context: status.context || 'status',
      state: status.state || 'pending',
      description: status.description || null,
      targetUrl: status.target_url || null,
      createdAt: status.created_at || null,
      updatedAt: status.updated_at || null,
    }));

    return {
      state: statusData.state,
      sha: statusData.sha,
      checkRuns,
      statusContexts,
    };
  }
}
