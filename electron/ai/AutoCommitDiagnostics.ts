import { repositoryPathKey } from '../main-process/activeRepositoryAuthorization';
import type { AutoCommitMetrics } from './AutoCommitPlanTypes';

type RunDiagnostic = AutoCommitMetrics & { repoKey: string; timestamp: number; commits: number; fallback: boolean };
const recent: RunDiagnostic[] = [];
export function recordAutoCommitDiagnostic(repoPath: string, metrics: AutoCommitMetrics, commits: number, fallback: boolean): void {
  recent.push({ ...metrics, repoKey: repositoryPathKey(repoPath), timestamp: Date.now(), commits, fallback });
  if (recent.length > 20) recent.shift();
}
export function getAutoCommitDiagnostics(repoPath: string | null): Omit<RunDiagnostic, 'repoKey'>[] {
  return recent.filter((item) => repoPath && item.repoKey === repositoryPathKey(repoPath)).map(({ repoKey: _repoKey, ...item }) => item);
}
