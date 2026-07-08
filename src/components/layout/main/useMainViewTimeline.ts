import { useCallback, useEffect, useState } from 'react';
import type { FileTimelineCommitDto } from '../../../global';
import type { AppTabId } from '../sidebar/AppSidebar.types';
import { gitClient } from '../../../services/gitClient';

type UseMainViewTimelineParams = {
  activeRepo: string | null;
  setActiveTab: (tab: AppTabId) => void;
  onCloseReleaseCreator: () => void;
  tr: (de: string, en: string) => string;
};

export const useMainViewTimeline = ({
  activeRepo,
  setActiveTab,
  onCloseReleaseCreator,
  tr,
}: UseMainViewTimelineParams) => {
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
        alert(result.error || tr('Timeline-Daten konnten nicht geladen werden.', 'Could not load timeline data.'));
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tr('Fehler beim Laden der Zeitleiste.', 'Error loading timeline.'));
    } finally {
      setIsTimelineLoading(false);
    }
  }, [activeRepo, onCloseReleaseCreator, setActiveTab, tr]);

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
