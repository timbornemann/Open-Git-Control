import type { IpcResult } from '@/types/ipc';
import type { DemoRepository } from './demoRepository';
import { demoAncestors, resolveDemoCommit } from './demoHistory';
import { demoGitText, getDemoBlob } from './demoBlob';
import { validDemoTreePath } from './demoDirectories';
import { demoLineHistory } from './demoLineHistory';

const occurrences = (text: string, term: string) => {
  let count = 0,
    from = 0;
  while ((from = text.indexOf(term, from)) !== -1) {
    count++;
    from += term.length;
  }
  return count;
};
/** Git -S selects changes in the number of literal occurrences, including removal. */
export function demoForensicHistory(repo: DemoRepository, args: readonly string[]): IpcResult<string> {
  const [mode, path, term = ''] = args;
  if (mode !== 'string' && mode !== 'line')
    return { success: false, error: 'Diese Suchvariante ist in dieser Übung nicht verfügbar. / This search variant is not available in this exercise.' };
  const limit = args[5] === undefined ? 200 : Number(args[5]);
  if (!validDemoTreePath(path) || (mode === 'string' && (!term || term.includes('\0'))) || !Number.isFinite(limit) || limit < 1 || limit > 500)
    return { success: false, error: 'Bitte einen relativen Dateipfad und Suchtext wählen. / Choose a relative file path and search text.' };
  if (mode === 'line') {
    try {
      return { success: true, data: repo.log(demoLineHistory(repo, path, Number(args[3]), Number(args[4]), Math.floor(limit))) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  const matches = [];
  for (const commit of demoAncestors(repo)) {
    const parentHash = commit.parent.split(/\s+/)[0];
    const parent = parentHash ? resolveDemoCommit(repo, parentHash) : undefined;
    const before = demoGitText(getDemoBlob(parent?.files || {}, path)) || '';
    const after = demoGitText(getDemoBlob(commit.files || {}, path)) || '';
    if (before.includes('\0') || after.includes('\0'))
      return { success: false, error: 'Diese Übungssuche unterstützt Textdateien. / This practice search supports text files.' };
    if (occurrences(before, term) !== occurrences(after, term)) matches.push(commit);
    if (matches.length >= Math.floor(limit)) break;
  }
  return { success: true, data: repo.log(matches) };
}
