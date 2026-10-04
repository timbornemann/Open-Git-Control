import { useEffect } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { useHostingState } from './hostingState';

const attemptedRestorations = new Set<string>();
/** Validate saved credentials once per session; never infer authentication from a token file. */
export function useHostingConnections() {
  const revision = useHostingState((s) => s.revision);
  const setConnections = useHostingState((s) => s.setConnections);
  useEffect(() => {
    let active = true;
    void (async () => {
      const connections = await hostingClient.request('connections', undefined);
      if (!active) return;
      setConnections(connections);
      const restore = connections.filter((c) => c.hasCredentials && !c.authenticated && !attemptedRestorations.has(c.id));
      restore.forEach((c) => attemptedRestorations.add(c.id));
      if (!restore.length) return;
      await Promise.allSettled(restore.map((c) => hostingClient.request('capabilities', { connectionId: c.id })));
      const validated = await hostingClient.request('connections', undefined);
      if (active) setConnections(validated);
    })().catch(() => {
      /* Account-specific failures are displayed by the connection and catalog views. */
    });
    return () => {
      active = false;
    };
  }, [revision, setConnections]);
}
