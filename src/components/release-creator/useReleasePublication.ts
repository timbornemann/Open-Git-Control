import { useLayoutEffect, useRef, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useGitStore, useUIStore, useAppStateReader } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { ConfirmDialogState } from '@/app/state/contracts';
import type { HostedRepository, HostingCapabilities, HostingCreateRelease, HostingRelease, HostingReleaseTarget } from '@/types/hostingDtos';
import type { ReleaseContext, ReleaseSubmissionPhase } from '@/types/releaseNotes';
import { validateReleaseInput } from '@/utils/releaseValidation';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { prepareReleasePublication } from './prepareReleasePublication';
import type { ReleaseSession } from './releaseDraftState';

type Params = {
  scope: string;
  repoPath: string;
  repository: HostedRepository | null;
  remoteName: string;
  endpointUrl?: string;
  capabilities: HostingCapabilities | null;
  session: ReleaseSession;
  context: ReleaseContext | null;
  update: (updater: (previous: ReleaseSession) => ReleaseSession) => void;
  refresh: () => Promise<void>;
};
const fingerprint = (session: ReleaseSession) => JSON.stringify([session.form, session.assets]);

export function useReleasePublication(params: Params) {
  const { tr } = useI18n();
  const readAppState = useAppStateReader();
  const setDialog = useUIStore((state) => state.setConfirmDialog);
  const refreshRepository = useGitStore((state) => state.triggerRefresh);
  const current = useRef(params);
  const lifecycle = useRef({ generation: 0 }).current;
  const busyRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const ownedDialog = useRef<ConfirmDialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<ReleaseSubmissionPhase>('idle');
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    current.current = params;
  }, [params]);
  useLayoutEffect(() => {
    lifecycle.generation++;
    busyRef.current = false;
    setBusy(false);
    setPhase('idle');
    setError('');
    return () => {
      lifecycle.generation++;
      controller.current?.abort();
      setDialog((previous) => (previous === ownedDialog.current ? null : previous));
    };
  }, [params.scope, setDialog, lifecycle]);

  const decision = <T>(dialog: Omit<ConfirmDialogState, 'onConfirm'>, primary: T, secondary: T | undefined, signal: AbortSignal): Promise<T> =>
    new Promise((resolve, reject) => {
      let answered = false;
      const finish = (value?: T) => {
        if (answered) return;
        answered = true;
        signal.removeEventListener('abort', abort);
        setDialog((previous) => (previous === state ? null : previous));
        ownedDialog.current = null;
        if (value === undefined) reject(new Error(tr('Veröffentlichung abgebrochen.', 'Publication cancelled.')));
        else resolve(value);
      };
      const abort = () => finish();
      const state: ConfirmDialogState = {
        ...dialog,
        onConfirm: async () => finish(primary),
        onSecondaryAction: secondary === undefined ? undefined : async () => finish(secondary),
        onCancel: abort,
      };
      ownedDialog.current = state;
      signal.addEventListener('abort', abort, { once: true });
      setDialog(state);
    });

  const run = async (uploadOnly = false) => {
    const snapshot = current.current;
    if (busyRef.current || !snapshot.repository || !snapshot.capabilities || (!uploadOnly && !snapshot.context)) return;
    const started = ++lifecycle.generation;
    const formFingerprint = fingerprint(snapshot.session);
    const authVersion = hostingClient.sessionVersion(snapshot.repository.ref.connectionId);
    const signal = new AbortController();
    controller.current = signal;
    const assertCurrent = () => {
      if (
        signal.signal.aborted ||
        started !== lifecycle.generation ||
        snapshot.scope !== current.current.scope ||
        fingerprint(current.current.session) !== formFingerprint ||
        (!uploadOnly && current.current.context?.targetOid !== snapshot.context?.targetOid) ||
        normalizeRepoPathKey(readAppState().repository.activeRepo || '') !== normalizeRepoPathKey(snapshot.repoPath) ||
        hostingClient.sessionVersion(snapshot.repository!.ref.connectionId) !== authVersion
      )
        throw new Error(
          tr(
            'Repository, Konto oder Release-Auftrag wurde geändert. Bitte erneut prüfen.',
            'The repository, account or release request changed. Inspect it again.',
          ),
        );
    };
    busyRef.current = true;
    setBusy(true);
    setError('');
    setPhase(uploadOnly ? 'uploading' : 'checking');
    const upload = async (release: HostingRelease) => {
      const failures: string[] = [];
      for (const filePath of snapshot.session.assets.filter((file) => !current.current.session.uploaded.includes(file))) {
        assertCurrent();
        try {
          await hostingClient.request('uploadAsset', { repository: snapshot.repository!.ref, repoPath: snapshot.repoPath, releaseId: release.id, filePath });
          assertCurrent();
          snapshot.update((previous) => ({ ...previous, uploaded: [...new Set([...previous.uploaded, filePath])] }));
        } catch (reason) {
          assertCurrent();
          failures.push(`${filePath.split(/[\\/]/).pop()}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
      if (failures.length) throw new Error(failures.join('\n'));
    };
    try {
      if (uploadOnly) {
        if (snapshot.session.created) await upload(snapshot.session.created);
        return;
      }
      if (snapshot.session.created) return;
      const form = snapshot.session.form;
      if (!validateReleaseInput({ tagName: form.tagName, releaseName: form.releaseName }).valid)
        throw new Error(tr('Bitte einen gültigen Tag und Release-Namen angeben.', 'Enter a valid tag and release name.'));
      if (snapshot.context!.existingTags.includes(form.tagName.trim()))
        throw new Error(tr('Dieser Tag existiert bereits am ausgewählten Ziel.', 'This tag already exists at the selected target.'));
      if (!form.body.trim()) {
        setPhase('awaiting-decision');
        await decision(
          {
            variant: 'confirm',
            irreversible: false,
            consequences: tr('Der Release wird ohne Beschreibung erstellt.', 'The release will be created without a description.'),
            title: tr('Release ohne Notes erstellen?', 'Create release without notes?'),
            message: tr('Dieser Release enthält keine Beschreibung.', 'This release has no description.'),
            confirmLabel: tr('Ohne Notes erstellen', 'Create without notes'),
            contextItems: [
              { label: 'Repository', value: snapshot.repository.fullName },
              { label: 'Tag', value: form.tagName },
            ],
          },
          true,
          undefined,
          signal.signal,
        );
      }
      assertCurrent();
      setPhase('checking');
      const input: HostingCreateRelease = {
        repository: snapshot.repository.ref,
        repoPath: snapshot.repoPath,
        remoteName: snapshot.remoteName,
        tagName: form.tagName.trim(),
        name: form.releaseName.trim(),
        body: form.body,
        target: form.targetCommitish.trim(),
        draft: snapshot.capabilities.draftRelease && form.draft,
        prerelease: snapshot.capabilities.prerelease && form.prerelease,
        mode: 'remote',
      };
      const choose = (inspection: HostingReleaseTarget) =>
        decision<'push' | 'remote'>(
          {
            variant: 'confirm',
            irreversible: true,
            title: tr('Ungepushte Commits vor dem Release', 'Unpushed commits before release'),
            message: tr(
              `${inspection.ahead} lokale Commits fehlen am ausgewählten Hosting-Ziel.`,
              `${inspection.ahead} local commits are missing from the selected hosting target.`,
            ),
            contextItems: [
              { label: 'Repository', value: snapshot.repository!.fullName },
              { label: tr('Zielbranch', 'Target branch'), value: inspection.targetBranch || input.target },
              { label: tr('Lokal', 'Local'), value: inspection.localSha || '—' },
              { label: 'Remote', value: inspection.remoteSha || '—' },
              ...(inspection.pushBlockedReason ? [{ label: tr('Push nicht möglich', 'Push unavailable'), value: inspection.pushBlockedReason }] : []),
            ],
            consequences: tr(
              'Ohne Push fehlen die lokalen Commits im Release. Die Notes bleiben unverändert.',
              'Without pushing, the release excludes local commits. Notes remain unchanged.',
            ),
            confirmLabel: inspection.canPush
              ? tr('Pushen und Release erstellen', 'Push and create release')
              : tr('Ohne Push erstellen', 'Create without pushing'),
            secondaryActionLabel: inspection.canPush && inspection.canReleaseRemote ? tr('Ohne Push erstellen', 'Create without pushing') : undefined,
          },
          inspection.canPush ? 'push' : 'remote',
          inspection.canPush && inspection.canReleaseRemote ? 'remote' : undefined,
          signal.signal,
        );
      const inspection = await prepareReleasePublication({
        input,
        targetOid: snapshot.context!.targetOid,
        endpointUrl: snapshot.endpointUrl,
        signal: signal.signal,
        assertCurrent,
        setPhase,
        choose,
        tr,
      });
      assertCurrent();
      setPhase('creating');
      const release = await hostingClient.request('createRelease', { ...input, inspectionId: inspection.inspectionId });
      assertCurrent();
      snapshot.update((previous) => ({ ...previous, created: release, uploaded: [] }));
      refreshRepository();
      if (snapshot.capabilities.releaseAssets) {
        setPhase('uploading');
        await upload(release);
      }
      await snapshot.refresh();
    } catch (reason) {
      if (started === lifecycle.generation && !signal.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (started === lifecycle.generation) {
        busyRef.current = false;
        setBusy(false);
        setPhase('idle');
        controller.current = null;
      }
    }
  };
  const addAssets = async () => {
    const snapshot = current.current;
    const started = lifecycle.generation;
    const files = await appClient.selectFiles();
    if (files?.length && started === lifecycle.generation && snapshot.scope === current.current.scope)
      snapshot.update((previous) => ({ ...previous, assets: [...new Set([...previous.assets, ...files])] }));
  };
  return {
    busy,
    phase,
    error,
    publish: () => run(),
    retryAssets: () => run(true),
    addAssets,
    cancel: () => {
      controller.current?.abort();
      setError('');
    },
  };
}
