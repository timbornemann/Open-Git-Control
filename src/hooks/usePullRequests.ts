import { useCallback, useEffect, useState } from 'react';
import { ElectronAPI, PullRequestDto } from '../global';
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
  onCreated?: (number: number) => void;
  onError?: (message: string) => void;
};

export const usePullRequests = ({ activeRepo, isAuthenticated, refreshTrigger, onCreated, onError }: Params) => {
  const [pullRequests, setPullRequests] = useState<PullRequestDto[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [prOwnerRepo, setPrOwnerRepo] = useState<RepoOwnerRef | null>(null);
  const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('open');

  useEffect(() => {
    const parseOwnerRepo = async () => {
      const ownerRepo = await resolvePrOwnerRepo(window.electronAPI, activeRepo, isAuthenticated);
      setPrOwnerRepo(ownerRepo);
      if (!ownerRepo) setPullRequests([]);
    };
    parseOwnerRepo();
  }, [activeRepo, isAuthenticated, refreshTrigger]);

  useEffect(() => {
    const fetchPRs = async () => {
      setPrLoading(true);
      const data = await loadPullRequests(window.electronAPI, prOwnerRepo, isAuthenticated, prFilter);
      setPullRequests(data);
      setPrLoading(false);
    };
    fetchPRs();
  }, [prOwnerRepo, isAuthenticated, prFilter, refreshTrigger]);

  const createPR = useCallback(async ({ title, body, head, base, currentBranch }: CreatePRInput) => {
    if (!title.trim()) return false;

    const result = await submitPullRequest(window.electronAPI, prOwnerRepo, {
      title,
      body,
      head,
      base,
      currentBranch,
    });

    if (result.success) {
      onCreated?.(result.number);
      return true;
    }

    onError?.(result.error);
    return false;
  }, [onCreated, onError, prOwnerRepo]);

  return {
    pullRequests,
    prLoading,
    prOwnerRepo,
    prFilter,
    setPrFilter,
    createPR,
  };
};

export const parsePrOwnerRepoFromRemote = (remoteUrl: string): RepoOwnerRef | null => {
  const trimmedRemote = remoteUrl.trim();
  const httpsMatch = trimmedRemote.match(/github\.com\/([^/]+)\/([^/.]+)/);
  const sshMatch = trimmedRemote.match(/github\.com:([^/]+)\/([^/.]+)/);
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
): Promise<RepoOwnerRef | null> => {
  if (!activeRepo || !electronAPI || !isAuthenticated) return null;

  try {
    const response = await electronAPI.runGitCommand('remote', 'get-url', 'origin');
    if (!response.success || !response.data) return null;
    return parsePrOwnerRepoFromRemote(String(response.data));
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

export const submitPullRequest = async (
  electronAPI: ElectronAPI | undefined,
  prOwnerRepo: RepoOwnerRef | null,
  input: CreatePRInput,
): Promise<{ success: true; number: number } | { success: false; error: string }> => {
  if (!electronAPI || !prOwnerRepo || !input.title.trim()) {
    return { success: false, error: 'Fehler beim Erstellen des PR.' };
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
      return { success: false, error: result.error || 'Fehler beim Erstellen des PR.' };
    }

    return { success: true, number: result.data.number };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Fehler beim Erstellen des PR.',
    };
  }
};
