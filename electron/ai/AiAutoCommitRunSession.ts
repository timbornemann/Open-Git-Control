import type { GitService } from '../GitService';
import type { AppSettings } from '../settings';
import type { AiProviderClient } from './AiProviderClient';
import { getSelectedAiModel } from './AiProviderClient';
import { parseStatusPorcelain } from './gitStatusSnapshot';
import type { AiAutoCommitResult, AiProgressUpdate } from './aiServiceTypes';
import { AiAutoCommitIndexTransaction } from './AiAutoCommitIndexTransaction';
import { AutoCommitContextBuilder } from './AutoCommitContextBuilder';
import { AutoCommitGlobalPlanner, AiPlanningUnavailable } from './AutoCommitGlobalPlanner';
import { fallbackAutoCommitPlan, validateAutoCommitPlan } from './AutoCommitPlanValidator';
import { recordAutoCommitDiagnostic } from './AutoCommitDiagnostics';
import type { AutoCommitContext, AutoCommitGroupResult, AutoCommitMetrics, AutoCommitSnapshot } from './AutoCommitPlanTypes';

/** One immutable snapshot, one global plan, then sequential checked Git writes. */
export class AiAutoCommitRunSession {
  private readonly control = new AbortController();
  private readonly transaction: AiAutoCommitIndexTransaction;
  private readonly metrics: AutoCommitMetrics = { snapshotMs: 0, contextMs: 0, aiMs: 0, gitMs: 0, providerCalls: 0, contextCacheHits: 0, contextBytes: 0 };
  private readonly warnings: string[] = [];
  private readonly diagnostics: string[] = [];
  private readonly groups: AutoCommitGroupResult[] = [];
  private readonly commits: Array<{ hash: string; subject: string }> = [];
  private snapshot?: AutoCommitSnapshot;
  private retries = 0;
  constructor(
    private readonly git: GitService,
    private readonly provider: AiProviderClient,
    private readonly repoPath: string,
    private readonly settings: AppSettings,
    private readonly getGeminiApiKey: () => string,
    private readonly onProgress?: (update: AiProgressUpdate) => void,
    private readonly shouldCancel: () => boolean = () => false,
    private readonly getOpenAiApiKey: () => string = () => '',
    private readonly beforeCommit?: (privateIndexPath: string, baseTree?: string) => Promise<void>,
  ) {
    this.transaction = new AiAutoCommitIndexTransaction(git, repoPath, beforeCommit, {
      signoff: settings.commitSignoffByDefault,
      ensureActive: () => this.ensureActive(),
      signal: this.control.signal,
    });
  }

