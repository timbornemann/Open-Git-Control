import * as path from 'node:path';
import type { BranchRecoveryCandidate, BranchRecoveryInspection, BranchRecoverySource } from '../../src/shared/ipc/branchRecovery';
import { BranchHeadError, type RepositoryHeadService } from './RepositoryHeadService';
import { branchReadOptions, branchRecoveryEnvironment, directRefOid, recoveryOid, type BranchRepository } from './branchRecoveryRepository';
import type { BranchBundle, BranchBundleStore } from './branchBundles';
import type { BranchTipJournal } from './BranchTipJournal';
import type { GitRunner } from './GitRunner';
import { readRepairBasis, type RepairBasis } from './branchRepairBasis';
import { copyRepairMetadata, verifyIsolatableMetadata, type BranchRepairSnapshots } from './BranchRepairSnapshots';
import { cleanupPrivateTempDirAsync, createPrivateTempDir } from './PrivateTempFiles';
import { preflightBranchRepair, publishBranchRepair } from './publishBranchRepair';

type Candidate = BranchRecoveryCandidate & { bundle?: BranchBundle };
export type BranchRepairPlan = {
  inspection: Omit<BranchRecoveryInspection, 'confirmationId'>;
  repo?: BranchRepository;
  basis?: RepairBasis;
  candidates: Candidate[];
};

export class BranchRecoveryService {
  constructor(
    private readonly git: GitRunner,
    private readonly heads: RepositoryHeadService,
    private readonly journal: BranchTipJournal,
    private readonly backups: { bundles: BranchBundleStore; versions: (repo: BranchRepository) => Promise<BranchBundle[]> },
    private readonly snapshots: BranchRepairSnapshots,
  ) {}

  async inspect(repoPath: string, signal?: AbortSignal): Promise<BranchRepairPlan | null> {
    try {
      await this.heads.read(repoPath, { signal, requestedKind: 'preflight' });
      return null;
    } catch (error) {
      if (!(error instanceof BranchHeadError)) throw error;
      const { problem, repository: repo } = error;
      const blocked = { inspection: { problem, candidates: [] }, candidates: [] };
      if (!problem.repairable || !repo || !problem.ref) return blocked;
      const ref = problem.ref;
      await verifyIsolatableMetadata(repo);
      const basis = await readRepairBasis(repo, ref, signal);
      this.assertDamage(error, basis);
      const sources = new Map<string, Set<BranchRecoverySource>>();
      const add = (oid: string | undefined, source: BranchRecoverySource) => {
        if (!oid || !recoveryOid(oid, repo.format) || (problem.targetOid && oid !== problem.targetOid)) return;
        const evidence = sources.get(oid) ?? new Set<BranchRecoverySource>();
        evidence.add(source);
        sources.set(oid, evidence);
      };
      add(basis.branchLog, 'branch-reflog');
      add(await this.journal.previousTip(repo, ref), 'last-seen');
      const versions = await this.backups.versions(repo).catch(() => []);
      const versionsByOid = new Map<string, BranchBundle[]>();
      for (const bundle of versions) {
        const oid = problem.targetOid ?? bundle.refs[ref];
        if (!oid) continue;
        add(oid, 'bundle');
        const alternatives = versionsByOid.get(oid) ?? [];
        alternatives.push(bundle);
        versionsByOid.set(oid, alternatives);
      }
      if (basis.headLog && (basis.headLogMatchesBranch || sources.has(basis.headLog))) add(basis.headLog, 'head-reflog');
      const index = repo.bare ? null : await this.objectListing(repoPath, ['ls-files', '--stage', '-z'], signal).catch(() => null);
      const candidates: Candidate[] = [];
      for (const [oid, evidence] of sources) {
        signal?.throwIfAborted();
        const local = await this.candidate(repoPath, oid, evidence, index, signal);
        if (local) {
          // Local evidence independently proves this commit. Verify any bundle used for an import.
          if (evidence.size > 1 || !evidence.has('bundle')) {
            candidates.push(local);
            continue;
          }
        }
        for (const bundle of versionsByOid.get(oid) ?? []) {
          try {
            const checked = await this.backups.bundles.withVerifiedBundle(bundle, repo, signal, (directory) =>
              this.candidate(directory, oid, evidence, index, signal),
            );
            if (checked) {
              candidates.push(local ?? { ...checked, bundle });
              break;
            }
          } catch {
            signal?.throwIfAborted();
          }
        }
      }
      if ((await readRepairBasis(repo, ref, signal)).stamp !== basis.stamp) throw new Error('The branch or index changed. Inspect it again.');
      return { repo, basis, candidates, inspection: { problem, candidates: candidates.map(({ bundle: _bundle, ...candidate }) => candidate) } };
    }
  }

