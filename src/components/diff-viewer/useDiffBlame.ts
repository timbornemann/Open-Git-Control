import { useEffect, useMemo, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import type { GitFileBlameLineDto } from '@/types/git';
import { gitClient } from '@/services/gitClient';

type UseDiffBlameParams = {
  repoPath: string | null;
  request: DiffRequest;
};

export const useDiffBlame = ({ repoPath, request }: UseDiffBlameParams) => {
  const [showBlame, setShowBlame] = useState(false);
  const [blameData, setBlameData] = useState<GitFileBlameLineDto[]>([]);
  const [isBlameLoading, setIsBlameLoading] = useState(false);

  useEffect(() => {
    setShowBlame(false);
    setBlameData([]);
  }, [request]);

  useEffect(() => {
    const fetchBlame = async () => {
      if (!showBlame || !repoPath || !gitClient.isAvailable()) return;

      setIsBlameLoading(true);
      try {
        const commitHashForBlame = request.source !== 'staged' && request.source !== 'unstaged' ? request.commitHash : undefined;

        const result = await gitClient.getFileBlame(request.path, commitHashForBlame);
        if (result.success) {
          setBlameData(result.data);
        } else {
          console.error('Failed to fetch blame data:', result.error);
        }
      } catch (err) {
        console.error('Error fetching blame data:', err);
      } finally {
        setIsBlameLoading(false);
      }
    };

    void fetchBlame();
  }, [showBlame, repoPath, request]);

  const blameMap = useMemo(() => {
    const map = new Map<number, GitFileBlameLineDto>();
    for (const item of blameData) {
      map.set(item.lineNumber, item);
    }
    return map;
  }, [blameData]);

  return {
    showBlame,
    setShowBlame,
    blameMap,
    isBlameLoading,
  };
};