  async run(): Promise<AiAutoCommitResult> {
    const cancellation = setInterval(() => {
      if (this.shouldCancel()) this.control.abort();
    }, 100);
    const timeout = setTimeout(() => this.control.abort(new Error('AI Auto-Commit run exceeded its time limit.')), 10 * 60 * 1000);
    try {
      this.validateInputs();
      this.emit('snapshot', 'Änderungsstände werden erfasst …', 5);
      const started = Date.now();
      const entries = parseStatusPorcelain(await this.git.getStatusPorcelainZAtPath(this.repoPath));
      if (entries.some((entry) => /^(UU|AA|DD|AU|UA|DU|UD)$/.test(entry.code))) throw new Error('Repository hat Konflikte. Bitte zuerst auflösen.');
      if (!entries.length) throw new Error('Working Tree ist sauber. Keine Commits nötig.');
      await this.transaction.initialize(entries);
      this.snapshot = await this.transaction.getSnapshot();
      this.metrics.snapshotMs = Date.now() - started;
      if (!this.snapshot.changes.length) throw new Error('Keine commitbaren Änderungen. Interne Änderungen in Submodulen müssen zuerst dort committet werden.');
      if (this.snapshot.skippedPaths.length) this.warnings.push(`Interne Submodul-Änderungen bleiben offen: ${this.snapshot.skippedPaths.join(', ')}`);
      // Check both transitions before transmitting context, including staged
      // secrets subsequently removed from the worktree snapshot.
      if (this.snapshot.changes.some((change) => change.source === 'staged')) await this.beforeCommit?.(this.snapshot.stagedIndexPath, this.snapshot.headTree);
      if (this.snapshot.changes.some((change) => change.source === 'worktree'))
        await this.beforeCommit?.(this.snapshot.worktreeIndexPath, this.snapshot.stagedTree);
      this.ensureActive();
      await this.preparePlan(this.snapshot);
      this.ensureActive();
      this.emit('validating', `${this.groups.length} Commit-Gruppen vorbereitet`, 35);
      const byId = new Map(this.snapshot.changes.map((change) => [change.id, change]));
      for (const [index, group] of this.groups.entries()) {
        this.ensureActive();
        this.emit('committing', `${index + 1}/${this.groups.length}: ${group.title}`, 35 + Math.floor((60 * index) / this.groups.length), {
          groupId: index + 1,
          groupSize: group.paths.length,
        });
        const gitStarted = Date.now();
        try {
          const hash = await this.transaction.commit(
            group.changeIds.map((id) => byId.get(id)!),
            group,
            group.source,
          );
          // Record durability before cancellation checks or another Git read.
          group.status = 'committed';
          group.hash = hash;
          const commit = { hash, subject: group.title };
          this.commits.push(commit);
          try {
            commit.subject = (await this.git.runCommandAtPath(this.repoPath, ['show', '-s', '--format=%s', hash])).trim();
          } catch {
            /* Already durable. */
          }
          this.emit('committing', `Commit erstellt: ${commit.subject}`, 35 + Math.floor((60 * (index + 1)) / this.groups.length));
        } finally {
          this.metrics.gitMs += Date.now() - gitStarted;
        }
      }
      return this.finish('complete');
    } catch (error) {
      const cancelled = this.shouldCancel() || this.control.signal.aborted;
      const message = cancelled ? 'KI Auto-Commit wurde abgebrochen.' : error instanceof Error ? error.message : 'AI Auto-Commit failed.';
      if (this.commits.length || cancelled) return this.finish(cancelled ? 'cancelled' : 'partial', message);
      throw error;
    } finally {
      clearInterval(cancellation);
      clearTimeout(timeout);
      recordAutoCommitDiagnostic(
        this.repoPath,
        this.metrics,
        this.commits.length,
        this.groups.some((group) => group.messageSource === 'fallback'),
      );
      this.transaction.dispose();
    }
  }

  private async preparePlan(snapshot: AutoCommitSnapshot): Promise<void> {
    this.emit('context', 'Diffs und Zusammenhänge werden analysiert …', 12);
    const started = Date.now();
    const builder = new AutoCommitContextBuilder(this.git, this.repoPath, this.control.signal);
    let context: AutoCommitContext = {
      changes: snapshot.changes.map((change) => ({ ...change, hunks: [], symbols: [], references: [], imports: [] })),
      relationships: [],
      relatedCode: [],
    };
    const planner = new AutoCommitGlobalPlanner(
      this.provider,
      this.settings,
      this.getGeminiApiKey,
      this.getOpenAiApiKey,
      () => this.ensureActive(),
      () => this.shouldCancel() || this.control.signal.aborted,
    );
    let plan;
    try {
      try {
        context = await builder.build(snapshot);
      } catch (error) {
        if (error instanceof Error && /AI .*exceeds.*budget|Git stream line exceeded/.test(error.message)) throw new AiPlanningUnavailable(error.message);
        throw error;
      }
      this.metrics.contextMs = Date.now() - started;
      this.metrics.contextCacheHits = builder.objects.cacheHits;
      this.metrics.contextBytes = Buffer.byteLength(JSON.stringify(context));
      this.emit('grouping', 'KI plant zusammenhängende Commits und Nachrichten …', 22);
      plan = await planner.plan(context);
    } catch (error) {
      this.ensureActive();
      if (!(error instanceof AiPlanningUnavailable)) throw error;
      this.diagnostics.push(error.message);
      this.warnings.push('KI-Planung fehlgeschlagen: gestagter Stand und übrige Änderungen werden jeweils als gemeinsamer Ersatz-Commit verarbeitet.');
      plan = fallbackAutoCommitPlan(context, this.settings);
    } finally {
      this.metrics.aiMs = planner.aiMs;
      this.metrics.providerCalls = planner.calls;
      this.retries = planner.retries;
    }
    const byId = new Map(snapshot.changes.map((change) => [change.id, change]));
    validateAutoCommitPlan(JSON.stringify({ groups: plan }), context, this.settings);
    this.groups.push(...plan.map((group) => ({ ...group, paths: group.changeIds.map((id) => byId.get(id)!.path), status: 'pending' as const })));
    if (plan.some((group) => group.messageSource === 'fallback')) this.emit('fallback', this.warnings.at(-1)!, 32);
  }

