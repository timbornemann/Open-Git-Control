import type { BranchHeadProblem, RepositoryHead } from '../../src/shared/ipc/branchRecovery';
import type { IpcErrorResult } from '../../src/types/ipc';
import type { GitRunner } from './GitRunner';
import type { GitProcessResult, GitRunOptions } from './GitProcessTypes';
import {
  branchReadOptions,
  describeBranchRepository,
  directRefOid,
  isReflogForBranch,
  readRecoveryReflog,
  packedBranchOid,
  readRecoveryFile,
  recoveryOid,
  validLocalRef,
  type BranchRepository,
} from './branchRecoveryRepository';
import { parseBranchStatus } from './branchStatusPorcelain';

const messages: Record<BranchHeadProblem['reason'], string> = {
  'broken-ref': 'Branch reference is damaged.',
  'missing-ref': 'Branch reference is missing and a previous tip exists.',
  'missing-commit': 'The commit referenced by HEAD is missing.',
  unverifiable: 'The repository HEAD could not be verified.',
};

export class BranchHeadError extends Error {
  constructor(
    readonly problem: BranchHeadProblem,
    readonly repository?: BranchRepository,
    detail?: string,
  ) {
    super([messages[problem.reason], problem.ref, detail].filter(Boolean).join(' '));
  }
}

export function branchGitFailure(error: unknown): IpcErrorResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    ...(error instanceof BranchHeadError ? { headProblem: error.problem } : {}),
  };
}

type BranchTipObservation = { repoPath: string; ref: string; oid: string };
type RunHeadProbe = (args: string[]) => Promise<GitProcessResult>;
type HeadFailure = (reason: BranchHeadProblem['reason'], repairable: boolean, repo?: BranchRepository, targetOid?: string, detail?: string) => BranchHeadError;
type HeadEvidence = {
  previousTip?: (repository: BranchRepository, ref: string) => Promise<string | undefined>;
  observeTip?: (observation: BranchTipObservation) => void;
};

export class RepositoryHeadService {
  constructor(
    private readonly git: Pick<GitRunner, 'runResult'>,
    private readonly evidence: HeadEvidence = {},
  ) {}

  async read(repoPath: string, options: GitRunOptions = {}): Promise<RepositoryHead> {
    const run = (args: string[]) => this.git.runResult(repoPath, args, branchReadOptions(options));
    const head = await run(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
    const oid = head.stdout.trim();
    if (head.exitCode === 0 && recoveryOid(oid)) return { kind: 'ready', oid };

    const symbolic = await run(['symbolic-ref', '--quiet', '--no-recurse', 'HEAD']);
    const ref = symbolic.stdout.replace(/\r?\n$/, '');
    const fail: HeadFailure = (reason, repairable, repository, targetOid, detail) =>
      new BranchHeadError({ repoPath, ref: validLocalRef(ref) ? ref : null, reason, repairable, targetOid, detail }, repository, detail);
    if (symbolic.exitCode !== 0 || !validLocalRef(ref) || (await run(['check-ref-format', ref])).exitCode !== 0) {
      throw fail('unverifiable', false, undefined, undefined, symbolic.stderr.trim() || head.stderr.trim());
    }

    try {
      const repo = await describeBranchRepository(this.git, repoPath, options);
      return await this.inspectSymbolicHead(repo, ref, run, fail, head.stderr.trim());
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof BranchHeadError || (error instanceof Error && error.name === 'AbortError')) throw error;
      throw fail('unverifiable', false, undefined, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  private async inspectSymbolicHead(repo: BranchRepository, ref: string, run: RunHeadProbe, fail: HeadFailure, detail: string): Promise<RepositoryHead> {
    const existence = await run(['show-ref', '--exists', ref]);
    const files = repo.refStorage === 'files';
    const legacy = files && existence.exitCode === 129 && /unknown option.*exists/i.test(existence.stderr);
    const loose = files ? await readRecoveryFile(repo.commonDir, ref) : null;
    const looseOid = directRefOid(loose, repo.format);
    const malformed = loose !== null && !looseOid && !loose.toString('latin1').startsWith('ref:');
    if (malformed && (existence.exitCode === 1 || legacy)) throw fail('broken-ref', true, repo);
    const packed = files && loose === null && (legacy || existence.exitCode === 0) ? await packedBranchOid(repo, ref) : undefined;
    if (loose === null && (existence.exitCode === 2 || (legacy && !packed))) {
      if (await this.hasPreviousTip(repo, ref, run)) throw fail('missing-ref', files, repo);
      return { kind: 'unborn', ref };
    }
    if ((existence.exitCode === 0 || legacy) && (loose === null || looseOid)) {
      const storedOid = looseOid ?? packed;
      const target = await readMissingTarget(repo, ref, run, storedOid);
      if (target) throw fail('missing-commit', files && Boolean(storedOid), repo, target);
    }
    throw fail('unverifiable', false, repo, undefined, detail || existence.stderr.trim());
  }

  private async hasPreviousTip(repo: BranchRepository, ref: string, run: RunHeadProbe): Promise<boolean> {
    if (repo.refStorage === 'files') {
      const branch = await readRecoveryReflog(repo, ref);
      if (branch.oid) return true;
      const head = await readRecoveryReflog(repo, 'HEAD');
      if (head.oid && isReflogForBranch(head.checkout, ref)) return true;
    } else {
      const reflog = await run(['reflog', 'exists', ref]);
      if (reflog.exitCode === 0) return true;
      if (reflog.exitCode !== 1) throw new Error(reflog.stderr.trim() || 'The branch reflog could not be checked.');
    }
    return Boolean(await this.evidence.previousTip?.(repo, ref));
  }

  async status(repoPath: string, options: GitRunOptions = {}): Promise<{ status: string; head: RepositoryHead }> {
    const result = await this.git.runResult(
      repoPath,
      ['-c', 'core.quotepath=false', 'status', '--porcelain=v2', '--branch', '--no-ahead-behind', '-z', '--untracked-files=all', '--ignore-submodules=none'],
      branchReadOptions({ maxBuffer: 20 * 1024 * 1024, ...options }),
    );
    options.signal?.throwIfAborted();
    if (result.exitCode !== 0) {
      await this.read(repoPath, options);
      throw new Error(result.stderr.trim() || 'Git status failed.');
    }
    const parsed = parseBranchStatus(result.stdout);
    if (parsed.head?.kind === 'ready' && parsed.head.ref) {
      this.evidence.observeTip?.({ repoPath, ref: parsed.head.ref, oid: parsed.head.oid });
    }
    if (parsed.head) return { status: parsed.status, head: parsed.head };
    const head = await this.read(repoPath, options);
    if (head.kind === 'ready') throw new Error('HEAD changed while reading Git status.');
    return { status: parsed.status, head };
  }
}

async function readMissingTarget(repo: BranchRepository, ref: string, run: RunHeadProbe, storedOid?: string): Promise<string | undefined> {
  const raw = storedOid ? null : await run(['rev-parse', '--verify', '--quiet', ref]);
  const oid = storedOid ?? raw?.stdout.trim() ?? '';
  if ((!storedOid && raw?.exitCode !== 0) || !recoveryOid(oid, repo.format)) return undefined;
  const object = await run(['cat-file', '-t', oid]);
  if (object.exitCode !== 0 && /could not get object info|bad object|missing object/i.test(object.stderr)) return oid;
  return undefined;
}
