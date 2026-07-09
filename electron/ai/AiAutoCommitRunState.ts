import type { AiProgressUpdate, AutoCommitStrategy, ProgressMode } from './aiServiceTypes';

const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const LARGE_HYBRID_AI_BUDGET_MS = 60_000;
const MIN_AI_CALL_BUDGET_MS = 1_200;

export class AiAutoCommitRunState {
  readonly runStartedAt = Date.now();
  mode: ProgressMode = 'normal';
  strategy: AutoCommitStrategy = 'standard';
  aiBudgetRemainingMs = Number.POSITIVE_INFINITY;
  aiBudgetExhausted = false;
  processedFiles = 0;
  modelTurns = 0;
  retries = 0;
  fallbackCommits = 0;
  readonly commits: Array<{ hash: string; subject: string }> = [];
  readonly warnings: string[] = [];
  readonly diagnostics: string[] = [];
  readonly modeTransitions: string[] = ['normal'];

  constructor(private readonly onProgress?: (update: AiProgressUpdate) => void) {}

  enableLargeHybridBudget(): void {
    this.strategy = 'large-hybrid';
    this.aiBudgetRemainingMs = LARGE_HYBRID_AI_BUDGET_MS;
  }

  buildProgressDetails(totalFiles: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    const details: Record<string, unknown> = {
      mode: this.mode,
      strategy: this.strategy,
      remainingFiles: Math.max(0, totalFiles - this.processedFiles),
      elapsedMs: Date.now() - this.runStartedAt,
      ...extra,
    };
    if (Number.isFinite(this.aiBudgetRemainingMs)) {
      details.aiBudgetRemainingMs = Math.max(0, Math.floor(this.aiBudgetRemainingMs));
    }
    return details;
  }

  getAiTimeoutMs(defaultTimeoutMs: number): number | null {
    if (!Number.isFinite(this.aiBudgetRemainingMs)) return defaultTimeoutMs;
    if (this.aiBudgetRemainingMs < MIN_AI_CALL_BUDGET_MS) return null;
    return Math.max(MIN_AI_CALL_BUDGET_MS, Math.min(defaultTimeoutMs, this.aiBudgetRemainingMs));
  }

  consumeAiBudget(startedAt: number, context: string): void {
    if (!Number.isFinite(this.aiBudgetRemainingMs)) return;
    const wasExhausted = this.aiBudgetExhausted;
    this.aiBudgetRemainingMs = Math.max(0, this.aiBudgetRemainingMs - (Date.now() - startedAt));
    if (this.aiBudgetRemainingMs < MIN_AI_CALL_BUDGET_MS) {
      this.aiBudgetExhausted = true;
      if (!wasExhausted) {
        this.warnings.push(`KI-Budget erreicht (${context}); verbleibende Gruppen laufen deterministisch weiter.`);
      }
    }
  }

  markAiBudgetExhausted(context: string): void {
    if (this.aiBudgetExhausted) return;
    this.aiBudgetExhausted = true;
    this.warnings.push(`KI-Budget erreicht (${context}); verbleibende Gruppen laufen deterministisch weiter.`);
  }

  transitionMode(nextMode: ProgressMode): void {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    this.modeTransitions.push(nextMode);
  }

  stopIfTimedOut(): boolean {
    if (!this.isRunTimedOut()) return false;
    this.warnings.push('Zeitbudget erreicht; verbleibende Dateien werden im Ergebnis ausgewiesen.');
    return true;
  }

  isRunTimedOut(): boolean {
    return Date.now() - this.runStartedAt > RUN_TIMEOUT_MS;
  }

  emitProgress(update: AiProgressUpdate): void {
    this.onProgress?.(update);
  }
}