  private counts(): { processedFiles: number; remainingFiles: number } {
    const completed = new Set(this.groups.filter((group) => group.status === 'committed').flatMap((group) => group.changeIds));
    const all = this.snapshot?.changes || [];
    const paths = new Set(all.map((change) => change.path));
    const remaining = new Set(all.filter((change) => !completed.has(change.id)).map((change) => change.path));
    return { processedFiles: paths.size - remaining.size, remainingFiles: remaining.size };
  }

  private emit(phase: AiProgressUpdate['phase'], message: string, progress?: number, details: Record<string, unknown> = {}): void {
    this.onProgress?.({
      phase,
      message,
      progress,
      details: {
        ...this.counts(),
        groups: this.groups.map((group) => ({ ...group })),
        totalCommits: this.commits.length,
        lastCommit: this.commits.length ? `${this.commits.at(-1)!.hash.slice(0, 8)} ${this.commits.at(-1)!.subject}` : null,
        mode: this.groups.some((group) => group.messageSource === 'fallback') ? 'fallback' : 'normal',
        ...details,
      },
    });
  }

  private async finish(outcome: 'complete' | 'partial' | 'cancelled', error?: string): Promise<AiAutoCommitResult> {
    let remainingFiles = this.counts().remainingFiles;
    try {
      remainingFiles = new Set(parseStatusPorcelain(await this.git.getStatusPorcelainZAtPath(this.repoPath)).map((entry) => entry.path)).size;
    } catch {
      /* Known snapshot count remains available. */
    }
    const summary = `${outcome === 'complete' ? 'KI Auto-Commit abgeschlossen' : outcome === 'cancelled' ? 'KI Auto-Commit abgebrochen' : 'KI Auto-Commit teilweise abgeschlossen'}: ${this.commits.length} Commit(s), ${remainingFiles} offene Datei(en).${error ? ` ${error}` : ''}`;
    try {
      this.emit(outcome === 'complete' ? 'done' : outcome === 'cancelled' ? 'cancelled' : 'failed', summary, outcome === 'complete' ? 100 : undefined, {
        remainingFiles,
        outcome,
        metrics: this.metrics,
      });
    } catch {
      /* Renderer changed repository; retain durable results. */
    }
    return {
      outcome,
      error,
      commits: this.commits,
      groups: this.groups,
      metrics: this.metrics,
      summary,
      turns: this.metrics.providerCalls,
      modeTransitions: ['normal', ...(this.groups.some((group) => group.messageSource === 'fallback') ? ['fallback'] : [])],
      processedFiles: this.counts().processedFiles,
      remainingFiles,
      commitPlanStats: {
        groupCount: this.groups.length,
        retries: this.retries,
        fallbackCommits: this.groups.filter((group) => group.messageSource === 'fallback' && group.status === 'committed').length,
        totalCommits: this.commits.length,
        totalFilesProcessed: this.counts().processedFiles,
      },
      warnings: this.warnings,
      diagnostics: this.diagnostics,
    };
  }

  private ensureActive(): void {
    if (this.shouldCancel() || this.control.signal.aborted) throw new Error('KI Auto-Commit wurde abgebrochen.');
  }

  private validateInputs(): void {
    this.ensureActive();
    if (!this.repoPath.trim()) throw new Error('No repository selected.');
    if (!this.settings.aiAutoCommitEnabled) throw new Error('AI Auto-Commit ist in den Einstellungen deaktiviert.');
    if (!getSelectedAiModel(this.settings)) throw new Error('Kein KI-Modell konfiguriert.');
    if (this.settings.aiProvider === 'gemini' && !this.getGeminiApiKey().trim()) throw new Error('Gemini API key fehlt.');
    if (this.settings.aiProvider === 'openai' && !this.getOpenAiApiKey().trim()) throw new Error('OpenAI API key fehlt.');
  }
}
