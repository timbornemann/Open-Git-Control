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
  await run(['init']);
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
  return { repoPath, git, run, write, service, execute, provider };
}

export function cleanRepositories(): void {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
