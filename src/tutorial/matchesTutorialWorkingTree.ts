import type { TutorialCompletion } from '@/shared/tutorial/types';
import type { DemoRepository } from './demoRepository';
import { demoBlobText } from './demoBlob';
import { resolveTutorialFileContent } from './demoContent';
const equal = (actual: Set<string>, expected?: readonly string[]) =>
  !expected || (actual.size === expected.length && expected.every((path) => actual.has(path)));
export function matchesTutorialWorkingTree(
  repo: DemoRepository | undefined,
  condition: Extract<TutorialCompletion, { kind: 'working-tree' }>,
  language: 'de' | 'en',
) {
  if (!repo) return false;
  return (
    (!condition.repoPath || condition.repoPath === repo.activeRepo) &&
    equal(repo.staged, condition.staged) &&
    equal(repo.modified, condition.unstaged) &&
    equal(repo.untracked, condition.untracked) &&
    (condition.absent || []).every((path) => !Object.prototype.hasOwnProperty.call(repo.files, path)) &&
    (condition.content || []).every(
      (file) =>
        demoBlobText((file.source === 'index' ? repo.indexFiles : file.source === 'head' ? repo.headFiles : repo.files)[file.path]) ===
        resolveTutorialFileContent(file.value, language),
    )
  );
}
