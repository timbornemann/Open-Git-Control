import type { SnapshotFile } from './aiServiceTypes';
import type { AiAutoCommitRunState } from './AiAutoCommitRunState';

const MAX_RETRIES_PER_GROUP = 2;
const MAX_GROUP_STALL_CYCLES = 8;

export type GroupState = {
  groupRetries: number;
  stallCycles: number;
};

export type GroupAction = 'continue' | 'break';

export class AiAutoCommitGroupRecovery {
  constructor(private readonly state: AiAutoCommitRunState) {}

  createState(): GroupState {
    return { groupRetries: 0, stallCycles: 0 };
  }

  isStalled(groupState: GroupState): boolean {
    return groupState.stallCycles >= MAX_GROUP_STALL_CYCLES;
  }

  handleEmptySelection(groupState: GroupState, groupIndex: number, groupSize: number, snapshotFiles: SnapshotFile[]): GroupAction {
    groupState.stallCycles += 1;
    if (this.stopStalledGroup(groupState, groupIndex, groupSize, snapshotFiles, 'erfolglosen Auswahl-/Retry-Zyklen')) return 'break';
    if (this.retryGroup(groupState, groupIndex, groupSize, snapshotFiles, 'Keine Auswahl erhalten')) return 'continue';
    this.activateFallback(groupIndex, groupSize, snapshotFiles, 'Auto-Fallback aktiv: Mikro-Batches werden verwendet.');
    return 'continue';
  }

  handleInvalidBatch(groupState: GroupState, groupIndex: number, groupSize: number, snapshotFiles: SnapshotFile[]): GroupAction {
    groupState.stallCycles += 1;
    this.state.warnings.push(`Gruppe ${groupIndex + 1}: KI-Auswahl enthielt keine gueltigen Pfade.`);
    if (this.stopStalledGroup(groupState, groupIndex, groupSize, snapshotFiles, 'wiederholt ungueltiger Auswahl')) return 'break';
    if (this.retryGroup(groupState, groupIndex, groupSize, snapshotFiles, 'Ungueltige Auswahl erhalten')) return 'continue';
    this.state.transitionMode('fallback');
    return 'continue';
  }

  handleCommitFailure(groupState: GroupState, groupIndex: number, groupSize: number, snapshotFiles: SnapshotFile[]): boolean {
    groupState.stallCycles += 1;
    if (this.stopStalledGroup(groupState, groupIndex, groupSize, snapshotFiles, 'wiederholten Commit-Fehlern')) return false;
    if (this.retryGroup(groupState, groupIndex, groupSize, snapshotFiles, 'Commit fehlgeschlagen')) return false;
    this.state.transitionMode('fallback');
    this.state.warnings.push(`Gruppe ${groupIndex + 1}: Wechsel auf Fallback nach Commit-Fehler.`);
    return false;
  }

  private stopStalledGroup(groupState: GroupState, groupIndex: number, groupSize: number, snapshotFiles: SnapshotFile[], reason: string): boolean {
    if (groupState.stallCycles < MAX_GROUP_STALL_CYCLES) return false;
    const message = `Gruppe ${groupIndex + 1} wurde nach ${groupState.stallCycles} ${reason} uebersprungen.`;
    this.state.warnings.push(message);
    this.state.emitProgress({
      phase: 'fallback',
      message,
      details: this.state.buildProgressDetails(snapshotFiles.length, {
        groupId: groupIndex + 1,
        groupSize,
        stallCycles: groupState.stallCycles,
      }),
    });
    return true;
  }

  private retryGroup(groupState: GroupState, groupIndex: number, groupSize: number, snapshotFiles: SnapshotFile[], reason: string): boolean {
    if (groupState.groupRetries >= MAX_RETRIES_PER_GROUP) return false;
    groupState.groupRetries += 1;
    this.state.retries += 1;
    this.state.transitionMode('retry');
    this.state.emitProgress({
      phase: 'retry',
      message: `${reason}, Retry ${groupState.groupRetries}/${MAX_RETRIES_PER_GROUP}`,
      details: this.state.buildProgressDetails(snapshotFiles.length, {
        groupId: groupIndex + 1,
        groupSize,
        retryCount: groupState.groupRetries,
      }),
    });
    return true;
  }

  private activateFallback(groupIndex: number, groupSize: number, snapshotFiles: SnapshotFile[], message: string): void {
    this.state.transitionMode('fallback');
    this.state.emitProgress({
      phase: 'fallback',
      message,
      details: this.state.buildProgressDetails(snapshotFiles.length, {
        groupId: groupIndex + 1,
        groupSize,
        step: 'deterministic-fallback',
      }),
    });
  }
}
