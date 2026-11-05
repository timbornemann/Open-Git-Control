import type { DemoRepository } from './demoRepository';
import { demoBlobKey } from './demoBlob';

export const createDemoFileVersions = () => ({ clock: 0, entries: new Map<string, { content: string | undefined; revision: number }>() });
export function observeDemoFile(repo: DemoRepository, path: string) {
  for (const source of ['unstaged', 'staged'] as const) {
    const files = source === 'staged' ? repo.indexFiles : repo.files;
    const content = demoBlobKey(Object.prototype.hasOwnProperty.call(files, path) ? files[path] : undefined);
    const key = JSON.stringify([source, path]);
    const previous = repo.fileVersions.entries.get(key);
    if (!previous || previous.content !== content) repo.fileVersions.entries.set(key, { content, revision: ++repo.fileVersions.clock });
  }
}
export function demoFileVersion(repo: DemoRepository, source: 'staged' | 'unstaged', path: string) {
  return JSON.stringify([repo.activeRepo, path, source, demoFileRevision(repo, source, path)]);
}
export function demoFileRevision(repo: DemoRepository, source: 'staged' | 'unstaged', path: string) {
  observeDemoFile(repo, path);
  return repo.fileVersions.entries.get(JSON.stringify([source, path]))!.revision;
}
export function touchDemoWorkFile(repo: DemoRepository, path: string) {
  observeDemoFile(repo, path);
  const key = JSON.stringify(['unstaged', path]);
  repo.fileVersions.entries.set(key, { ...repo.fileVersions.entries.get(key)!, revision: ++repo.fileVersions.clock });
}
