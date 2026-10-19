import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import { GitLfsInventory } from '../GitLfsInventory';
import { GitLfsInventoryStore } from '../GitLfsInventoryStore';
import type { GitRunner } from '../GitRunner';
import type { GitLfsPointer } from '../../../src/shared/ipc/gitLfs';

const fixtures: { root: string; lifecycle: GitIntegrationLifecycle }[] = [];
afterEach(async () => {
  for (const { root, lifecycle } of fixtures.splice(0)) {
    await lifecycle.close();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-lfs-inventory-'))
      throw new Error('Unsafe LFS fixture cleanup');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  vi.restoreAllMocks();
});
export const inventoryTest = (name: string, work: (fixture: Awaited<ReturnType<typeof lfsInventoryFixture>>) => Promise<void>) =>
  it(
    name,
    async () => {
      const lifecycle = new GitIntegrationLifecycle();
      await lifecycle.track(
        (async () => {
          await work(await lfsInventoryFixture(lifecycle));
        })(),
      );
    },
    60_000,
  );

export const lfsPointer = (content: string): GitLfsPointer => ({ oid: createHash('sha256').update(content).digest('hex'), size: Buffer.byteLength(content) });
export const pointerText = (pointer: GitLfsPointer) => `version https://git-lfs.github.com/spec/v1\noid sha256:${pointer.oid}\nsize ${pointer.size}\n`;
export const pointers = (...values: GitLfsPointer[]) => values.sort((a, b) => a.oid.localeCompare(b.oid));

async function lfsInventoryFixture(lifecycle: GitIntegrationLifecycle) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-lfs-inventory-'));
  fixtures.push({ root, lifecycle });
  const repo = path.join(root, 'repo');
  const profile = path.join(root, 'profile');
  fs.mkdirSync(repo);
  const git = (...args: string[]) => lifecycle.git(repo, ...args);
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'LFS Inventory');
  await git('config', 'user.email', 'lfs-inventory@example.test');
  await git('config', 'commit.gpgsign', 'false');
  await git('config', 'core.autocrlf', 'false');
  await git('config', 'gc.auto', '0');
  const commit = async (changes: Record<string, string | null>, message = 'Change') => {
    for (const [name, value] of Object.entries(changes)) {
      const file = path.join(repo, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (value === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, value);
    }
    await git('add', '-A');
    await git('commit', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const base = await commit({ 'README.md': 'Initial\n' }, 'Initial');
  const runner: GitRunner = lifecycle.runner;
  const runBuffer = runner.runBuffer.bind(runner);
  const inspect = vi.spyOn(runner, 'runBuffer');
  const newInventory = (disk = false) => new GitLfsInventory(disk ? (namespace) => new GitLfsInventoryStore(() => profile, namespace) : undefined);
  const inventory = newInventory();
  // Exercise the bounded facade fallback as well as the native persistent reader
  // covered by GitObjectBatch.test.ts. These spies inspect individual batches.
  const read = (refs: string[], cache = inventory, cwd = repo, signal = lifecycle.signal) =>
    cache.read(cwd, refs, { runBuffer: (...args) => runner.runBuffer(...args) }, { signal });
  const objectWalks = () => inspect.mock.calls.filter(([, args]) => args[0] === 'rev-list' && args.includes('--objects'));
  const blobReads = () =>
    inspect.mock.calls
      .filter(([, args]) => args[0] === 'cat-file' && args[1] === '--batch')
      .flatMap(([, , options]) =>
        String(options?.input || '')
          .trim()
          .split('\n')
          .filter((value) => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)),
      );
  return { root, repo, profile, base, lifecycle, git, commit, runner, runBuffer, inspect, inventory, newInventory, read, objectWalks, blobReads };
}
