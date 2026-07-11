import type { GitService } from '../GitService';
import { parseStatusPorcelain } from './gitStatusSnapshot';
import type { AiAutoCommitResult, SnapshotFile } from './aiServiceTypes';
import type { AiAutoCommitRunState } from './AiAutoCommitRunState';

export const buildAiAutoCommitRunResult = async (
  gitService: GitService,
  repoPath: string,
  snapshotFiles: SnapshotFile[],
  groups: SnapshotFile[][],
  state: AiAutoCommitRunState,
): Promise<AiAutoCommitResult> => {
  const gitCapabilities = gitService as GitService & {
    getStatusPorcelainZAtPath?: (path: string) => Promise<string>;
    getStatusPorcelainAtPath?: (path: string) => Promise<string>;
    getStatusPorcelain?: () => Promise<string>;
  };
  const finalStatus =
    typeof gitCapabilities.getStatusPorcelainZAtPath === 'function'
      ? await gitCapabilities.getStatusPorcelainZAtPath(repoPath)
      : typeof gitCapabilities.getStatusPorcelainAtPath === 'function'
        ? await gitCapabilities.getStatusPorcelainAtPath(repoPath)
        : (await gitCapabilities.getStatusPorcelain?.()) || '';
  const remainingEntries = parseStatusPorcelain(finalStatus);
  const remainingFiles = remainingEntries.length;
  const summary = state.commits.length === 0 ? 'Keine Commits erstellt.' : `KI Auto-Commit abgeschlossen: ${state.commits.length} Commit(s) erstellt.`;

  state.emitProgress({
    phase: 'done',
    message: summary,
    progress: 100,
    details: state.buildProgressDetails(snapshotFiles.length, {
      remainingFiles,
      processedFiles: state.processedFiles,
      lastCommit: state.commits.length > 0 ? `${state.commits[state.commits.length - 1].hash} ${state.commits[state.commits.length - 1].subject}` : null,
    }),
  });

  return {
    commits: state.commits,
    summary,
    turns: state.modelTurns,
    modeTransitions: state.modeTransitions,
    processedFiles: state.processedFiles,
    remainingFiles,
    commitPlanStats: {
      groupCount: groups.length,
      retries: state.retries,
      fallbackCommits: state.fallbackCommits,
      totalCommits: state.commits.length,
      totalFilesProcessed: state.processedFiles,
    },
    warnings: state.warnings,
    diagnostics: state.diagnostics,
  };
};
