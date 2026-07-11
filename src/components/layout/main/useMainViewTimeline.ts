import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { FileTimelineCommitDto } from '@/types/gitDtos';
import type { CatalogTranslateFn } from '@/i18n';
import type { AppTabId } from '@/app/state/contracts';
import { gitClient } from '@/services/gitClient';

type UseMainViewTimelineParams = {
  activeRepo: string | null;
  setActiveTab: (tab: AppTabId) => void;
  onCloseReleaseCreator: () => void;
  t: CatalogTranslateFn;
};

export const useMainViewTimeline = ({ activeRepo, setActiveTab, onCloseReleaseCreator, t }: UseMainViewTimelineParams) => {
  const [showTimeline, setShowTimeline] = useState(false);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineCommits, setTimelineCommits] = useState<FileTimelineCommitDto[]>([]);

  // Bumped on repository change so a timeline load started in one repository
  // cannot open (or populate) after switching to another.
  const requestGenerationRef = useRef(0);
  const activeRepoRef = useRef(activeRepo);
  activeRepoRef.current = activeRepo;

  const openTimeline = useCallback(async () => {
    if (!activeRepo || !gitClient.isAvailable()) return;
    const repoAtStart = activeRepo;
    // Each invocation supersedes the previous one, even inside the same repo.
    const generation = ++requestGenerationRef.current;
    setIsTimelineLoading(true);
    try {
      const result = await gitClient.getFileTimelineData(1500, repoAtStart);
      if (requestGenerationRef.current !== generation || activeRepoRef.current !== repoAtStart) return;
      if (result.success) {
        setTimelineCommits([...result.data].reverse());
        onCloseReleaseCreator();
        setActiveTab('repo');
        setShowTimeline(true);
      } else {
        alert(result.error || t('timeline.errors.loadDataFailed'));
      }
    } catch (err: unknown) {
      if (requestGenerationRef.current !== generation || activeRepoRef.current !== repoAtStart) return;
      alert(err instanceof Error ? err.message : t('timeline.errors.loadFailed'));
    } finally {
      if (requestGenerationRef.current === generation && activeRepoRef.current === repoAtStart) setIsTimelineLoading(false);
    }
  }, [activeRepo, onCloseReleaseCreator, setActiveTab, t]);

  // Layout timing closes the render-to-effect window in which a stale promise
  // could otherwise navigate the newly selected repository.
  useLayoutEffect(() => {
    requestGenerationRef.current += 1;
    setShowTimeline(false);
    setIsTimelineLoading(false);
    setTimelineCommits([]);
  }, [activeRepo]);

  return {
    showTimeline,
    setShowTimeline,
    isTimelineLoading,
    timelineCommits,
    openTimeline,
  };
};
