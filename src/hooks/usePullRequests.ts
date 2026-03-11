import { useCallback, useEffect, useState } from 'react';
import { ElectronAPI, PullRequestDto } from '../global';
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
  onCreated?: (number: number) => void;
  onError?: (message: string) => void;
};

export const usePullRequests = ({ activeRepo, isAuthenticated, refreshTrigger, language, onCreated, onError }: Params) => {
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
