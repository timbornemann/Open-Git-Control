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

export class GitHubWorkflowService {
  constructor(private readonly getOctokit: GitHubOctokitProvider) {}

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

    return runs.map((run): GithubWorkflowRunDto => ({
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
    }));
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
