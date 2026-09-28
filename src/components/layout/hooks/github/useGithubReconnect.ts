import { useCallback, useEffect, useState } from 'react';

export function useGithubReconnect(shouldRetry: boolean) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);
  useEffect(() => {
    if (!shouldRetry) return;
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    window.addEventListener('online', retryWhenVisible);
    document.addEventListener('visibilitychange', retryWhenVisible);
    return () => {
      window.removeEventListener('online', retryWhenVisible);
      document.removeEventListener('visibilitychange', retryWhenVisible);
    };
  }, [retry, shouldRetry]);
  return { attempt, retry };
}
