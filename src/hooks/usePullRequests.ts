import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CiBadgeStateDto,
  ElectronAPI,
  GithubStatusChecksDto,
  GithubWorkflowRunDto,
  PullRequestCiDto,
  PullRequestDto,
} from '../global';
import { trByLanguage, type AppLanguage } from '../i18n';
import { RepoOwnerRef } from '../types/git';

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

const BASE_POLL_INTERVAL_MS = 60_000;
const PENDING_POLL_INTERVAL_MS = 15_000;
const MAX_BACKOFF_INTERVAL_MS = 5 * 60_000;

export const usePullRequests = ({ activeRepo, isAuthenticated, refreshTrigger, language, githubHost = 'github.com', onCreated, onError }: Params) => {
  const [pullRequests, setPullRequests] = useState<PullRequestDto[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [prOwnerRepo, setPrOwnerRepo] = useState<RepoOwnerRef | null>(null);
  const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [prCiByNumber, setPrCiByNumber] = useState<Record<number, PullRequestCiDto>>({});

  useEffect(() => {
    const parseOwnerRepo = async () => {
      const ownerRepo = await resolvePrOwnerRepo(window.electronAPI, activeRepo, isAuthenticated, githubHost);
      setPrOwnerRepo(ownerRepo);
      if (!ownerRepo) {
        setPullRequests([]);
        setPrCiByNumber({});
      }
    };
    void parseOwnerRepo();
  }, [activeRepo, isAuthenticated, refreshTrigger, githubHost]);

  useEffect(() => {
    const fetchPRs = async () => {
      setPrLoading(true);
      const data = await loadPullRequests(window.electronAPI, prOwnerRepo, isAuthenticated, prFilter);
      setPullRequests(data);
      setPrLoading(false);
    };
    void fetchPRs();
  }, [prOwnerRepo, isAuthenticated, prFilter, refreshTrigger]);

  const openPrs = useMemo(() => pullRequests.filter(pr => pr.state === 'open'), [pullRequests]);

  useEffect(() => {
    if (!window.electronAPI || !prOwnerRepo || !isAuthenticated || openPrs.length === 0) {
      return;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let backoffMultiplier = 1;

    const pollCi = async () => {
      try {
        const ciEntries = await Promise.all(
          openPrs.map(async (pr) => {
            const ci = await loadPullRequestCi(window.electronAPI, prOwnerRepo, pr);
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

  const createPR = useCallback(async ({ title, body, head, base, currentBranch }: CreatePRInput) => {
    if (!title.trim()) return false;

    const result = await submitPullRequest(window.electronAPI, prOwnerRepo, {
      title,
      body,
      head,
      base,
      currentBranch,
    }, language);

    if (result.success) {
      onCreated?.(result.number);
      return true;
    }

    onError?.(result.error);
    return false;
  }, [language, onCreated, onError, prOwnerRepo]);

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

export const parsePrOwnerRepoFromRemote = (remoteUrl: string, githubHost: string = 'github.com'): RepoOwnerRef | null => {
  const trimmedRemote = remoteUrl.trim();
  const host = normalizeGithubHost(githubHost).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const httpsMatch = trimmedRemote.match(new RegExp(`${host}\/([^/]+)\/([^/.]+)`));
  const sshMatch = trimmedRemote.match(new RegExp(`${host}:([^/]+)\/([^/.]+)`));
  const match = httpsMatch || sshMatch;

  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
  };
};

export const resolvePrOwnerRepo = async (
  electronAPI: ElectronAPI | undefined,
  activeRepo: string | null,
  isAuthenticated: boolean,
  githubHost: string = 'github.com',
): Promise<RepoOwnerRef | null> => {
  if (!activeRepo || !electronAPI || !isAuthenticated) return null;

  try {
    const response = await electronAPI.runGitCommand('remote', 'get-url', 'origin');
    if (!response.success || !response.data) return null;
    return parsePrOwnerRepoFromRemote(String(response.data), githubHost);
  } catch {
    return null;
  }
};

export const loadPullRequests = async (
  electronAPI: ElectronAPI | undefined,
  prOwnerRepo: RepoOwnerRef | null,
  isAuthenticated: boolean,
  prFilter: 'open' | 'closed' | 'all',
): Promise<PullRequestDto[]> => {
  if (!prOwnerRepo || !electronAPI || !isAuthenticated) return [];

  try {
    const result = await electronAPI.githubGetPRs(prOwnerRepo.owner, prOwnerRepo.repo, prFilter);
    if (!result.success) return [];
    return result.data || [];
  } catch {
    return [];
  }
};

export const loadPullRequestCi = async (
  electronAPI: ElectronAPI | undefined,
  prOwnerRepo: RepoOwnerRef | null,
  pr: PullRequestDto,
): Promise<PullRequestCiDto | null> => {
  if (!electronAPI || !prOwnerRepo || !pr.headSha) return null;

  try {
    const [workflowResult, checksResult] = await Promise.all([
      electronAPI.githubGetWorkflowRuns({ owner: prOwnerRepo.owner, repo: prOwnerRepo.repo, headSha: pr.headSha, branch: pr.head, perPage: 10 }),
      electronAPI.githubGetStatusChecks({ owner: prOwnerRepo.owner, repo: prOwnerRepo.repo, ref: pr.headSha }),
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
  const conclusions = workflows.map(w => w.conclusion).filter(Boolean);
  const hasFailure = conclusions.some(c => c === 'failure' || c === 'cancelled' || c === 'timed_out' || c === 'action_required');
  const hasPendingWorkflow = workflows.some(w => w.status !== 'completed' || !w.conclusion);

  if (hasFailure) return 'failure';

  if (checks) {
    if (checks.state === 'failure' || checks.state === 'error') return 'failure';
    if (checks.state === 'pending') return 'pending';
  }

  if (hasPendingWorkflow) return 'pending';
  if (conclusions.some(c => c === 'success')) return 'success';
  if (checks?.state === 'success') return 'success';

  return workflows.length === 0 && !checks ? 'unknown' : 'neutral';
}

function buildCiSummary(
  badge: CiBadgeStateDto,
  workflows: GithubWorkflowRunDto[],
  checks: GithubStatusChecksDto | null,
): string {
  const checkCount = checks?.checkRuns.length || 0;
  const statusCount = checks?.statusContexts.length || 0;
  if (badge === 'success') return `CI passed (${workflows.length} workflows, ${checkCount + statusCount} checks)`;
  if (badge === 'failure') return `CI failed (${workflows.length} workflows, ${checkCount + statusCount} checks)`;
  if (badge === 'pending') return `CI pending (${workflows.length} workflows, ${checkCount + statusCount} checks)`;
  return `CI status (${workflows.length} workflows, ${checkCount + statusCount} checks)`;
}

export const submitPullRequest = async (
  electronAPI: ElectronAPI | undefined,
  prOwnerRepo: RepoOwnerRef | null,
  input: CreatePRInput,
  language: AppLanguage,
): Promise<{ success: true; number: number } | { success: false; error: string }> => {
  const tr = (deText: string, enText: string) => trByLanguage(language, deText, enText);

  if (!electronAPI || !prOwnerRepo || !input.title.trim()) {
    return { success: false, error: tr('Fehler beim Erstellen des PR.', 'Error creating PR.') };
  }

  try {
    const result = await electronAPI.githubCreatePR({
      owner: prOwnerRepo.owner,
      repo: prOwnerRepo.repo,
      title: input.title.trim(),
      body: input.body.trim(),
      head: input.head || input.currentBranch,
      base: input.base || 'main',
    });

    if (!result.success) {
      return { success: false, error: result.error || tr('Fehler beim Erstellen des PR.', 'Error creating PR.') };
    }

    return { success: true, number: result.data.number };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : tr('Fehler beim Erstellen des PR.', 'Error creating PR.'),
    };
  }
};
