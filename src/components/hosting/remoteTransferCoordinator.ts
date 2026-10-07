import { transferClient } from '@/services/hostingClient';
import { gitClient } from '@/services/gitClient';
import { createRemoteSelectionSnapshot, rememberRemoteTransferSelection, resolveRemoteTransferSelection } from '@/utils/remoteTransferSelection';
import type { RemoteSelectionMode, RemoteTransferAction } from '@/types/remoteTransfers';
import type { RemoteTransferDialog } from './remoteTransferDialogState';
import { initialRemoteTransferState, useRemoteTransferState, type RemoteTransferSelection, type RemoteTransferState } from './remoteTransferState';
import { syncRemoteTags } from './syncRemoteTags';

export interface RemoteTransferContext {
  repoPath: string | null;
  branch: string;
  accounts: string;
  scanEnabled: boolean;
}
export interface RemoteTransferEnvironment {
  getContext: () => RemoteTransferContext;
  toast: (message: string, error: boolean) => void;
  refresh: () => void;
  openConfiguration: (repoPath: string) => void;
  tr: (de: string, en: string) => string;
}
const contextKey = ({ repoPath, branch, accounts }: RemoteTransferContext) => JSON.stringify([repoPath, branch, accounts]);
const unresolved = (status: string) => !['success', 'up-to-date'].includes(status);

