import type { IpcResult } from '@/types/ipc';
import type { DemoRepository } from './demoRepository';
import { demoAncestors, resolveDemoCommit } from './demoHistory';
import { demoGitText, getDemoBlob } from './demoBlob';
import { demoLineEdits, demoTextLines } from './demoDiff';
import { validDemoTreePath } from './demoDirectories';
import { runDemoRegex } from './demoRegexWorker';

/** Git -G tests changed lines, including removed lines, rather than counts. */
export async function demoRegexHistory(repo: DemoRepository, args: readonly string[]): Promise<IpcResult<string>> {
  const [, path, pattern = ''] = args;
  const limit = args[5] === undefined ? 200 : Number(args[5]);
  if (!validDemoTreePath(path) || !pattern || pattern.includes('\0') || !Number.isFinite(limit) || limit < 1 || limit > 500)
    return { success: false, error: 'Bitte einen relativen Dateipfad und Suchausdruck wählen. / Choose a relative file path and search pattern.' };
  const history = repo.commits,
    head = history[0]?.hash,
    repository = repo.activeRepo;
  const commits = demoAncestors(repo),
    records: string[][] = [];
  let cells = 0,
    characters = 0;
  if (commits.length > 500)
    return { success: false, error: 'Dieser Beispielverlauf ist für die Übungssuche zu groß. / This sample history is too large for practice search.' };
  for (const commit of commits) {
    const parentHash = commit.parent.split(/\s+/)[0];
    const parent = parentHash ? resolveDemoCommit(repo, parentHash) : undefined;
    const beforeText = demoGitText(getDemoBlob(parent?.files || {}, path)),
      afterText = demoGitText(getDemoBlob(commit.files || {}, path));
    if (beforeText?.includes('\0') || afterText?.includes('\0'))
      return { success: false, error: 'Diese Übungssuche unterstützt Textdateien. / This practice search supports text files.' };
    if (beforeText === afterText) {
      records.push([]);
      continue;
    }
    characters += (beforeText?.length || 0) + (afterText?.length || 0);
    if (characters > 2_000_000) return { success: false, error: 'Dieser Beispielvergleich ist zu groß. / This sample comparison is too large.' };
    const before = demoTextLines(beforeText),
      after = demoTextLines(afterText);
    cells += (before.length + 1) * (after.length + 1);
    if ((before.length + 1) * (after.length + 1) > 1_000_000 || cells > 5_000_000)
      return { success: false, error: 'Dieser Beispielvergleich ist zu groß. / This sample comparison is too large.' };
    records.push(
      demoLineEdits(before, after)
        .filter((line) => line.kind !== ' ')
        .map((line) => line.text + (line.newline ? '\n' : '')),
    );
  }
  const result = await runDemoRegex(repo, { pattern, records, limit: Math.floor(limit) });
  if (repo.commits !== history || repo.commits[0]?.hash !== head || repo.activeRepo !== repository)
    return { success: false, error: 'Der Übungsstand hat sich geändert. Suche bitte erneut. / The practice state changed. Please search again.' };
  return result.success ? { success: true, data: repo.log(result.data.map((index) => commits[index])) } : result;
}
