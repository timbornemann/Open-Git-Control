const prefix = 'ogc.githubPins.v1';
export const GITHUB_PINS_CHANGED_EVENT = 'ogc:github-pins-changed';

const storageKey = (host: string, username: string): string => `${prefix}:${host.toLowerCase()}:${username.toLowerCase()}`;

export function readGithubPinnedIds(host: string, username: string): Set<number> {
  if (!host || !username) return new Set();
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(host, username)) || '[]') as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : []);
  } catch {
    return new Set();
  }
}

export function writeGithubPinnedIds(host: string, username: string, ids: Set<number>): void {
  if (!host || !username) return;
  localStorage.setItem(storageKey(host, username), JSON.stringify([...ids]));
  window.dispatchEvent(new window.Event(GITHUB_PINS_CHANGED_EVENT));
}

export function setGithubRepoPinned(host: string, username: string, id: number, pinned: boolean): void {
  const ids = readGithubPinnedIds(host, username);
  if (pinned) ids.add(id);
  else ids.delete(id);
  writeGithubPinnedIds(host, username, ids);
}
