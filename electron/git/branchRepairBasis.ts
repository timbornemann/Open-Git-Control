import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertManagedPathAsync } from '../main-process/storageSafety';
import {
  isMissing,
  isReflogForBranch,
  readRecoveryReflog,
  packedBranchOid,
  readRecoveryFile,
  recoveryDirectoryKey,
  type BranchRepository,
} from './branchRecoveryRepository';

export type RepairBasis = {
  stamp: string;
  loose: Buffer | null;
  packed: string | undefined;
  branchLog: string | undefined;
  headLog: string | undefined;
  headLogMatchesBranch: boolean;
};

async function indexDigest(repo: BranchRepository, signal?: AbortSignal): Promise<string> {
  if (repo.bare) return '';
  const file = path.join(repo.gitDir, 'index');
  await assertManagedPathAsync(repo.gitDir, file);
  try {
    if (!(await fs.lstat(file)).isFile()) throw new Error('Git index is not a regular file.');
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file, { signal })) digest.update(chunk);
    return digest.digest('hex');
  } catch (error) {
    if (isMissing(error)) return '';
    throw error;
  }
}

export async function readRepairBasis(repo: BranchRepository, ref: string, signal?: AbortSignal): Promise<RepairBasis> {
  signal?.throwIfAborted();
  const [head, loose, packed, branchLog, headLog, index, gitDirKey, commonDirKey] = await Promise.all([
    readRecoveryFile(repo.gitDir, 'HEAD'),
    readRecoveryFile(repo.commonDir, ref),
    packedBranchOid(repo, ref),
    readRecoveryReflog(repo, ref),
    readRecoveryReflog(repo, 'HEAD'),
    indexDigest(repo, signal),
    recoveryDirectoryKey(repo.gitDir),
    recoveryDirectoryKey(repo.commonDir),
  ]);
  if (head?.toString('utf8').trimEnd() !== `ref: ${ref}` || commonDirKey !== repo.key) throw new Error('The active branch changed. Inspect it again.');
  for (const [root, lock] of [
    [repo.gitDir, 'index.lock'],
    [repo.commonDir, 'packed-refs.lock'],
  ] as const) {
    const locked = await fs.lstat(path.join(root, lock)).then(
      () => true,
      (error: unknown) => {
        if (isMissing(error)) return false;
        throw error;
      },
    );
    if (locked) throw new Error('Another Git operation is holding a metadata lock.');
  }
  const stamp = createHash('sha256')
    .update(JSON.stringify([gitDirKey, commonDirKey, head.toString('base64'), loose?.toString('base64'), packed, branchLog, headLog, index]))
    .digest('hex');
  return { stamp, loose, packed, branchLog: branchLog.oid, headLog: headLog.oid, headLogMatchesBranch: isReflogForBranch(headLog.checkout, ref) };
}
