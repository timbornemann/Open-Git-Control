import { useEffect, useRef, type RefObject } from 'react';

const AUTO_LOAD_TRIGGER_PX = 220;
const AUTO_LOAD_RESET_PX = 420;

type UseCommitGraphAutoLoadParams = {
  logContainerRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  loadingMore: boolean;
  hasMoreCommits: boolean;
  loadMoreCommits: () => Promise<void>;
};

export const useCommitGraphAutoLoad = ({ logContainerRef, loading, loadingMore, hasMoreCommits, loadMoreCommits }: UseCommitGraphAutoLoadParams) => {
  const autoLoadArmedRef = useRef(true);

  useEffect(() => {
    autoLoadArmedRef.current = true;
  }, [logContainerRef]);

  useEffect(() => {
    const scrollContainer = logContainerRef.current?.parentElement;
    if (!scrollContainer) return;

    const onScroll = () => {
      const distanceToBottom = scrollContainer.scrollHeight - (scrollContainer.scrollTop + scrollContainer.clientHeight);
      if (distanceToBottom > AUTO_LOAD_RESET_PX) {
        autoLoadArmedRef.current = true;
      }

      if (loading || loadingMore || !hasMoreCommits) return;
      if (!autoLoadArmedRef.current) return;
      if (distanceToBottom <= AUTO_LOAD_TRIGGER_PX) {
        autoLoadArmedRef.current = false;
        void loadMoreCommits();
      }
    };

    scrollContainer.addEventListener('scroll', onScroll);
    return () => scrollContainer.removeEventListener('scroll', onScroll);
  }, [hasMoreCommits, loadMoreCommits, loading, loadingMore, logContainerRef]);

  return autoLoadArmedRef;
};
