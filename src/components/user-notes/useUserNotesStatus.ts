import { useEffect, useState } from 'react';
import { peekResource } from '@/data/clientCache';
import { appClient } from '@/services/appClient';
import type { UserNotesStatusDto } from '@/shared/userNotes';

export function useUserNotesStatus() {
  const [status, setStatus] = useState<UserNotesStatusDto | null>(() => peekResource<UserNotesStatusDto>('app', 'getUserNotesStatus') || null);
  useEffect(() => {
    if (!appClient.isAvailable()) return;
    let active = true;
    let receivedEvent = false;
    const unsubscribe = appClient.onUserNotesChanged((next) => {
      receivedEvent = true;
      if (active) setStatus(next);
    });
    void appClient
      .getUserNotesStatus()
      .then((next) => {
        if (active && !receivedEvent) setStatus(next);
      })
      .catch(() => {
        if (active && !receivedEvent) setStatus({ state: 'error', notes: [], lastCheckedAt: null, error: 'Could not load saved user notes.' });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return status;
}
