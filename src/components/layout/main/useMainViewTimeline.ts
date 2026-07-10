import { useCallback, useEffect, useRef, useState } from 'react';
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

  const openTimeline = useCallback(async () => {
    if (!activeRepo || !gitClient.isAvailable()) return;
    const generation = requestGenerationRef.current;
    setIsTimelineLoading(true);
    try {
      const result = await gitClient.getFileTimelineData(1500);
      if (requestGenerationRef.current !== generation) return;
      if (result.success) {
        setTimelineCommits([...result.data].reverse());
        onCloseReleaseCreator();
        setActiveTab('repo');
        setShowTimeline(true);
      } else {
        alert(result.error || t('timeline.errors.loadDataFailed'));
      }
    } catch (err: unknown) {
      if (requestGenerationRef.current !== generation) return;
      alert(err instanceof Error ? err.message : t('timeline.errors.loadFailed'));
    } finally {
      if (requestGenerationRef.current === generation) setIsTimelineLoading(false);
    }
  }, [activeRepo, onCloseReleaseCreator, setActiveTab, t]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setShowTimeline(false);
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
