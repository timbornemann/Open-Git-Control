import type { DemoRepository } from './demoRepository';

export const demoParent = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
export const demoDescendant = (path: string, parent: string) => path === parent || path.startsWith(parent + '/');
export function rememberDemoParents(repo: DemoRepository, path: string) {
  for (let parent = demoParent(path); parent; parent = demoParent(parent)) repo.directories.add(parent);
}
export function demoDirectorySet(paths: Iterable<string>, extra: readonly string[] = []): Set<string> {
  const directories = new Set(extra);
  for (const path of [...paths, ...extra]) for (let parent = demoParent(path); parent; parent = demoParent(parent)) directories.add(parent);
  return directories;
}
/** Portable practice names; no native path resolution or filesystem access. */
export function validDemoTreePath(path: string, root = false): boolean {
  if (typeof path !== 'string') return false;
  if (path === '') return root;
  return path
    .split('/')
    .every(
      (part) =>
        Boolean(part) &&
        !['.', '..', '.git'].includes(part.toLowerCase()) &&
        ![...part].some((character) => character.charCodeAt(0) < 32) &&
        !/[\\:*?"<>|]/.test(part) &&
        !/[. ]$/.test(part) &&
        !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    );
}
