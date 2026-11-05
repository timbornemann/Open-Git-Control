import type { DemoRepository } from './demoRepository';
import { isDemoGitlink, type DemoFiles } from './demoBlob';
/** Match hard-reset path replacement without publishing intermediate state. */
export function prepareDemoHardResetFiles(repo: DemoRepository, target: DemoFiles) {
  const files = structuredClone(repo.files);
  for (const path of new Set([...Object.keys(repo.headFiles), ...Object.keys(repo.indexFiles), ...(repo.mergeState?.conflicts.keys() || [])]))
    delete files[path];
  for (const [name, blob] of Object.entries(target)) {
    const key = name.toLocaleLowerCase();
    for (const existing of Object.keys(files)) {
      const candidate = existing.toLocaleLowerCase();
      if (candidate === key || candidate.startsWith(key + '/') || key.startsWith(candidate + '/')) delete files[existing];
    }
    files[name] = structuredClone(isDemoGitlink(blob) && isDemoGitlink(repo.files[name]) ? repo.files[name] : blob);
  }
  return files;
}
