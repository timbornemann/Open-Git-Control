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

    const [checksResponse, statusesResponse] = await Promise.all([
      octokit.rest.checks.listForRef({ owner, repo, ref: normalizedRef, per_page: 100 }),
      octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref: normalizedRef, per_page: 100 }),
    ]);

    const checkRuns = ((checksResponse.data.check_runs || []) as CheckRunApi[]).map((run): GithubCheckRunDto => ({
      id: run.id,
      name: run.name || run.app?.name || 'Check',
      status: (run.status || 'pending') as CheckRunStatus,
      conclusion: (run.conclusion ?? null) as CheckRunConclusion,
      detailsUrl: run.details_url || run.html_url || null,
      appName: run.app?.name || null,
      startedAt: run.started_at || null,
      completedAt: run.completed_at || null,
    }));

    const statusContexts = ((statusesResponse.data.statuses || []) as StatusContextApi[]).map((status): GithubStatusContextDto => ({
      id: status.id,
      context: status.context || 'status',
      state: status.state || 'pending',
      description: status.description || null,
      targetUrl: status.target_url || null,
      createdAt: status.created_at || null,
      updatedAt: status.updated_at || null,
    }));

    return {
      state: statusesResponse.data.state || 'pending',
      sha: statusesResponse.data.sha || normalizedRef,
      checkRuns,
      statusContexts,
    };
  }
}
