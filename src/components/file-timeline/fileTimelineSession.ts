import type { FileTimelineViewport } from './types';

type Session = { selectedHash?: string; camera?: FileTimelineViewport; collapsedPaths?: Set<string> };
const sessions = new Map<string, Session>();
export function readTimelineSession(key: string): Session | undefined {
  return sessions.get(key);
}
export function rememberTimelineSession(key: string, update: Session) {
  if (!key) return;
  const saved = { ...sessions.get(key), ...update };
  sessions.delete(key);
  sessions.set(key, saved);
  while (sessions.size > 8) sessions.delete(sessions.keys().next().value!);
}
export const clearTimelineSessions = () => sessions.clear();
