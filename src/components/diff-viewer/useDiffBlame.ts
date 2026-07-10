import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
      try {
        const commitHashForBlame = request.source !== 'staged' && request.source !== 'unstaged' ? request.commitHash : undefined;

        const result = await gitClient.getFileBlame(request.path, commitHashForBlame);
        if (!isCurrentRequest()) return;
        if (result.success) {
          setBlameData(result.data);
        } else {
          console.error('Failed to fetch blame data:', result.error);
        }
      } catch (err) {
        if (!isCurrentRequest()) return;
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
