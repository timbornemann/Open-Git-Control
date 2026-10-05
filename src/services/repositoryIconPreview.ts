import { repositoryIconsClient } from './repositoryIconsClient';
import { createRepositoryIconThumbnail } from '@/utils/repositoryIconImage';
import { normalizeRepoPathKey } from '@/utils/repoPath';
const pending = new Map<string, Promise<{ dataUrl: string; version: string }>>();
const queue: Array<() => void> = [];
let running = 0;
function release() {
  running--;
  queue.shift()?.();
}
export function loadRepositoryIconPreview(repo: string, path: string) {
  const key = JSON.stringify([normalizeRepoPathKey(repo), path]);
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = (async () => {
    await new Promise<void>((resolve) => {
      const start = () => {
        running++;
        resolve();
      };
      if (running < 2) start();
      else queue.push(start);
    });
    try {
      const source = await repositoryIconsClient.readSource(repo, path);
      if (!source.success) throw new Error(source.error || 'Repository image could not be read.');
      return { dataUrl: await createRepositoryIconThumbnail(source.data.dataUrl), version: source.data.version };
    } finally {
      release();
    }
  })().finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
