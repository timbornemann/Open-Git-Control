import { app } from 'electron';
import type { GitService } from '../GitService';
import type { GitHubService } from '../GitHubService';
import type { AppSettings } from '../settings';
import { sanitizeRemoteUrl } from './parsing';
import type { UpdaterStatusPayload } from './updaterManager';
import { repositoryPathKey } from './activeRepositoryAuthorization';

type BuildDiagnosticsReportDependencies = {
  gitService: GitService;
  githubService: GitHubService;
  readSettingsWithMigration: () => AppSettings;
  getUpdaterStatus: () => UpdaterStatusPayload;
  getCommitStatsDiagnostics?: () => Array<{
    durationMs: number;
    cacheHit: boolean;
    aborted: boolean;
    timestamp: number;
  }>;
};

export function buildDiagnosticsReportFactory(deps: BuildDiagnosticsReportDependencies) {
  const { gitService, githubService, readSettingsWithMigration, getUpdaterStatus, getCommitStatsDiagnostics } = deps;

  return async function buildDiagnosticsReport(): Promise<{
    generatedAt: string;
    appVersion: string;
    platform: string;
    activeRepo: string | null;
    report: string;
  }> {
    const generatedAt = new Date().toISOString();
    const settings = readSettingsWithMigration();
    const activeRepo = gitService.getRepoPath();
    const updaterStatus = getUpdaterStatus();

    const lines: string[] = [];
    lines.push('Open-Git-Control Diagnostics');
    lines.push(`Generated: ${generatedAt}`);
    lines.push(`Version: ${app.getVersion()}`);
    lines.push(`Platform: ${process.platform} ${process.arch}`);
    lines.push(`Node: ${process.version}`);
    lines.push(`Electron: ${process.versions.electron || ''}`);
    lines.push(`Active repo: ${activeRepo || '(none)'}`);
    lines.push('');
    lines.push('[Settings]');
    lines.push(`language=${settings.language}`);
    lines.push(`theme=${settings.theme}`);
    lines.push(`autoFetchIntervalMs=${settings.autoFetchIntervalMs}`);
    lines.push(`confirmDangerousOps=${settings.confirmDangerousOps}`);
    lines.push(`showSecondaryHistory=${settings.showSecondaryHistory}`);
    lines.push(`secretScanBeforeCommitEnabled=${settings.secretScanBeforeCommitEnabled}`);
    lines.push(`secretScanBeforePushEnabled=${settings.secretScanBeforePushEnabled}`);
    lines.push(`secretScanStrictness=${settings.secretScanStrictness}`);
    lines.push(
      `secretScanAllowlistEntries=${settings.secretScanAllowlist.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#')).length}`,
    );
    lines.push(`aiProvider=${settings.aiProvider}`);
    lines.push(`githubHost=${settings.githubHost}`);
    lines.push(`oauthConfigured=${githubService.isDeviceFlowConfigured(settings.githubOauthClientId, settings.githubHost)}`);
    lines.push(`hasGeminiApiKey=${settings.hasGeminiApiKey}`);

    lines.push('');
    lines.push('[Updater]');
    lines.push(`state=${updaterStatus.state}`);
    lines.push(`availableVersion=${updaterStatus.availableVersion || ''}`);
    lines.push(`downloaded=${updaterStatus.downloaded}`);
    lines.push(`lastError=${updaterStatus.error || ''}`);

    const activeRepoKey = activeRepo ? repositoryPathKey(activeRepo) : null;
    const gitDiagnostics = activeRepoKey
      ? gitService
          .getSchedulerDiagnostics()
          .filter((entry) => repositoryPathKey(entry.repoPath) === activeRepoKey)
          .slice(-20)
      : [];
    lines.push('');
    lines.push('[Git Scheduler]');
    lines.push(`entries=${gitDiagnostics.length}`);
    for (const entry of gitDiagnostics) {
      lines.push(
        `${new Date(entry.timestamp).toISOString()} repoPath=${JSON.stringify(entry.repoPath)} kind=${entry.kind} command=${entry.command} durationMs=${entry.durationMs} resultBytes=${entry.resultBytes} aborted=${entry.aborted}`,
      );
    }

    const statsDiagnostics = getCommitStatsDiagnostics?.().slice(-20) || [];
    lines.push('');
    lines.push('[Commit Stats Cache]');
    lines.push(`entries=${statsDiagnostics.length}`);
    lines.push(`cacheHits=${statsDiagnostics.filter((entry) => entry.cacheHit).length}`);
    lines.push(`aborted=${statsDiagnostics.filter((entry) => entry.aborted).length}`);

    if (activeRepo) {
      lines.push('');
      lines.push('[Git]');
      try {
        const status = await gitService.runCommandAtPath(activeRepo, ['status', '-sb']);
        lines.push('status -sb:');
        lines.push(status || '(empty)');
      } catch (error: any) {
        lines.push(`status -sb failed: ${error?.message || String(error)}`);
      }

      try {
        const remotes = await gitService.runCommandAtPath(activeRepo, ['remote', '-v']);
        lines.push('');
        lines.push('remote -v:');
        lines.push(
          remotes
            .split('\n')
            .map((line) => sanitizeRemoteUrl(line))
            .join('\n') || '(empty)',
        );
      } catch (error: any) {
        lines.push(`remote -v failed: ${error?.message || String(error)}`);
      }
    }

    return {
      generatedAt,
      appVersion: app.getVersion(),
      platform: `${process.platform}-${process.arch}`,
      activeRepo,
      report: lines.join('\n'),
    };
  };
}
