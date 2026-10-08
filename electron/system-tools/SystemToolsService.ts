import { randomUUID } from 'node:crypto';
import {
  SYSTEM_TOOL_IDS,
  isSystemToolId,
  systemToolDownloadUrl,
  systemToolInstructionsUrl,
  type InstallSystemToolRequest,
  type SystemToolInstallEvent,
  type SystemToolsStatus,
  type SystemToolStatus,
} from '../../src/shared/ipc/systemTools';
import { ToolExecutableResolver } from './ToolExecutableResolver';
import { ToolInstallPlans } from './ToolInstallPlans';
import { executeToolInstall, installationCancelled, requiresAgreements, runInstaller, type InstallerRunner } from './ToolInstaller';
import { manageToolRuntime, updateToolRuntime } from './toolRuntime';

export class SystemToolsService {
  private status: SystemToolsStatus;
  private checking: Promise<SystemToolsStatus> | null = null;
  private installing = false;
  private active = false;
  private agreements = new Map<string, string>();
  private statusListeners = new Set<(status: SystemToolsStatus) => void>();
  private installListeners = new Set<(event: SystemToolInstallEvent) => void>();
  constructor(
    private readonly resolver = new ToolExecutableResolver(),
    private readonly plans = new ToolInstallPlans(resolver),
    private readonly run: InstallerRunner = runInstaller,
  ) {
    const platform = resolver.platform;
    this.status = {
      platform: platform === 'win32' || platform === 'linux' || platform === 'darwin' ? platform : 'other',
      checkedAt: null,
      installation: null,
      tools: SYSTEM_TOOL_IDS.map((id) => ({
        id,
        required: id === 'git',
        state: 'checking',
        downloadUrl: systemToolDownloadUrl(id, platform),
        instructionsUrl: systemToolInstructionsUrl(id, platform),
      })),
    };
  }
  snapshot(): SystemToolsStatus {
    return structuredClone(this.status);
  }
  onStatus(listener: (status: SystemToolsStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
  onInstall(listener: (event: SystemToolInstallEvent) => void): () => void {
    this.installListeners.add(listener);
    return () => {
      this.installListeners.delete(listener);
    };
  }
  start(): Promise<SystemToolsStatus> {
    this.active = true;
    manageToolRuntime();
    this.status.tools.forEach(updateToolRuntime);
    return this.recheck();
  }
  private publish() {
    const snapshot = this.snapshot();
    this.statusListeners.forEach((listener) => listener(snapshot));
  }
  private setTool(tool: SystemToolStatus) {
    this.status.tools = this.status.tools.map((entry) => (entry.id === tool.id ? { ...tool, installation: entry.installation } : entry));
    if (this.active) updateToolRuntime(tool);
    this.publish();
  }
  recheck(): Promise<SystemToolsStatus> {
    if (this.checking) return this.checking;
    this.checking = this.check().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }
  private async check(): Promise<SystemToolsStatus> {
    await this.resolver.refreshLocations();
    const git = await this.resolver.inspect('git');
    this.setTool(git);
    await Promise.all(['git-lfs', 'github-cli'].map(async (id) => this.setTool(await this.resolver.inspect(id as 'git-lfs' | 'github-cli', git))));
    this.status.checkedAt = Date.now();
    this.publish();
    // Installation discovery is independent of repository restoration and initial Git feedback.
    await Promise.all(
      SYSTEM_TOOL_IDS.map(async (id) => {
        const install = await this.plans.resolve(id);
        this.status.tools = this.status.tools.map((tool) => (tool.id === id ? { ...tool, installation: install?.plan } : tool));
      }),
    );
    this.publish();
    return this.snapshot();
  }
  private event(event: SystemToolInstallEvent) {
    this.status.installation = event;
    this.installListeners.forEach((listener) => listener(event));
    this.publish();
  }
  async install(request: InstallSystemToolRequest): Promise<SystemToolInstallEvent> {
    if (!request || !isSystemToolId(request.toolId) || (request.acceptAgreements !== undefined && typeof request.acceptAgreements !== 'boolean'))
      throw new Error('Invalid system tool request.');
    if (this.installing) throw new Error('Another tool installation is already running.');
    this.installing = true;
    const base = { operationId: randomUUID(), toolId: request.toolId };
    try {
      this.event({ ...base, phase: 'preparing' });
      const install = await this.plans.resolve(request.toolId);
      if (!install?.plan.available || !install.executable)
        throw new Error(install?.plan.reason || 'No supported package manager is available. Use the official installation instructions.');
      const signature = JSON.stringify([install.executable, install.args]);
      if (request.acceptAgreements && this.agreements.get(request.toolId) !== signature)
        throw new Error('Review the current package agreements before accepting them.');
      this.event({ ...base, phase: 'installing' });
      const result = await executeToolInstall(install, request.acceptAgreements === true, this.run);
      if (requiresAgreements(result)) {
        if (!result.output.trim()) throw new Error('Package agreements could not be read. Use the official installation instructions.');
        this.agreements.set(request.toolId, signature);
        const event: SystemToolInstallEvent = {
          ...base,
          phase: 'agreements-required',
          agreements: result.output,
        };
        this.event(event);
        return event;
      }
      this.agreements.delete(request.toolId);
      if (result.exitCode !== 0) {
        const event: SystemToolInstallEvent = {
          ...base,
          phase: installationCancelled(result, install.plan.method) ? 'cancelled' : 'failed',
          detail: result.output || `The package manager exited with code ${result.exitCode}.`,
        };
        this.event(event);
        return event;
      }
      this.event({ ...base, phase: 'verifying' });
      if (this.checking) await this.checking;
      await this.recheck();
      const tool = this.status.tools.find((entry) => entry.id === request.toolId);
      const event: SystemToolInstallEvent = {
        ...base,
        phase: tool?.state === 'available' ? 'done' : 'failed',
        ...(tool?.state === 'available'
          ? {}
          : { detail: 'The installer finished, but the tool is not usable yet. Recheck or restart the app after completing the installation.' }),
      };
      this.event(event);
      return event;
    } catch (error) {
      const event: SystemToolInstallEvent = { ...base, phase: 'failed', detail: error instanceof Error ? error.message : String(error) };
      this.event(event);
      return event;
    } finally {
      this.installing = false;
    }
  }
}
export const systemToolsService = new SystemToolsService();
