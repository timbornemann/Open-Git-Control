import { useCallback, useEffect, useState } from 'react';
import { RepoOwnerRef } from '../types/git';

type PullRequest = {
  number: number;
  title: string;
  state: string;
  user: string;
  createdAt: string;
  updatedAt: string;
  head: string;
  base: string;
  merged: boolean;
  htmlUrl: string;
  draft: boolean;
};

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
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [prOwnerRepo, setPrOwnerRepo] = useState<RepoOwnerRef | null>(null);
  const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('open');

  useEffect(() => {
    const parseOwnerRepo = async () => {
      if (!activeRepo || !window.electronAPI || !isAuthenticated) {
        setPrOwnerRepo(null);
        setPullRequests([]);
        return;
      }
      try {
        const r = await window.electronAPI.runGitCommand('remote', 'get-url', 'origin');
        if (r.success && r.data) {
          const url = String(r.data).trim();
          const https = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
          const ssh = url.match(/github\.com:([^/]+)\/([^/.]+)/);
          const m = https || ssh;
          if (m) {
            setPrOwnerRepo({ owner: m[1], repo: m[2] });
            return;
          }
        }
      } catch {
        // ignore
      }
      setPrOwnerRepo(null);
      setPullRequests([]);
    };
    parseOwnerRepo();
  }, [activeRepo, isAuthenticated, refreshTrigger]);

  useEffect(() => {
    const fetchPRs = async () => {
      if (!prOwnerRepo || !window.electronAPI || !isAuthenticated) {
        setPullRequests([]);
        return;
      }
      setPrLoading(true);
      try {
        const result = await window.electronAPI.githubGetPRs(prOwnerRepo.owner, prOwnerRepo.repo, prFilter);
        if (result.success) {
          setPullRequests(result.data || []);
        }
      } catch {
        // ignore
      }
      setPrLoading(false);
    };
    fetchPRs();
  }, [prOwnerRepo, isAuthenticated, prFilter, refreshTrigger]);

  const createPR = useCallback(async ({ title, body, head, base, currentBranch }: CreatePRInput) => {
    if (!window.electronAPI || !prOwnerRepo || !title.trim()) return false;

    try {
      const result = await window.electronAPI.githubCreatePR({
        owner: prOwnerRepo.owner,
        repo: prOwnerRepo.repo,
        title: title.trim(),
        body: body.trim(),
        head: head || currentBranch,
        base: base || 'main',
      });

      if (result.success) {
        onCreated?.(result.data.number);
        return true;
      }

      onError?.(result.error || 'Fehler beim Erstellen des PR.');
      return false;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Fehler beim Erstellen des PR.';
      onError?.(message);
      return false;
    }
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
