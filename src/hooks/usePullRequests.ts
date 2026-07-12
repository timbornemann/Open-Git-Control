import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CiBadgeStateDto, GithubStatusChecksDto, GithubWorkflowRunDto, PullRequestCiDto, PullRequestDto } from '@/types/githubDtos';
import { createLanguageTranslations, type AppLanguage } from '@/i18nCore';
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
type PullRequestGithubClient = Pick<
  typeof githubClient,
  'isAvailable' | 'getPullRequests' | 'getWorkflowRuns' | 'getStatusChecks' | 'createPullRequest' | 'getRepository'
>;

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

export const retainCiForCurrentHeads = (previous: Record<number, PullRequestCiDto>, pullRequests: PullRequestDto[]): Record<number, PullRequestCiDto> => {
  const next: Record<number, PullRequestCiDto> = {};
  for (const pr of pullRequests) {
    const cached = previous[pr.number];
    if (cached?.headSha === pr.headSha) next[pr.number] = cached;
  }
  return next;
};

export const usePullRequests = ({ activeRepo, isAuthenticated, refreshTrigger, language, githubHost = 'github.com', onCreated, onError }: Params) => {
  const [pullRequests, setPullRequests] = useState<PullRequestDto[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [prHasLoaded, setPrHasLoaded] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [prOwnerRepo, setPrOwnerRepo] = useState<RepoOwnerRef | null>(null);
  const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [prCiByNumber, setPrCiByNumber] = useState<Record<number, PullRequestCiDto>>({});
  const ownerRepoKeyRef = useRef('');
  const activeRepoRef = useRef<string | null>(activeRepo);
  const prOwnerRepoRef = useRef<RepoOwnerRef | null>(null);
  const callbacksRef = useRef({ onCreated, onError });
  const prScopeKeyRef = useRef('');
  const prScopeKey = prOwnerRepo ? `${prOwnerRepo.owner}/${prOwnerRepo.repo}:${prFilter}` : '';

  useLayoutEffect(() => {
    callbacksRef.current = { onCreated, onError };
  }, [onCreated, onError]);

  useLayoutEffect(() => {
    activeRepoRef.current = activeRepo;
    prOwnerRepoRef.current = null;
    ownerRepoKeyRef.current = '';
    setPrOwnerRepo(null);
    setPullRequests([]);
    setPrCiByNumber({});
    setPrLoading(false);
    setPrHasLoaded(false);
    setPrError(null);
  }, [activeRepo, githubHost, isAuthenticated]);

  useLayoutEffect(() => {
    if (prScopeKeyRef.current === prScopeKey) return;
    prScopeKeyRef.current = prScopeKey;
    setPullRequests([]);
    setPrCiByNumber({});
    setPrHasLoaded(false);
    setPrError(null);
  }, [prScopeKey]);

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
        if (
          previous?.owner === ownerRepo?.owner &&
          previous?.repo === ownerRepo?.repo &&
          previous?.headOwner === ownerRepo?.headOwner &&
          previous?.headRepo === ownerRepo?.headRepo &&
          previous?.defaultBranch === ownerRepo?.defaultBranch
        ) {
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
        setPrHasLoaded(false);
        setPrError(null);
        return;
      }

      setPrLoading(true);
      setPrError(null);
      const result = await loadPullRequests(prOwnerRepo, isAuthenticated, prFilter, undefined, language);
      if (!active) return;

      if (result?.ok) {
        setPullRequests(result.data);
        setPrCiByNumber((previous) => retainCiForCurrentHeads(previous, result.data));
        setPrError(null);
      } else if (result && !result.ok) {
        setPrError(result.error);
        callbacksRef.current.onError?.(result.error);
      }
      setPrHasLoaded(true);
      setPrLoading(false);
    };

    void fetchPRs();
    return () => {
      active = false;
    };
  }, [prOwnerRepo, isAuthenticated, prFilter, refreshTrigger, language]);

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
            const ci = await loadPullRequestCi(prOwnerRepo, pr, undefined, language);
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
  }, [isAuthenticated, language, openPrs, prOwnerRepo]);

  const createPR = useCallback(
    async ({ title, body, head, base, currentBranch }: CreatePRInput) => {
      if (!title.trim()) return false;
      const repoAtStart = activeRepo;
      const ownerRepoAtStart = prOwnerRepo;
      const ownerRepoKeyAtStart = ownerRepoAtStart ? `${ownerRepoAtStart.owner}/${ownerRepoAtStart.repo}` : '';

      if (!repoAtStart || !gitClient.isAvailable()) return false;
      const authorization = await gitClient.getRepoOriginUrl(repoAtStart);
      const ownerRepoAfterAuthorization = prOwnerRepoRef.current;
      const ownerRepoKeyAfterAuthorization = ownerRepoAfterAuthorization ? `${ownerRepoAfterAuthorization.owner}/${ownerRepoAfterAuthorization.repo}` : '';
      if (activeRepoRef.current !== repoAtStart || ownerRepoKeyAfterAuthorization !== ownerRepoKeyAtStart) return false;
      if (!authorization.success) {
        callbacksRef.current.onError?.(authorization.error || 'Requested repository is no longer active.');
        return false;
      }

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
        undefined,
        () => {
          const currentOwnerRepo = prOwnerRepoRef.current;
          const currentOwnerRepoKey = currentOwnerRepo ? `${currentOwnerRepo.owner}/${currentOwnerRepo.repo}` : '';
          return activeRepoRef.current === repoAtStart && currentOwnerRepoKey === ownerRepoKeyAtStart;
        },
      );
      const currentOwnerRepo = prOwnerRepoRef.current;
      const currentOwnerRepoKey = currentOwnerRepo ? `${currentOwnerRepo.owner}/${currentOwnerRepo.repo}` : '';
      if (activeRepoRef.current !== repoAtStart || currentOwnerRepoKey !== ownerRepoKeyAtStart) return false;

      if (result.success) {
        callbacksRef.current.onCreated?.(result.number);
        return true;
      }

      callbacksRef.current.onError?.(result.error);
      return false;
    },
    [activeRepo, language, prOwnerRepo],
  );

  return {
    pullRequests,
    prLoading,
    prHasLoaded,
    prError,
    prOwnerRepo,
    prFilter,
    setPrFilter,
    prCiByNumber,
    prDefaultBranch: prOwnerRepo?.defaultBranch || '',
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
  const { git, github } = getPullRequestClients(deps);
  if (!activeRepo || !git.isAvailable() || !isAuthenticated) {
    return { resolved: true, ownerRepo: null };
  }

  try {
    const response = await git.getRepoOriginUrl(activeRepo);
    if (!response.success) return { resolved: false };
    if (!response.data) return { resolved: true, ownerRepo: null };
    const origin = parsePrOwnerRepoFromRemote(String(response.data), githubHost);
    if (!origin || !github.isAvailable()) return { resolved: true, ownerRepo: origin };

    let originResult: Awaited<ReturnType<PullRequestGithubClient['getRepository']>>;
    try {
      originResult = await github.getRepository(origin.owner, origin.repo);
    } catch {
      return { resolved: false };
    }
    if (!originResult.success) return { resolved: false };
    const details = originResult.data;
    if (!details.fork || !details.parent) {
      return { resolved: true, ownerRepo: { ...origin, defaultBranch: details.defaultBranch || 'main' } };
    }

    let upstreamResult: Awaited<ReturnType<PullRequestGithubClient['getRepository']>> | null = null;
    try {
      upstreamResult = await github.getRepository(details.parent.owner, details.parent.repo);
    } catch {
      // Listing against the upstream is still correct; only its default branch
      // metadata is temporarily unavailable.
    }
    const defaultBranch = upstreamResult?.success ? upstreamResult.data.defaultBranch : details.defaultBranch;
    return {
      resolved: true,
      ownerRepo: {
        owner: details.parent.owner,
        repo: details.parent.repo,
        headOwner: origin.owner,
        headRepo: origin.repo,
        defaultBranch: defaultBranch || 'main',
      },
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
  language: AppLanguage = 'de',
): Promise<{ ok: true; data: PullRequestDto[] } | { ok: false; error: string } | null> => {
  const { github } = getPullRequestClients(deps);
  const { tr } = createLanguageTranslations(language);
  if (!prOwnerRepo || !github.isAvailable() || !isAuthenticated) return null;

  try {
    const result = await github.getPullRequests(prOwnerRepo.owner, prOwnerRepo.repo, prFilter);
    if (!result.success) {
      return { ok: false, error: result.error || tr('Pull Requests konnten nicht geladen werden.', 'Pull requests could not be loaded.') };
    }
    return { ok: true, data: result.data || [] };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : tr('Pull Requests konnten nicht geladen werden.', 'Pull requests could not be loaded.'),
    };
  }
};

export const loadPullRequestCi = async (
  prOwnerRepo: RepoOwnerRef | null,
  pr: PullRequestDto,
  deps?: PullRequestClientDeps,
  language: AppLanguage = 'en',
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
    const partialBadge = computeCiBadge(workflowRuns, statusChecks);
    const incomplete = !workflowResult.success || !checksResult.success;
    const badge = incomplete && partialBadge !== 'failure' ? 'unknown' : partialBadge;
    const summary = incomplete
      ? language === 'de'
        ? 'CI-Status unvollstaendig: Mindestens eine GitHub-Abfrage ist fehlgeschlagen.'
        : 'CI status incomplete: at least one GitHub query failed.'
      : buildCiSummary(badge, workflowRuns, statusChecks, language);

    return {
      headSha: pr.headSha,
      badge,
      summary,
      workflowRuns,
      statusChecks,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
};

export function computeCiBadge(workflows: GithubWorkflowRunDto[], checks: GithubStatusChecksDto | null): CiBadgeStateDto {
  const conclusions = workflows.map((w) => w.conclusion).filter(Boolean);
  const checkRunConclusions = checks?.checkRuns.map((run) => run.conclusion).filter(Boolean) || [];
  const failureStates = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure']);
  const hasFailure =
    conclusions.some((conclusion) => failureStates.has(String(conclusion))) ||
    checkRunConclusions.some((conclusion) => failureStates.has(String(conclusion))) ||
    checks?.statusContexts.some((status) => status.state === 'failure' || status.state === 'error') === true;
  const hasPendingWorkflow = workflows.some((w) => w.status !== 'completed' || !w.conclusion);
  const hasPendingCheckRun = checks?.checkRuns.some((run) => run.status !== 'completed' || !run.conclusion) === true;

  if (hasFailure) return 'failure';

  if (checks && checks.statusContexts.length > 0) {
    if (checks.state === 'failure' || checks.state === 'error') return 'failure';
    if (checks.state === 'pending') return 'pending';
  }

  if (hasPendingWorkflow || hasPendingCheckRun) return 'pending';
  if (conclusions.some((c) => c === 'success') || checkRunConclusions.some((c) => c === 'success')) return 'success';
  if (checks?.statusContexts.length && checks.state === 'success') return 'success';

  const hasAnyChecks = Boolean(checks && (checks.checkRuns.length > 0 || checks.statusContexts.length > 0));
  return workflows.length === 0 && !hasAnyChecks ? 'unknown' : 'neutral';
}

function buildCiSummary(badge: CiBadgeStateDto, workflows: GithubWorkflowRunDto[], checks: GithubStatusChecksDto | null, language: AppLanguage): string {
  const checkCount = checks?.checkRuns.length || 0;
  const statusCount = checks?.statusContexts.length || 0;
  const counts = `(${workflows.length} Workflows, ${checkCount + statusCount} Checks)`;
  if (language === 'de') {
    if (badge === 'success') return `CI erfolgreich ${counts}`;
    if (badge === 'failure') return `CI fehlgeschlagen ${counts}`;
    if (badge === 'pending') return `CI ausstehend ${counts}`;
    return `CI-Status ${counts}`;
  }
  if (badge === 'success') return `CI passed ${counts}`;
  if (badge === 'failure') return `CI failed ${counts}`;
  if (badge === 'pending') return `CI pending ${counts}`;
  return `CI status ${counts}`;
}

export const submitPullRequest = async (
  prOwnerRepo: RepoOwnerRef | null,
  input: CreatePRInput,
  language: AppLanguage,
  deps?: PullRequestClientDeps,
  canCreate?: () => boolean,
): Promise<{ success: true; number: number } | { success: false; error: string }> => {
  const { t } = createLanguageTranslations(language);
  const { github } = getPullRequestClients(deps);

  if (!github.isAvailable() || !prOwnerRepo || !input.title.trim()) {
    return { success: false, error: t('generated.hooks.usepullrequests.error_creating_pr_a90b6ac1') };
  }

  try {
    let owner = prOwnerRepo.owner;
    let repo = prOwnerRepo.repo;
    let head = input.head || input.currentBranch;
    let defaultBranch = prOwnerRepo.defaultBranch || 'main';

    if (prOwnerRepo.headOwner) {
      const branch = (input.head || input.currentBranch || '').trim();
      head = branch.includes(':') ? branch : `${prOwnerRepo.headOwner}:${branch}`;
    }

    if (!prOwnerRepo.headOwner && github.getRepository) {
      const repositoryResult = await github.getRepository(prOwnerRepo.owner, prOwnerRepo.repo);
      if (repositoryResult.success) {
        defaultBranch = repositoryResult.data.defaultBranch || defaultBranch;
        if (repositoryResult.data.fork && repositoryResult.data.parent) {
          owner = repositoryResult.data.parent.owner;
          repo = repositoryResult.data.parent.repo;
          const branch = (input.head || input.currentBranch || '').trim();
          head = `${prOwnerRepo.owner}:${branch}`;
          if (!input.base.trim()) {
            const upstreamResult = await github.getRepository(owner, repo);
            if (upstreamResult?.success) defaultBranch = upstreamResult.data.defaultBranch || defaultBranch;
          }
        }
      }
    }

    // Repository metadata can require one or more awaits. Revalidate the
    // initiating repository immediately before the irreversible remote write.
    if (canCreate && !canCreate()) {
      return { success: false, error: 'Requested repository is no longer active.' };
    }

    const result = await github.createPullRequest({
      owner,
      repo,
      title: input.title.trim(),
      body: input.body.trim(),
      head,
      base: input.base.trim() || defaultBranch,
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
