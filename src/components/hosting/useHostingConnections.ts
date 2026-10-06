import { useEffect, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { useHostingState } from './hostingState';

const attemptedRestorations = new Set<string>();
const pendingRestorations = new Map<string, Promise<unknown>>();
/** Validate saved credentials once per session; never infer authentication from a token file. */
export function useHostingConnections() {
  const revision = useHostingState((s) => s.revision);
  const setConnections = useHostingState((s) => s.setConnections);
  const [completed, setCompleted] = useState<{ revision: number; error: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const connections = await hostingClient.request('connections', undefined);
      if (!active) return;
      setConnections(connections);
      const restore = connections
        .filter((c) => c.hasCredentials && !c.authenticated)
        .map((c) => {
          const pending = pendingRestorations.get(c.id);
          if (pending) return pending;
          if (attemptedRestorations.has(c.id)) return null;
          attemptedRestorations.add(c.id);
          const restoration = hostingClient.request('capabilities', { connectionId: c.id }).finally(() => pendingRestorations.delete(c.id));
          pendingRestorations.set(c.id, restoration);
          return restoration;
        })
        .filter((pending): pending is Promise<unknown> => pending !== null);
      if (restore.length) {
        // Other consumers must also wait for an account's in-flight restoration.
        await Promise.allSettled(restore);
        if (!active) return;
        const validated = await hostingClient.request('connections', undefined);
        if (active) setConnections(validated);
      }
      if (active) setCompleted({ revision, error: null });
    })().catch((reason) => {
      if (active) setCompleted({ revision, error: reason instanceof Error ? reason.message : String(reason) });
    });
    return () => {
      active = false;
    };
  }, [revision, setConnections]);
  return { loading: completed?.revision !== revision, error: completed?.revision === revision ? completed.error : null };
}