/** A mounted host owns this coordinator; closing an editor never starts a transfer. */
export class RemoteTransferCoordinator {
  private generation = 0;
  private context = '';
  private endpointContext = '';
  private cancelled = false;
  constructor(private readonly environment: RemoteTransferEnvironment) {}
  private get state() {
    return useRemoteTransferState.getState();
  }
  private set(update: Partial<RemoteTransferState>) {
    useRemoteTransferState.setState(update);
  }
  private assertContext(generation: number) {
    if (generation !== this.generation || this.context !== contextKey(this.environment.getContext())) throw new Error('Transfer context changed.');
    if (this.cancelled) throw new Error(this.environment.tr('Übertragung abgebrochen.', 'Transfer cancelled.'));
  }
  private async scoped<T>(operation: () => Promise<T>, generation = this.generation) {
    this.assertContext(generation);
    const result = await operation();
    this.assertContext(generation);
    return result;
  }
  private async run(operation: () => Promise<void>) {
    const generation = this.generation;
    try {
      await operation();
    } catch (reason) {
      if (generation !== this.generation || this.context !== contextKey(this.environment.getContext())) return;
      const error = this.cancelled
        ? this.environment.tr('Übertragung abgebrochen.', 'Transfer cancelled.')
        : reason instanceof Error
          ? reason.message
          : String(reason);
      this.set({ phase: this.cancelled && !this.state.batch ? 'idle' : 'result', busy: false, cancelling: false, resultVisible: false, error });
      this.environment.toast(error, !this.cancelled);
    }
  }
  async start(intent: RemoteTransferDialog) {
    if (intent.mode === 'remotes') {
      this.environment.openConfiguration(intent.repoPath);
      return;
    }
    if (this.state.busy) return;
    this.generation++;
    this.context = contextKey(this.environment.getContext());
    this.cancelled = false;
    this.set({ ...initialRemoteTransferState(), phase: 'preparing', busy: true, intent });
    await this.run(async () => {
      if (intent.repoPath !== this.environment.getContext().repoPath)
        throw new Error(this.environment.tr('Repository wurde gewechselt.', 'Repository changed.'));
      const [snapshot, preferences] = await this.scoped(() =>
        Promise.all([
          transferClient.request('getRemotes', { repoPath: intent.repoPath }),
          transferClient.request('getPreferences', { repoPath: intent.repoPath }),
        ]),
      );
      if (intent.expectedBranch && snapshot.branch !== intent.expectedBranch)
        throw new Error(this.environment.tr('Zuerst den gewünschten Quellbranch auschecken.', 'Check out the requested source branch first.'));
      const resolved = resolveRemoteTransferSelection(intent.mode as RemoteTransferAction, snapshot, preferences);
      const selectedRemoteNames = intent.constrainedRemoteNames ?? resolved.selectedRemoteNames;
      if (intent.constrainedRemoteNames?.some((name) => !snapshot.remotes.some((remote) => remote.name === name)))
        throw new Error(this.environment.tr('Das ausdrücklich gewählte Remote ist nicht mehr vorhanden.', 'The explicitly selected remote no longer exists.'));
      const selection = {
        selectedRemoteNames,
        branch: intent.destinationBranch ?? resolved.branch,
        targetBranches: intent.constrainedRemoteNames
          ? {}
          : Object.fromEntries(Object.entries(resolved.targetBranches).filter(([, branch]) => branch !== resolved.branch)),
        tagNames: intent.tagNames ?? [],
      };
      this.endpointContext = selectedRemoteNames.length
        ? JSON.stringify(createRemoteSelectionSnapshot(intent.mode as RemoteTransferAction, snapshot, preferences, selectedRemoteNames))
        : '';
      this.set({ snapshot, preferences, selection, reason: resolved.reason, busy: false });
      if (resolved.state === 'configure') {
        this.set({ phase: 'selection' });
        return;
      }
      if (intent.selectTags || (!intent.constrainedRemoteNames && resolved.state === 'choose')) {
        this.set({ phase: 'selection' });
        return;
      }
      await this.perform(selection);
    });
  }
  async choose(selection: RemoteTransferSelection, mode: RemoteSelectionMode) {
    if (this.state.busy || !this.state.intent || !this.state.snapshot) return;
    this.set({ busy: true, error: '', selection });
    await this.run(async () => {
      const { intent, snapshot, preferences } = this.state;
      if (!intent || !snapshot) return;
      if (!selection.selectedRemoteNames.length || (intent.mode !== 'fetch' && !selection.branch))
        throw new Error(this.environment.tr('Quelle beziehungsweise Ziele und Branch auswählen.', 'Select a source or targets and a branch.'));
      if (intent.selectTags && !selection.tagNames.length) throw new Error(this.environment.tr('Tags ausdrücklich auswählen.', 'Explicitly select tags.'));
      this.endpointContext = JSON.stringify(
        createRemoteSelectionSnapshot(intent.mode as RemoteTransferAction, snapshot, preferences, selection.selectedRemoteNames),
      );
      await this.verifyTargets();
      // Selection persistence changes the main-process plan fingerprint, so always save first.
      const next = intent.constrainedRemoteNames
        ? preferences
        : await this.scoped(() =>
            transferClient.request('setPreferences', {
              repoPath: intent.repoPath,
              preferences: {
                ...rememberRemoteTransferSelection(intent.mode as RemoteTransferAction, snapshot, preferences, selection, mode),
                ...(intent.mode === 'push' && selection.profileId !== undefined ? { activeProfileId: selection.profileId || undefined } : {}),
              },
            }),
          );
      this.set({ preferences: next });
      this.endpointContext = JSON.stringify(createRemoteSelectionSnapshot(intent.mode as RemoteTransferAction, snapshot, next, selection.selectedRemoteNames));
      await this.perform(selection);
    });
  }
  private async verifyTargets() {
    const { intent, snapshot, selection } = this.state;
    if (!intent || !snapshot) throw new Error('No transfer context.');
    const [fresh, preferences] = await this.scoped(() =>
      Promise.all([
        transferClient.request('getRemotes', { repoPath: intent.repoPath }),
        transferClient.request('getPreferences', { repoPath: intent.repoPath }),
      ]),
    );
    const endpoints = JSON.stringify(createRemoteSelectionSnapshot(intent.mode as RemoteTransferAction, fresh, preferences, selection.selectedRemoteNames));
    if (fresh.branch !== snapshot.branch || endpoints !== this.endpointContext)
      throw new Error(
        this.environment.tr(
          'Branch, Remote oder Kontozuordnung wurde geändert. Auswahl erneut öffnen.',
          'The branch, remote, or account binding changed. Open the selection again.',
        ),
      );
  }
  private async perform(selection: RemoteTransferSelection) {
    const intent = this.state.intent;
    if (!intent) return;
    this.set({ phase: 'running', busy: true, selection, error: '', failedPull: null });
    await this.verifyTargets();
    if (intent.mode === 'push') {
      await this.preparePush();
      return;
    }
    const remote = selection.selectedRemoteNames[0];
    this.set({ transferStage: 'transferring' });
    if (intent.mode === 'fetch') {
      await this.scoped(() => transferClient.request('fetch', { repoPath: intent.repoPath, remote }));
      await this.verifyTargets();
      await syncRemoteTags(intent.repoPath, remote, (operation) => this.scoped(operation));
      this.finish(this.environment.tr(`Fetch von ${remote} abgeschlossen.`, `Fetch from ${remote} completed.`));
      return;
    }
    const input = { repoPath: intent.repoPath, remote, branch: selection.branch, mode: intent.pullMode ?? 'default' };
    const generation = this.generation;
    try {
      await this.scoped(() => transferClient.request('pull', input));
    } catch (error) {
      if (generation === this.generation && this.context === contextKey(this.environment.getContext())) {
        if (!this.cancelled) this.set({ failedPull: input });
        this.environment.refresh();
      }
      throw error;
    }
    this.finish(this.environment.tr(`Pull von ${remote}/${input.branch} abgeschlossen.`, `Pull from ${remote}/${input.branch} completed.`));
  }
  private async scanPlan() {
    const { intent, plan } = this.state;
    if (!intent || !plan || !this.environment.getContext().scanEnabled) return;
    const progressId = crypto.randomUUID();
    this.set({ transferStage: 'scanning', scanProgressId: progressId });
    const result = await this.scoped(() => gitClient.scanPushSecrets({ repoPath: intent.repoPath, pushArgs: plan.secretScanArgs, progressId }));
    if (!result.success) throw new Error(result.error);
    this.set({ scan: result.data });
  }
  private async preparePush() {
    const { intent, selection } = this.state;
    if (!intent) return;
    const plan = await this.scoped(() =>
      transferClient.request('planPush', {
        repoPath: intent.repoPath,
        remoteNames: selection.selectedRemoteNames,
        ...(intent.sourceBranch ? { sourceBranch: intent.sourceBranch } : {}),
        ...(intent.constrainedTargetUrls ? { targetUrls: intent.constrainedTargetUrls } : {}),
        destinationBranch: selection.branch,
        targetBranches: Object.fromEntries(
          Object.entries(selection.targetBranches).filter(([name, branch]) => selection.selectedRemoteNames.includes(name) && branch),
        ),
        tagNames: selection.tagNames,
        force: Boolean(intent.force),
      }),
    );
    if (intent.expectedSourceOid && plan.sourceOid !== intent.expectedSourceOid)
      throw new Error(
        this.environment.tr('Der Quell-Commit wurde geändert. Veröffentlichung erneut prüfen.', 'The source commit changed. Inspect the publication again.'),
      );
    this.set({ plan, scan: null });
    await this.scanPlan();
    await this.executeOrReview();
  }
  private async executeOrReview() {
    const { intent, scan } = this.state;
    if (intent?.force || scan?.findings.length || scan?.historyScanIncomplete) {
      this.set({ phase: 'review', busy: false });
      return;
    }
    await this.execute();
  }
  async approve() {
    if (this.state.busy || this.state.scan?.historyScanIncomplete) return;
    this.set({ phase: 'running', busy: true, transferStage: 'preparing', scanProgressId: null });
    await this.run(async () => {
      const { intent, plan, scan } = this.state;
      if (!intent || !plan) return;
      await this.verifyTargets();
      if (scan?.findings.length) {
        const approval = await this.scoped(() => gitClient.approveSecretScanPush(plan.secretScanArgs, intent.repoPath));
        if (!approval.success) throw new Error(this.environment.tr('Freigabe abgelaufen. Erneut prüfen.', 'Approval expired. Check again.'));
      }
      await this.execute();
    });
  }
  async retryScan() {
    if (this.state.busy || !this.state.intent || !this.state.plan) return;
    this.cancelled = false;
    this.set({ phase: 'preparing', busy: true, transferStage: 'preparing', scanProgressId: null, scan: null, error: '' });
    await this.run(async () => {
      await this.verifyTargets();
      if (this.state.retrying) {
        await this.scanPlan();
        await this.executeOrReview();
      } else {
        await this.preparePush();
      }
    });
  }
  private async execute() {
    await this.verifyTargets();
    const { intent, plan, batch, retrying } = this.state;
    if (!intent || !plan) return;
    const generation = this.generation;
    this.set({ transferStage: 'transferring' });
    const next =
      retrying && batch
        ? await transferClient.request('retryPush', {
            repoPath: intent.repoPath,
            batchId: batch.id,
            targetIds: batch.targets.filter((target) => !target.grouped && unresolved(target.status)).map((target) => target.id),
          })
        : await transferClient.request('executePush', { repoPath: intent.repoPath, planId: plan.id });
    // A cancelled push can still return successful endpoints; keep its full result visible.
    if (generation !== this.generation || this.context !== contextKey(this.environment.getContext())) return;
    this.set({ batch: next, busy: false, cancelling: false, resultVisible: false, phase: next.state === 'success' ? 'idle' : 'result' });
    this.environment.refresh();
    const message =
      next.state === 'success'
        ? this.environment.tr('Push abgeschlossen.', 'Push completed.')
        : next.state === 'cancelled'
          ? this.environment.tr('Push abgebrochen.', 'Push cancelled.')
          : next.state === 'partial'
            ? this.environment.tr(
                'Push teilweise abgeschlossen. Einige Ziele wurden nicht übertragen.',
                'Push partially completed. Some targets were not published.',
              )
            : this.environment.tr('Push fehlgeschlagen.', 'Push failed.');
    this.environment.toast(message, next.state === 'failed' || next.state === 'partial');
  }
  async retryPush() {
    if (this.state.busy || !this.state.batch || !this.state.plan) return;
    this.cancelled = false;
    this.set({ busy: true, phase: 'preparing', transferStage: 'preparing', scanProgressId: null, scan: null, retrying: true, error: '' });
    await this.run(async () => {
      await this.verifyTargets();
      await this.scanPlan();
      await this.executeOrReview();
    });
  }
  async retryPull() {
    if (this.state.busy || !this.state.failedPull) return;
    this.cancelled = false;
    const input = this.state.failedPull;
    this.set({ busy: true, phase: 'running', transferStage: 'transferring', error: '' });
    await this.run(async () => {
      await this.verifyTargets();
      await this.scoped(() => transferClient.request('pull', input));
      this.finish(this.environment.tr(`Pull von ${input.remote}/${input.branch} abgeschlossen.`, `Pull from ${input.remote}/${input.branch} completed.`));
    });
  }
  private finish(message: string) {
    this.set({ phase: 'idle', busy: false, cancelling: false, failedPull: null, error: '' });
    this.environment.refresh();
    this.environment.toast(message, false);
  }
  cancel() {
    if (!this.state.busy) {
      this.close();
      return;
    }
    if (this.state.cancelling) return;
    const repoPath = this.state.intent?.repoPath;
    this.cancelled = true;
    this.set({ cancelling: true });
    if (repoPath) {
      void transferClient.request('cancel', { repoPath }).catch(() => {});
      void gitClient.cancelSecretScan(repoPath);
    }
  }
  invalidate() {
    this.cancel();
    this.generation++;
    this.set(initialRemoteTransferState());
  }
  close() {
    if (this.state.busy) return;
    if (this.state.phase === 'result') {
      this.set({ resultVisible: false });
      return;
    }
    this.generation++;
    this.set(initialRemoteTransferState());
  }
  showResult() {
    if (!this.state.busy && (this.state.batch || this.state.failedPull || this.state.error)) this.set({ phase: 'result', resultVisible: true });
  }
}
