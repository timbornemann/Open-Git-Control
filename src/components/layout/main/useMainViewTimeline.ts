import { useCallback, useEffect, useState } from 'react';
import type { FileTimelineCommitDto } from '@/global';
import type { CatalogTranslateFn } from '@/i18n';
import type { AppTabId } from '@/components/layout/sidebar/AppSidebar.types';
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

  const openTimeline = useCallback(async () => {
    if (!activeRepo || !gitClient.isAvailable()) return;
    setIsTimelineLoading(true);
    try {
      const result = await gitClient.getFileTimelineData(1500);
      if (result.success) {
        setTimelineCommits([...result.data].reverse());
        onCloseReleaseCreator();
        setActiveTab('repo');
        setShowTimeline(true);
      } else {
        alert(result.error || t('timeline.errors.loadDataFailed'));
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('timeline.errors.loadFailed'));
    } finally {
      setIsTimelineLoading(false);
    }
  }, [activeRepo, onCloseReleaseCreator, setActiveTab, t]);

  useEffect(() => {
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