  private assertDamage(error: BranchHeadError, basis: RepairBasis) {
    const { reason, targetOid } = error.problem;
    const repo = error.repository!;
    const loose = directRefOid(basis.loose, repo.format);
    const agrees =
      reason === 'broken-ref'
        ? basis.loose !== null && !loose && !basis.loose.toString('latin1').startsWith('ref:')
        : reason === 'missing-ref'
          ? basis.loose === null && !basis.packed
          : (basis.loose === null ? basis.packed : loose) === targetOid;
    if (!agrees) throw new Error('The branch reference changed. Inspect it again.');
  }

  private objectListing(repoPath: string, args: string[], signal?: AbortSignal) {
    return this.git.runBuffer(repoPath, args, {
      signal,
      requestedKind: 'preflight',
      envOverrides: branchRecoveryEnvironment,
      maxBytes: 64 * 1024 * 1024,
      tooLargeMessage: 'The index or commit tree is too large for an exact comparison.',
    });
  }

  private async candidate(
    repoPath: string,
    oid: string,
    sources: Set<BranchRecoverySource>,
    index: Buffer | null,
    signal?: AbortSignal,
  ): Promise<BranchRecoveryCandidate | null> {
    const options = branchReadOptions({ requestedKind: 'preflight', signal });
    const type = await this.git.runResult(repoPath, ['cat-file', '-t', oid], options);
    if (type.exitCode !== 0 || type.stdout.trim() !== 'commit') return null;
    const result = await this.git.runResult(repoPath, ['show', '-s', '--no-notes', '--no-show-signature', '--format=%s%x00%cI', oid, '--'], options);
    if (result.exitCode !== 0) return null;
    const [subject, committedAt] = result.stdout.trimEnd().split('\0');
    const tree = index ? await this.objectListing(repoPath, ['ls-tree', '-rz', '--full-tree', oid], signal).catch(() => null) : null;
    return { oid, subject, committedAt, sources: [...sources], indexMatch: index && tree ? compareIndexToTree(index, tree) : null };
  }

  async repair(plan: BranchRepairPlan, oid: string, ensureActive: () => void, signal?: AbortSignal): Promise<{ oid: string }> {
    const { repo, basis, inspection } = plan;
    const { ref, reason } = inspection.problem;
    const candidate = plan.candidates.find((entry) => entry.oid === oid);
    if (!repo || !ref || !basis || !candidate) throw new Error('Choose a verified recovery candidate.');
    ensureActive();
    await verifyIsolatableMetadata(repo);
    if ((await readRepairBasis(repo, ref, signal)).stamp !== basis.stamp) throw new Error('The branch or index changed. Inspect it again.');
    // A fresh diagnostic also catches a repaired object database with unchanged ref bytes.
    const current = await this.heads.read(repo.repoPath, { signal, requestedKind: 'preflight' }).catch((error: unknown) => {
      if (
        error instanceof BranchHeadError &&
        error.problem.reason === reason &&
        error.problem.ref === ref &&
        error.problem.targetOid === inspection.problem.targetOid
      )
        return null;
      throw error;
    });
    if (current) throw new Error('The branch is already readable. Inspect it again.');
    const directory = createPrivateTempDir('branch-repair');
    let snapshot: Awaited<ReturnType<BranchRepairSnapshots['capture']>> | undefined;
    try {
      snapshot = await this.snapshots.capture(repo, ref, oid, signal);
      const copy = path.join(directory, 'git-metadata');
      await copyRepairMetadata(snapshot.commonDir, copy, signal);
      const recover = async (bundleFile?: string) => {
        const publication = { repo, ref, reason, oid, basis, directory, bundleFile, signal, ensureActive };
        await preflightBranchRepair(publication, copy);
        await publishBranchRepair(this.git, publication);
      };
      if (candidate.bundle) await this.backups.bundles.withVerifiedBundle(candidate.bundle, repo, signal, (_directory, file) => recover(file));
      else await recover();
      await this.journal.record(repo, { [ref]: oid }, Date.now()).catch(() => {});
      return { oid };
    } finally {
      snapshot?.release();
      await cleanupPrivateTempDirAsync(directory);
    }
  }
}

function compareIndexToTree(index: Buffer, tree: Buffer): NonNullable<BranchRecoveryCandidate['indexMatch']> {
  // Latin-1 preserves each byte of the NUL-delimited path instead of decoding it as UTF-8.
  const entries = index.toString('latin1').split('\0').filter(Boolean);
  const expected = new Set(
    tree
      .toString('latin1')
      .split('\0')
      .filter(Boolean)
      .map((record) => {
        const tab = record.indexOf('\t');
        const [mode, , oid] = record.slice(0, tab).split(' ');
        return `${mode} ${oid} 0\t${record.slice(tab + 1)}`;
      }),
  );
  return { matches: entries.length === expected.size && entries.every((entry) => expected.has(entry)), entries: entries.length };
}
