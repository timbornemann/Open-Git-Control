import type { DemoCommit, DemoRepository } from './demoRepository';
import type { IpcResult } from '@/types/ipc';
import { demoCommitAuthor, demoCommitChanges, resolveDemoCommit, DEMO_EMPTY_TREE } from './demoHistory';
import { demoGitText, isDemoGitlink, type DemoBlob } from './demoBlob';
import { demoBranchDecorations, reachableDemoCommits } from './demoBranchRefs';
const blobContents = (blob?: DemoBlob) => (isDemoGitlink(blob) ? undefined : demoGitText(blob));

export function demoHistoryLog(repo: DemoRepository, commits: readonly DemoCommit[] = reachableDemoCommits(repo)): string {
  return commits
    .map((commit) => {
      const decorations = demoBranchDecorations(repo, commit.hash);
      return (
        [commit.hash, commit.hash.slice(0, 7), demoCommitAuthor(commit), commit.date, commit.subject, commit.parent, decorations.join('\x1d')].join('\x1f') +
        '\x00'
      );
    })
    .join('');
}
export function demoHistoryCommand(repo: DemoRepository, kind: 'show' | 'commitDetails', args: readonly string[]): IpcResult<string> {
  const separator = args.indexOf('--');
  const parameters = (separator < 0 ? args : args.slice(0, separator)).filter((value) => !value.startsWith('-'));
  const spec = parameters[0] || 'HEAD';
  if (spec.startsWith(':')) {
    const text = blobContents(repo.fileAt('staged', spec.slice(1)));
    return text === undefined ? { success: false, error: 'The indexed practice file does not exist.' } : { success: true, data: text };
  }
  const colon = spec.indexOf(':');
  const reference = colon < 0 ? spec : spec.slice(0, colon);
  const commit = resolveDemoCommit(repo, reference);
  if (!commit) return { success: false, error: 'The requested practice commit does not exist.' };
  if (kind === 'commitDetails')
    return {
      success: true,
      data: demoCommitChanges(repo, commit)
        .map((change) => (change.status === 'R' ? `R100\0${change.previousPath}\0${change.path}\0` : `${change.status}\0${change.path}\0`))
        .join(''),
    };
  if (colon >= 0) {
    const text = blobContents(repo.fileAt('commit', spec.slice(colon + 1), commit.hash));
    return text === undefined ? { success: false, error: 'The practice file is absent in this commit.' } : { success: true, data: text };
  }
  if (args.includes('--format=%P')) return { success: true, data: commit.parent };
  if (args.includes('--format=%B')) return { success: true, data: `${commit.subject}\n\n${commit.body || ''}\n` };
  if (args.includes('--format=%H')) return { success: true, data: commit.hash };
  return {
    success: true,
    data: repo.diffCommand([commit.parent.split(/\s+/)[0] || DEMO_EMPTY_TREE, commit.hash, ...(separator < 0 ? [] : ['--', ...args.slice(separator + 1)])]),
  };
}
