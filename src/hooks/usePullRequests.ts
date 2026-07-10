import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CiBadgeStateDto, GithubStatusChecksDto, GithubWorkflowRunDto, PullRequestCiDto, PullRequestDto } from '@/types/githubDtos';
import { createLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import type { RepoOwnerRef } from '@/types/git';

type CreatePRInput = {
  title: string;
  body: string;
  head: string;
  base: string;
  currentBranch: string;
};

type Params = {
  activeRepo: string | null;
  isAuthenticated: boolean;
  refreshTrigger: number;
  language: AppLanguage;
  githubHost?: string;
  onCreated?: (number: number) => void;
  onError?: (message: string) => void;
};

type PullRequestGitClient = Pick<typeof gitClient, 'isAvailable' | 'getRepoOriginUrl'>;
type PullRequestGithubClient = Pick<typeof githubClient, 'isAvailable' | 'getPullRequests' | 'getWorkflowRuns' | 'getStatusChecks' | 'createPullRequest'>;

type PullRequestClientDeps = {
  git?: PullRequestGitClient;
  github?: PullRequestGithubClient;
};

const getPullRequestClients = (
  deps?: PullRequestClientDeps,
): {
  git: PullRequestGitClient;
  github: PullRequestGithubClient;
} => ({
  git: deps?.git ?? gitClient,
  github: deps?.github ?? githubClient,
});

const BASE_POLL_INTERVAL_MS = 60_000;
const PENDING_POLL_INTERVAL_MS = 15_000;
const MAX_BACKOFF_INTERVAL_MS = 5 * 60_000;

export const usePullRequests = ({ activeRepo, isAuthenticated, refreshTrigger, language, githubHost = 'github.com', onCreated, onError }: Params) => {
  const [pullRequests, setPullRequests] = useState<PullRequestDto[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [prOwnerRepo, setPrOwnerRepo] = useState<RepoOwnerRef | null>(null);
  const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [prCiByNumber, setPrCiByNumber] = useState<Record<number, PullRequestCiDto>>({});
  const ownerRepoKeyRef = useRef('');
  const activeRepoRef = useRef<string | null>(activeRepo);
  const prOwnerRepoRef = useRef<RepoOwnerRef | null>(null);

  useLayoutEffect(() => {
    activeRepoRef.current = activeRepo;
    prOwnerRepoRef.current = null;
    ownerRepoKeyRef.current = '';
    setPrOwnerRepo(null);
    setPullRequests([]);
    setPrCiByNumber({});
    setPrLoading(false);
  }, [activeRepo, githubHost, isAuthenticated]);

  useEffect(() => {
    let active = true;

    const parseOwnerRepo = async () => {
      const resolution = await resolvePrOwnerRepoForRefresh(activeRepo, isAuthenticated, githubHost);
      if (!active || !resolution.resolved) return;

      const ownerRepo = resolution.ownerRepo;
      const nextOwnerRepoKey = ownerRepo ? `${ownerRepo.owner}/${ownerRepo.repo}` : '';
      if (ownerRepoKeyRef.current !== nextOwnerRepoKey) {
        ownerRepoKeyRef.current = nextOwnerRepoKey;
        setPullRequests([]);
        setPrCiByNumber({});
      }

      prOwnerRepoRef.current = ownerRepo;
      setPrOwnerRepo((previous) => {
        if (previous?.owner === ownerRepo?.owner && previous?.repo === ownerRepo?.repo) {
          return previous;
        }
        return ownerRepo;
      });
    };

    void parseOwnerRepo();
    return () => {
      active = false;
    };
  }, [activeRepo, isAuthenticated, refreshTrigger, githubHost]);

  useEffect(() => {
    let active = true;

    const fetchPRs = async () => {
      if (!prOwnerRepo || !isAuthenticated) {
        setPrLoading(false);
        return;
      }

      setPrLoading(true);
      const data = await loadPullRequests(prOwnerRepo, isAuthenticated, prFilter);
      if (!active) return;

      if (data !== null) {
        setPullRequests(data);
      }
      setPrLoading(false);
    };

    void fetchPRs();
    return () => {
      active = false;
    };
  }, [prOwnerRepo, isAuthenticated, prFilter, refreshTrigger]);

  const openPrs = useMemo(() => pullRequests.filter((pr) => pr.state === 'open'), [pullRequests]);

  useEffect(() => {
    if (!githubClient.isAvailable() || !prOwnerRepo || !isAuthenticated || openPrs.length === 0) {
      return;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let backoffMultiplier = 1;

    const pollCi = async () => {
      try {
        const ciEntries = await Promise.all(
          openPrs.map(async (pr) => {
            const ci = await loadPullRequestCi(prOwnerRepo, pr);
            return [pr.number, ci] as const;
          }),
        );

        if (cancelled) return;

        setPrCiByNumber((prev) => {
          const next = { ...prev };
          for (const [number, ci] of ciEntries) {
            if (ci) {
              next[number] = ci;
            }
          }
          return next;
        });

        const hasPending = ciEntries.some(([, ci]) => ci?.badge === 'pending');
        const nextDelay = hasPending ? PENDING_POLL_INTERVAL_MS : BASE_POLL_INTERVAL_MS;
        backoffMultiplier = 1;
        timeout = setTimeout(pollCi, nextDelay);
      } catch {
        if (cancelled) return;
        backoffMultiplier = Math.min(backoffMultiplier * 2, MAX_BACKOFF_INTERVAL_MS / BASE_POLL_INTERVAL_MS);
        timeout = setTimeout(pollCi, BASE_POLL_INTERVAL_MS * backoffMultiplier);
      }
    };

    void pollCi();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [isAuthenticated, openPrs, prOwnerRepo]);

  const createPR = useCallback(
    async ({ title, body, head, base, currentBranch }: CreatePRInput) => {
      if (!title.trim()) return false;
      const repoAtStart = activeRepo;
      const ownerRepoAtStart = prOwnerRepo;
      const ownerRepoKeyAtStart = ownerRepoAtStart ? `${ownerRepoAtStart.owner}/${ownerRepoAtStart.repo}` : '';

      const result = await submitPullRequest(
        ownerRepoAtStart,
        {
          title,
          body,
          head,
          base,
          currentBranch,
        },
        language,
      );
      const currentOwnerRepo = prOwnerRepoRef.current;
      const currentOwnerRepoKey = currentOwnerRepo ? `${currentOwnerRepo.owner}/${currentOwnerRepo.repo}` : '';
      if (activeRepoRef.current !== repoAtStart || currentOwnerRepoKey !== ownerRepoKeyAtStart) return false;

      if (result.success) {
        onCreated?.(result.number);
        return true;
      }

      onError?.(result.error);
      return false;
    },
    [activeRepo, language, onCreated, onError, prOwnerRepo],
  );

  return {
    pullRequests,
    prLoading,
    prOwnerRepo,
    prFilter,
    setPrFilter,
    prCiByNumber,
    createPR,
  };
};

function normalizeGithubHost(value: string): string {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return 'github.com';
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function parseOwnerRepoFromPath(pathValue: string): RepoOwnerRef | null {
  const sanitizedPath = String(pathValue || '')
    .trim()
    .replace(/\/+$/, '');
  if (!sanitizedPath) return null;

  const pathSegments = sanitizedPath.split('/').filter(Boolean);
  if (pathSegments.length < 2) return null;

  const owner = decodeURIComponent(pathSegments[pathSegments.length - 2] || '').trim();
  const repoWithSuffix = decodeURIComponent(pathSegments[pathSegments.length - 1] || '').trim();
  const repo = repoWithSuffix.replace(/\.git$/i, '').trim();

  if (!owner || !repo) return null;
  if (/\s/.test(owner) || /\s/.test(repo)) return null;

  return { owner, repo };
}

export const parsePrOwnerRepoFromRemote = (remoteUrl: string, githubHost: string = 'github.com'): RepoOwnerRef | null => {
  const trimmedRemote = remoteUrl.trim();
  const host = normalizeGithubHost(githubHost);
  if (!trimmedRemote) return null;

  const scpLikeMatch = trimmedRemote.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (scpLikeMatch && normalizeGithubHost(scpLikeMatch[1] || '') === host) {
    return parseOwnerRepoFromPath(scpLikeMatch[2] || '');
  }

  try {
    const parsedUrl = new URL(trimmedRemote);
    if (normalizeGithubHost(parsedUrl.host) !== host) {
      return null;
    }
    return parseOwnerRepoFromPath(parsedUrl.pathname || '');
  } catch {
    return null;
  }
};

export const resolvePrOwnerRepo = async (
  activeRepo: string | null,
  isAuthenticated: boolean,
  githubHost: string = 'github.com',
  deps?: PullRequestClientDeps,
): Promise<RepoOwnerRef | null> => {
  const resolution = await resolvePrOwnerRepoForRefresh(activeRepo, isAuthenticated, githubHost, deps);
  return resolution.resolved ? resolution.ownerRepo : null;
};

const resolvePrOwnerRepoForRefresh = async (
  activeRepo: string | null,
  isAuthenticated: boolean,
  githubHost: string,
  deps?: PullRequestClientDeps,
): Promise<{ resolved: true; ownerRepo: RepoOwnerRef | null } | { resolved: false }> => {
  const { git } = getPullRequestClients(deps);
  if (!activeRepo || !git.isAvailable() || !isAuthenticated) {
    return { resolved: true, ownerRepo: null };
  }

  try {
    const response = await git.getRepoOriginUrl(activeRepo);
    if (!response.success) return { resolved: false };
    if (!response.data) return { resolved: true, ownerRepo: null };
    return {
      resolved: true,
      ownerRepo: parsePrOwnerRepoFromRemote(String(response.data), githubHost),
    };
  } catch {
    return { resolved: false };
  }
};

export const loadPullRequests = async (
  prOwnerRepo: RepoOwnerRef | null,
  isAuthenticated: boolean,
  prFilter: 'open' | 'closed' | 'all',
  deps?: PullRequestClientDeps,
): Promise<PullRequestDto[] | null> => {
  const { github } = getPullRequestClients(deps);
  if (!prOwnerRepo || !github.isAvailable() || !isAuthenticated) return null;

  try {
    const result = await github.getPullRequests(prOwnerRepo.owner, prOwnerRepo.repo, prFilter);
    if (!result.success) return null;
    return result.data || [];
  } catch {
    return null;
  }
};

export const loadPullRequestCi = async (
  prOwnerRepo: RepoOwnerRef | null,
  pr: PullRequestDto,
  deps?: PullRequestClientDeps,
): Promise<PullRequestCiDto | null> => {
  const { github } = getPullRequestClients(deps);
  if (!github.isAvailable() || !prOwnerRepo || !pr.headSha) return null;

  try {
    const [workflowResult, checksResult] = await Promise.all([
      github.getWorkflowRuns({ owner: prOwnerRepo.owner, repo: prOwnerRepo.repo, headSha: pr.headSha, perPage: 50 }),
      github.getStatusChecks({ owner: prOwnerRepo.owner, repo: prOwnerRepo.repo, ref: pr.headSha }),
    ]);

    const workflowRuns = workflowResult.success ? workflowResult.data : [];
    const statusChecks = checksResult.success ? checksResult.data : null;
    const badge = computeCiBadge(workflowRuns, statusChecks);

    return {
      badge,
      summary: buildCiSummary(badge, workflowRuns, statusChecks),
      workflowRuns,
      statusChecks,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
};

function computeCiBadge(workflows: GithubWorkflowRunDto[], checks: GithubStatusChecksDto | null): CiBadgeStateDto {
  const conclusions = workflows.map((w) => w.conclusion).filter(Boolean);
  const hasFailure = conclusions.some((c) => c === 'failure' || c === 'cancelled' || c === 'timed_out' || c === 'action_required');
  const hasPendingWorkflow = workflows.some((w) => w.status !== 'completed' || !w.conclusion);

  if (hasFailure) return 'failure';

  if (checks) {
    if (checks.state === 'failure' || checks.state === 'error') return 'failure';
    if (checks.state === 'pending') return 'pending';
  }

  if (hasPendingWorkflow) return 'pending';
  if (conclusions.some((c) => c === 'success')) return 'success';
  if (checks?.state === 'success') return 'success';

  return workflows.length === 0 && !checks ? 'unknown' : 'neutral';
}

function buildCiSummary(badge: CiBadgeStateDto, workflows: GithubWorkflowRunDto[], checks: GithubStatusChecksDto | null): string {
  const checkCount = checks?.checkRuns.length || 0;
  const statusCount = checks?.statusContexts.length || 0;
  if (badge === 'success') return `CI passed (${workflows.length} workflows, ${checkCount + statusCount} checks)`;
  if (badge === 'failure') return `CI failed (${workflows.length} workflows, ${checkCount + statusCount} checks)`;
  if (badge === 'pending') return `CI pending (${workflows.length} workflows, ${checkCount + statusCount} checks)`;
  return `CI status (${workflows.length} workflows, ${checkCount + statusCount} checks)`;
}

export const submitPullRequest = async (
  prOwnerRepo: RepoOwnerRef | null,
  input: CreatePRInput,
  language: AppLanguage,
  deps?: PullRequestClientDeps,
): Promise<{ success: true; number: number } | { success: false; error: string }> => {
  const { t } = createLanguageTranslations(language);
  const { github } = getPullRequestClients(deps);

  if (!github.isAvailable() || !prOwnerRepo || !input.title.trim()) {
    return { success: false, error: t('generated.hooks.usepullrequests.error_creating_pr_a90b6ac1') };
  }

  try {
    const result = await github.createPullRequest({
      owner: prOwnerRepo.owner,
      repo: prOwnerRepo.repo,
      title: input.title.trim(),
      body: input.body.trim(),
      head: input.head || input.currentBranch,
      base: input.base || 'main',
    });

    if (!result.success) {
      return { success: false, error: result.error || t('generated.hooks.usepullrequests.error_creating_pr_a90b6ac1') };
    }

    return { success: true, number: result.data.number };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : t('generated.hooks.usepullrequests.error_creating_pr_a90b6ac1'),
    };
  }
};
