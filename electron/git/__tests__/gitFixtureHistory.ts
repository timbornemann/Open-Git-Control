import * as fs from 'node:fs';
import * as path from 'node:path';

/** Configure only this disposable repository, without starting Git for each key. */
export function configureFixtureRepository(repo: string, name: string, email: string) {
  fs.appendFileSync(
    path.join(repo, '.git', 'config'),
    `\n[user]\n\tname = ${JSON.stringify(name)}\n\temail = ${JSON.stringify(email)}\n` +
      `[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n\thooksPath = ${JSON.stringify(path.join(repo, '.git', 'hooks'))}\n` +
      '[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n',
  );
}

type FixtureCommit = { message: string; files?: Record<string, string> };

/** Real Git objects in one pack, without hundreds of worktree files/processes. */
export function fastImportHistory(commits: FixtureCommit[], identity: string, initialParent?: string): string {
  const timestamp = `${Math.floor(Date.now() / 1000)} +0000`;
  const data = (value: string) => `data ${Buffer.byteLength(value)}\n${value}\n`;
  let input = '';
  for (const [index, commit] of commits.entries()) {
    input += `commit refs/heads/main\nmark :${index + 1}\nauthor ${identity} ${timestamp}\ncommitter ${identity} ${timestamp}\n${data(commit.message + '\n')}`;
    const parent = index ? `:${index}` : initialParent;
    if (parent) input += `from ${parent}\n`;
    for (const [name, contents] of Object.entries(commit.files ?? {})) input += `M 100644 inline ${JSON.stringify(name)}\n${data(contents)}`;
    input += '\n';
  }
  return input + 'done\n';
}
