import type { DemoRepository } from './demoRepository';
import { resolveDemoCommit } from './demoHistory';
import { unstageDemoFiles, refreshDemoFiles } from './demoFiles';
import { demoDirectorySet } from './demoDirectories';
import { recordDemoHead } from './demoReflog';
import { prepareDemoHardResetFiles } from './demoHardReset';
const fail = (error: string) => ({ success: false as const, error });
/** Reset modes change HEAD, index and working files independently, inside the simulation. */
export function demoReset(repo: DemoRepository, args: readonly string[]) {
  const separator = args.indexOf('--');
  if (separator >= 0) {
    if (args.slice(0, separator).some((arg) => arg !== 'HEAD')) return fail('Choose HEAD when unstaging practice paths.');
    return unstageDemoFiles(repo, args.slice(separator + 1));
  }
  if (repo.rebaseState) return fail('Finish or abort the pending practice rebase before resetting HEAD.');
  const flags = args.filter((arg) => arg.startsWith('-'));
  if (flags.length > 1 || flags.some((arg) => !['--hard', '--mixed', '--soft'].includes(arg))) return fail('Choose a supported practice reset mode.');
  const refs = args.filter((arg) => !arg.startsWith('-'));
  if (refs.length > 1) return fail('Choose one saved practice revision.');
  const target = resolveDemoCommit(repo, refs[0] || 'HEAD');
  if (!target?.files) return fail('Choose an existing saved practice commit.');
  const mode = flags[0] || '--mixed';
  if (mode === '--soft' && (repo.mergeState || repo.conflicted)) return fail('Finish or abort the pending practice merge before a soft reset.');
  const headFiles = structuredClone(target.files),
    index = mode === '--soft' ? structuredClone(repo.indexFiles) : structuredClone(target.files);
  const files = mode === '--hard' ? prepareDemoHardResetFiles(repo, target.files) : structuredClone(repo.files);
  if (repo.branch) repo.branchHeads.set(repo.branch, target.hash);
  repo.commits = [target, ...repo.commits.filter((commit) => commit.hash !== target.hash)];
  repo.headFiles = headFiles;
  repo.indexFiles = index;
  repo.files = files;
  repo.tracked = new Set(Object.keys(headFiles));
  if (mode !== '--soft') {
    repo.mergeState = null;
    repo.conflicted = false;
  }
  repo.directories = demoDirectorySet(Object.keys(files), [...repo.directories]);
  refreshDemoFiles(repo);
  recordDemoHead(repo, 'reset: moving to ' + (refs[0] || 'HEAD'));
  repo.mark('reset');
  repo.emitChannel('tree', repo.activeRepo);
  return { success: true as const, data: 'HEAD is now at ' + target.hash };
}
