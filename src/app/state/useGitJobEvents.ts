import { useEffect, useState } from 'react';
import type { GitJobEventDto } from '@/global';
import { aiClient } from '@/services/aiClient';
import { compactTransferProgressJobs } from './jobEvents';

export const useGitJobEvents = () => {
  const [jobs, setJobs] = useState<GitJobEventDto[]>([]);

  useEffect(() => {
    if (!aiClient.isAvailable()) return;

    const unsubscribe = aiClient.onJobEvent((event) => {
      setJobs((prev) => compactTransferProgressJobs(prev, event));
    });

    return unsubscribe;
  }, []);

  const clearJobs = () => setJobs([]);

  return {
    jobs,
    clearJobs,
  };
};
