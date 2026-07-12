import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import type { GitFileBlameLineDto } from '@/types/git';
import { gitClient } from '@/services/gitClient';

type UseDiffBlameParams = {
  repoPath: string | null;
  request: DiffRequest;
  refreshTrigger?: number;
};

export const useDiffBlame = ({ repoPath, request, refreshTrigger }: UseDiffBlameParams) => {
  const [showBlame, setShowBlame] = useState(false);
  const [blameData, setBlameData] = useState<GitFileBlameLineDto[]>([]);
  const [isBlameLoading, setIsBlameLoading] = useState(false);
  const requestGenerationRef = useRef(0);

  useLayoutEffect(() => {
    setShowBlame(false);
    setBlameData([]);
    setIsBlameLoading(false);
  }, [repoPath, request]);

  useEffect(() => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const isCurrentRequest = () => requestGenerationRef.current === requestGeneration;

    if (!showBlame || !repoPath || !gitClient.isAvailable()) {
      setIsBlameLoading(false);
      return;
    }

    const fetchBlame = async () => {
      setIsBlameLoading(true);
      setBlameData([]);
      try {
        const commitHashForBlame = request.source !== 'staged' && request.source !== 'unstaged' ? request.commitHash : undefined;

        const workingTreeSource = request.source === 'staged' || request.source === 'unstaged' ? request.source : undefined;
        const result = await gitClient.getFileBlame(request.path, commitHashForBlame, repoPath, workingTreeSource);
        if (!isCurrentRequest()) return;
        if (result.success) {
          setBlameData(result.data);
        } else {
          setBlameData([]);
          console.error('Failed to fetch blame data:', result.error);
        }
      } catch (err) {
        if (!isCurrentRequest()) return;
        setBlameData([]);
        console.error('Error fetching blame data:', err);
      } finally {
        if (isCurrentRequest()) {
          setIsBlameLoading(false);
        }
      }
    };

    void fetchBlame();
    return () => {
      if (requestGenerationRef.current === requestGeneration) {
        requestGenerationRef.current += 1;
      }
    };
  }, [showBlame, repoPath, request, refreshTrigger]);

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
