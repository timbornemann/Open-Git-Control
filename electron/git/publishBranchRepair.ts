import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertManagedPathAsync } from '../main-process/storageSafety';
import { emptyGitConfig, isolatedGitEnvironment } from './branchBundles';
import { branchRecoveryEnvironment, type BranchRepository } from './branchRecoveryRepository';
import { readRepairBasis, type RepairBasis } from './branchRepairBasis';
import { runCommitEditProcess } from './CommitEditProcess';
import type { GitRunner } from './GitRunner';
import type { BranchHeadProblem } from '../../src/shared/ipc/branchRecovery';

type Publication = {
  repo: BranchRepository;
  ref: string;
  reason: BranchHeadProblem['reason'];
  oid: string;
  basis: RepairBasis;
  directory: string;
  bundleFile?: string;
  signal?: AbortSignal;
  ensureActive: () => void;
};

export async function preflightBranchRepair(publication: Publication, commonDir: string) {
  const { repo, ref, oid, directory, bundleFile, signal } = publication;
  const gitDir = path.join(commonDir, path.relative(repo.commonDir, repo.gitDir));
  if (gitDir !== commonDir) await fs.writeFile(path.join(gitDir, 'commondir'), `${path.relative(gitDir, commonDir).replace(/\\/g, '/')}\n`);
  const hooks = path.join(directory, 'empty-hooks');
  await fs.mkdir(hooks);
  await fs.writeFile(emptyGitConfig(directory), '', { flag: 'wx', mode: 0o600 });
  const options = [
    `--git-dir=${gitDir}`,
    ...(repo.bare ? [] : [`--work-tree=${repo.repoPath}`]),
    '-c',
    `core.hooksPath=${hooks}`,
    '-c',
    'core.fsmonitor=false',
  ];
  const run = (args: string[]) => runCommitEditProcess(repo.repoPath, [...options, ...args], signal, isolatedGitEnvironment(directory));
  if (bundleFile) await run(['bundle', 'unbundle', bundleFile]);
  if (publication.reason !== 'missing-commit') {
    const refFile = path.join(commonDir, ref);
    await assertManagedPathAsync(commonDir, refFile);
    await fs.mkdir(path.dirname(refFile), { recursive: true });
    await fs.writeFile(refFile, `${oid}\n`);
  }
  if ((await run(['rev-parse', '--verify', 'HEAD^{commit}'])) !== oid) throw new Error('The repaired copy does not resolve to the chosen commit.');
  await run(['fsck', '--full', '--no-dangling']);
  if (!repo.bare) {
    // Preserve Git's status interpretation in the copy without invoking external clean filters.
    const config = await run(['config', '--null', '--list']);
    const drivers = new Set<string>();
    for (const record of config.split('\0')) {
      const option = /^(filter\..+)\.(?:process|clean|required)\n/.exec(record)?.[1];
      if (option) drivers.add(option);
    }
    const filters = [...drivers].flatMap((name) => ['-c', `${name}.process=`, '-c', `${name}.clean=`, '-c', `${name}.required=false`]);
    await run([...filters, 'status', '--porcelain=v2', '--branch', '--no-ahead-behind', '--ignore-submodules=all', '-z']);
  }
}

async function acquireGitLock(root: string, file: string, mode = 0o600) {
  await assertManagedPathAsync(root, file);
  const handle = await fs.open(file, 'wx', mode).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new Error(`Another Git operation is holding ${path.basename(file)}.`);
    throw error;
  });
  const identity = await handle.stat({ bigint: true });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await handle.close();
  };
  const validate = async () => {
    await assertManagedPathAsync(root, file);
    const actual = await fs.lstat(file, { bigint: true });
    if (!actual.isFile() || actual.dev !== identity.dev || actual.ino !== identity.ino) throw new Error('The Git lock changed.');
  };
  return {
    handle,
    close,
    validate,
    release: async () => {
      await close().catch(() => {});
      await validate()
        .then(() => fs.unlink(file))
        .catch(() => {});
    },
  };
}

export async function publishBranchRepair(git: GitRunner, publication: Publication): Promise<void> {
  const { repo, ref, oid, reason, basis, directory, bundleFile, signal, ensureActive } = publication;
  const refPath = path.join(repo.commonDir, ref);
  const persistentOptions = {
    envOverrides: { ...isolatedGitEnvironment(directory), GIT_COMMITTER_NAME: 'Open-Git-Control', GIT_COMMITTER_EMAIL: 'recovery@open-git-control.invalid' },
  };
  await git.withExclusiveWrite(
    repo.repoPath,
    'branch-repair',
    async (writer) => {
      const check = async () => {
        ensureActive();
        const folders = (
          await writer.run(repo.repoPath, ['rev-parse', '--absolute-git-dir', '--git-common-dir'], { envOverrides: branchRecoveryEnvironment })
        ).split(/\r?\n/);
        const [gitDir, commonDir] = await Promise.all(folders.map((folder) => fs.realpath(path.resolve(repo.repoPath, folder))));
        if (
          !gitDir ||
          !commonDir ||
          path.relative(gitDir, repo.gitDir) ||
          path.relative(commonDir, repo.commonDir) ||
          (await readRepairBasis(repo, ref, signal)).stamp !== basis.stamp
        )
          throw new Error('The branch or index changed. Inspect it again.');
        ensureActive();
      };
      await check();
      const headLock = await acquireGitLock(repo.gitDir, path.join(repo.gitDir, 'HEAD.lock'));
      try {
        await check();
        if (bundleFile) await writer.run(repo.repoPath, ['bundle', 'unbundle', bundleFile], persistentOptions);
        await check();
        if ((await writer.run(repo.repoPath, ['cat-file', '-t', oid], persistentOptions)) !== 'commit') throw new Error('The chosen commit is unavailable.');
        if (reason === 'broken-ref') {
          const current = await fs.lstat(refPath);
          const refLockPath = `${refPath}.lock`;
          const lock = await acquireGitLock(repo.commonDir, refLockPath, current.mode & 0o777);
          try {
            await lock.handle.writeFile(`${oid}\n`, 'ascii');
            await lock.handle.sync();
            await lock.close();
            await check();
            await lock.validate();
            ensureActive();
            await fs.rename(refLockPath, refPath);
          } finally {
            await lock.release();
          }
        } else if (reason === 'missing-ref') {
          // The detached metadata directory prevents update-ref from taking the live HEAD lock again.
          const detached = path.join(directory, 'detached');
          const hooks = path.join(directory, 'empty-hooks');
          await fs.mkdir(detached);
          await fs.writeFile(path.join(detached, 'HEAD'), `${oid}\n`);
          await fs.writeFile(path.join(detached, 'commondir'), `${repo.commonDir.replace(/\\/g, '/')}\n`);
          await check();
          await writer.run(
            repo.repoPath,
            [
              `--git-dir=${detached}`,
              '-c',
              `core.hooksPath=${hooks}`,
              'update-ref',
              '--no-deref',
              '-m',
              'Open-Git-Control: recover branch',
              ref,
              oid,
              '0'.repeat(oid.length),
            ],
            { ...persistentOptions, ignoreAbort: true },
          );
        }
        const verified = await writer.run(repo.repoPath, ['rev-parse', '--verify', 'HEAD^{commit}'], { ...persistentOptions, ignoreAbort: true });
        if (verified !== oid) throw new Error('The live repository did not resolve to the repaired commit.');
      } finally {
        await headLock.release();
      }
    },
    signal,
  );
}
