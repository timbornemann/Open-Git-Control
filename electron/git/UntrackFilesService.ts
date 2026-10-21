import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { GitRunner } from './GitRunner';
import type { ExecuteUntrackFilesRequest, InspectUntrackFilesRequest, UntrackFilesInspection, UntrackFilesResult } from '../../src/shared/ipc/untrackFiles';
import { matchesUntrackScope, untrackScopeOptions } from '../../src/shared/ipc/untrackFiles';
import { normalizeRepositoryRelativePath, toLiteralPathspec, assertOutsideGitMetadata } from './RepositoryPathSafety';
import { withPrivateIndex } from './PrivateIndex';
import {
  readUntrackIndex,
  snapshotUntrackFile,
  untrackRepositoryIdentity,
  untrackSnapshotBudget,
  type UntrackContext,
  type UntrackFileSnapshot,
} from './untrackFilesSnapshot';

type Plan = {
  inspection: UntrackFilesInspection;
  repo: string;
  ownerId: number;
  generation: number;
  identity: string;
  snapshots: Map<string, UntrackFileSnapshot>;
};
const canonicalRepo = (repo: string) => fs.realpathSync.native(repo);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const LIFETIME = 15 * 60_000;

export class UntrackFilesService {
  private readonly plans = new Map<string, Plan>();
  constructor(private readonly runner: GitRunner) {}

  forgetOwner(ownerId: number) {
    for (const [id, plan] of this.plans) if (plan.ownerId === ownerId) this.plans.delete(id);
  }

  async inspect(request: InspectUntrackFilesRequest, context: UntrackContext): Promise<UntrackFilesInspection> {
    if (typeof request.path !== 'string' || request.path.length > 4096) throw new Error('Invalid file path.');
    const file = path.posix.normalize(normalizeRepositoryRelativePath(request.path));
    assertOutsideGitMetadata(file, 'File path');
    const scopes = untrackScopeOptions(file);
    const scope = scopes.find((option) => option.kind === request.scope);
    if (!scope) throw new Error('This scope is not available for the selected file.');
    const repo = canonicalRepo(request.repoPath);
    return this.runner.withExclusiveWrite(
      repo,
      'inspect-untrack-files',
      async (git) => {
        context.ensureActive();
        context.progress('inspect');
        const identity = await untrackRepositoryIdentity(git, repo);
        const state = await readUntrackIndex(git, repo);
        const files = [...state.entries.keys()].filter((entry) => matchesUntrackScope(entry, scope)).sort();
        if (files.length > 10_000) throw new Error('Too many matching files. Choose a smaller folder or a single file.');
        const snapshots = new Map<string, UntrackFileSnapshot>();
        const budget = untrackSnapshotBudget();
        const candidates: UntrackFilesInspection['candidates'] = [];
        for (const entry of files) {
          context.ensureActive();
          const snapshot = await snapshotUntrackFile(repo, entry, state, context.signal, budget);
          snapshots.set(entry, snapshot);
          candidates.push({
            id: createHash('sha256').update(entry).digest('hex'),
            path: entry,
            ignored: snapshot.ignored,
            added: state.added.has(entry),
            blocked: snapshot.blocked,
          });
        }
        context.ensureActive();
        if (identity !== (await untrackRepositoryIdentity(git, repo))) throw new Error('Repository changed. Inspect the files again.');
        const inspection: UntrackFilesInspection = { planId: randomUUID(), expiresAt: Date.now() + LIFETIME, scope: request.scope, scopes, candidates };
        // Bounded, session-only plans; no background cleanup timer.
        for (const [id, plan] of this.plans) if (plan.inspection.expiresAt <= Date.now() || plan.ownerId === context.ownerId) this.plans.delete(id);
        while (this.plans.size >= 64) this.plans.delete(this.plans.keys().next().value!);
        this.plans.set(inspection.planId, { inspection, repo, ownerId: context.ownerId, generation: context.generation, identity, snapshots });
        return inspection;
      },
      context.signal,
    );
  }

  async execute(request: ExecuteUntrackFilesRequest, context: UntrackContext): Promise<UntrackFilesResult> {
    const plan = this.plans.get(request.planId);
    if (!plan || plan.inspection.expiresAt <= Date.now()) return { status: 'stale', reason: 'expired' };
    if (plan.ownerId !== context.ownerId || plan.repo !== canonicalRepo(request.repoPath))
      throw new Error('This preview belongs to another window or repository.');
    if (plan.generation !== context.generation) return { status: 'stale', reason: 'repository' };
    if (
      !Array.isArray(request.selectedIds) ||
      !request.selectedIds.length ||
      request.selectedIds.length > plan.inspection.candidates.length ||
      new Set(request.selectedIds).size !== request.selectedIds.length
    )
      throw new Error('Invalid file selection.');
    const byId = new Map(plan.inspection.candidates.map((candidate) => [candidate.id, candidate]));
    const selected = request.selectedIds.map((id) => byId.get(id));
    if (selected.some((candidate) => !candidate || candidate.blocked)) throw new Error('The selection contains an unavailable file.');
    const files = selected.map((candidate) => candidate!.path);
    return this.runner.withExclusiveWrite(
      plan.repo,
      'execute-untrack-files',
      async (git) => {
        let stale: 'repository' | 'files' | 'expired' | undefined;
        const validate = async () => {
          context.ensureActive();
          if (plan.inspection.expiresAt <= Date.now()) stale = 'expired';
          else if (plan.identity !== (await untrackRepositoryIdentity(git, plan.repo))) stale = 'repository';
          else {
            const state = await readUntrackIndex(git, plan.repo);
            const budget = untrackSnapshotBudget();
            for (const file of files) {
              if (!same(plan.snapshots.get(file), await snapshotUntrackFile(plan.repo, file, state, context.signal, budget))) {
                stale = 'files';
                break;
              }
            }
          }
          context.ensureActive();
          if (stale) throw new Error('The file preview changed.');
        };
        try {
          context.progress('validate');
          await validate();
          await withPrivateIndex(git, plan.repo, async (index, publish) => {
            context.progress('prepare');
            // Literal, NUL-delimited paths only, no force flag. All changes stay private until publication.
            await git.input(
              plan.repo,
              ['rm', '--cached', '--pathspec-from-file=-', '--pathspec-file-nul'],
              files.map((file) => toLiteralPathspec(file)).join('\0') + '\0',
              false,
              { GIT_INDEX_FILE: index },
            );
            context.progress('publish');
            await publish(validate);
          });
          this.plans.delete(request.planId);
          // Cancellation after the atomic promotion must still report what actually completed.
          return { status: 'applied', paths: files };
        } catch (error) {
          if (stale) {
            this.plans.delete(request.planId);
            return { status: 'stale', reason: stale };
          }
          throw error;
        }
      },
      context.signal,
    );
  }
}
