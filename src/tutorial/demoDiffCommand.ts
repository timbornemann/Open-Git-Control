import type { DemoRepository } from './demoRepository';
import { getDemoBlob } from './demoBlob';
import { demoTextDiff } from './demoDiff';
import { demoRevisionTree, demoTreeChanges, type DemoCommitChange } from './demoHistory';
import { quotePatchPath } from '@/shared/diff/selectedPatch';

export function demoDiffCommand(repo: DemoRepository, args: readonly string[]) {
  const separator = args.indexOf('--');
  const references = (separator < 0 ? args : args.slice(0, separator)).filter((argument) => demoRevisionTree(repo, argument) !== undefined);
  const snapshot = (ref: string) => demoRevisionTree(repo, ref) || {};
  const cached = args.includes('--cached') || args.includes('--staged');
  const before = references.length ? snapshot(references[0]) : cached ? repo.headFiles : repo.indexFiles;
  const after = references.length > 1 ? snapshot(references[1]) : cached ? repo.indexFiles : repo.files;
  const selected = separator < 0 ? [] : args.slice(separator + 1);
  const z = args.includes('-z'),
    end = z ? '\0' : '\n';
  const reportPath = (path: string) => (/[\\"\r\n\t]/.test(path) ? quotePatchPath(path) : path);
  const changes = demoTreeChanges(before, after)
    .flatMap((change): DemoCommitChange[] =>
      change.status === 'R' && !cached && references.length < 2
        ? [
            { path: change.previousPath!, status: 'D' },
            { path: change.path, status: 'A' },
          ]
        : [change],
    )
    .filter((change) => !selected.length || selected.includes(change.path) || (change.previousPath && selected.includes(change.previousPath)));
  const patchFor = (change: DemoCommitChange) =>
    change.status === 'R'
      ? `diff --git ${quotePatchPath('a/' + change.previousPath)} ${quotePatchPath('b/' + change.path)}\nsimilarity index 100%\nrename from ${quotePatchPath(change.previousPath!)}\nrename to ${quotePatchPath(change.path)}\n`
      : demoTextDiff(change.path, getDemoBlob(before, change.path), getDemoBlob(after, change.path));
  if (args.includes('--name-status'))
    return changes
      .map((change) =>
        change.status === 'R'
          ? `R100${z ? '\0' : '\t'}${z ? change.previousPath : reportPath(change.previousPath!)}${z ? '\0' : '\t'}${z ? change.path : reportPath(change.path)}${end}`
          : `${change.status}${z ? '\0' : '\t'}${z ? change.path : reportPath(change.path)}${end}`,
      )
      .join('');
  if (args.includes('--numstat'))
    return changes
      .map((change) => {
        if (change.status === 'R') return z ? `0\t0\t\0${change.previousPath}\0${change.path}\0` : `0\t0\t${change.previousPath} => ${change.path}\n`;
        const patch = patchFor(change).split('\n');
        if (patch.some((line) => line.startsWith('Binary files '))) return `-\t-\t${z ? change.path : reportPath(change.path)}${end}`;
        return `${patch.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length}\t${patch.filter((line) => line.startsWith('-') && !line.startsWith('---')).length}\t${z ? change.path : reportPath(change.path)}${end}`;
      })
      .join('');
  return changes.map(patchFor).join('');
}
