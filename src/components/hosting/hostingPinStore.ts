import type { HostedRepository, HostingConnection } from '@/types/hostingDtos';
import { readGithubPinnedIds } from '@/components/github-workspace/githubPinStore';

const key = 'ogc.hostingPins.v1';
export const repositoryPinKey = (repo: HostedRepository) => `${repo.ref.connectionId}:${repo.ref.repositoryId}:${repo.ref.fullPath}`;
export function readHostingPins(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}
export function writeHostingPins(pins: string[]): void {
  localStorage.setItem(key, JSON.stringify([...new Set(pins)]));
}
/** Legacy identities are migrated only into a verified GitHub account on the same host. */
export function migrateHostingPins(connections: HostingConnection[], repositories: HostedRepository[]): string[] {
  const pins = readHostingPins();
  for (const connection of connections) {
    if (connection.provider !== 'github' || !connection.authenticated || !connection.username) continue;
    const host = new URL(connection.baseUrl).host;
    const legacy = readGithubPinnedIds(host, connection.username);
    for (const repo of repositories) {
      if (repo.ref.connectionId !== connection.id || !legacy.has(Number(repo.ref.repositoryId))) continue;
      const migratedKey = `${key}.migrated:${connection.id}:${repo.ref.repositoryId}`;
      if (localStorage.getItem(migratedKey)) continue;
      pins.push(repositoryPinKey(repo));
      writeHostingPins(pins);
      localStorage.setItem(migratedKey, '1');
    }
  }
  writeHostingPins(pins);
  return [...new Set(pins)];
}
