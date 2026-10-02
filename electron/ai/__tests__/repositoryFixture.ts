import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GitService } from '../../GitService';
import type { AiProviderClient, AiTextRequest } from '../AiProviderClient';
import { AiService } from '../../AiService';
import { policy } from './autoCommitFixtures';

export const roots: string[] = [];
export async function repository(initial = true) {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-ai-global-'));
  roots.push(repoPath);
  const git = new GitService();
  const run = (args: string[]) => git.runCommandAtPath(repoPath, args);
  const write = (file: string, content: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(repoPath, file)), { recursive: true });
    fs.writeFileSync(path.join(repoPath, file), content);
  };
  const writeHook = (name: string, script: string) => {
    const file = path.join('.git', 'hooks', name);
    write(file, `#!/bin/sh\n${script.trim().replace(/\r\n/g, '\n')}\n`);
    // Git ignores non-executable hooks on Linux and macOS. chmod also handles
    // an existing hook, for which writeFile's creation mode would be ignored.
    fs.chmodSync(path.join(repoPath, file), 0o755);
  };
  await run(['init']);
  // Detached auto-maintenance can outlive a commit and recreate files in .git
  // while afterEach removes this disposable repository.
  await run(['config', 'maintenance.auto', 'false']);
  await run(['config', 'gc.auto', '0']);
  await run(['config', 'user.name', 'Autocommit Test']);
  await run(['config', 'user.email', 'autocommit@example.test']);
  await run(['config', 'commit.gpgSign', 'false']);
  if (initial) {
    write('base.txt', 'base\n');
    await run(['add', '.']);
    await run(['commit', '-m', 'initial']);
  }
  const provider = async (request: AiTextRequest) => {
    const input = JSON.parse(request.userPrompt);
    if (request.systemPrompt.startsWith('Summarize'))
      return JSON.stringify({ summaries: input.map((item: { id: string }) => ({ id: item.id, summary: 'Updates captured behavior' })) });
    const changes = input.changes as Array<{ id: string; source: string }>;
    return JSON.stringify({
      groups: ['staged', 'worktree'].flatMap((source) => {
        const ids = changes.filter((change) => change.source === source).map((change) => change.id);
        return ids.length ? [{ changeIds: ids, title: `fix: update ${source} behavior`, description: '', rationale: 'One complete captured change' }] : [];
      }),
    });
  };
  const service = (generateText = provider) => new AiService(git, { generateText } as AiProviderClient);
  const execute = () => service().runAutoCommit(repoPath, policy, () => 'test-key');
  return { repoPath, git, run, write, writeHook, service, execute, provider };
}

export async function cleanRepositories(): Promise<void> {
  for (const root of [...roots]) {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-ai-global-')) {
      throw new Error(`Refusing to remove a path outside the auto-commit test fixtures: ${resolved}`);
    }
    await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    roots.splice(roots.indexOf(root), 1);
  }
}
