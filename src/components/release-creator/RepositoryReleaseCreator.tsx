import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useGitStore, useSettingsStore, useUIStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { HostedRepositoryRef } from '@/types/hostingDtos';
import { providerLabels, useHostingState } from '@/components/hosting/hostingState';
import { ReleaseCreator } from './ReleaseCreator';
import { releaseDraftKey, newReleaseSession, useReleaseDraftState, type ReleaseSession } from './releaseDraftState';
import { useReleaseTarget } from './useReleaseTarget';
import { useReleaseContext } from './useReleaseContext';
import { useReleaseNotesGeneration } from './useReleaseNotesGeneration';
import { useReleasePublication } from './useReleasePublication';
import { useReleaseFeedback } from './useReleaseFeedback';
import { hostingClient } from '@/services/hostingClient';
import { suggestNextReleaseTag } from '@/utils/releaseTagSuggestion';
import '@/styles/release-creator.css';
import './repositoryReleaseCreator.css';

type Props = { repoPath: string | null; requestedTarget: HostedRepositoryRef | null };

export function RepositoryReleaseCreator({ repoPath, requestedTarget }: Props) {
  const target = useReleaseTarget(repoPath, requestedTarget);
  const key = releaseDraftKey(repoPath || '', target.endpoint?.repository || requestedTarget, target.endpoint?.remoteName || '');
  return <ReleaseSessionView key={key} draftKey={key} repoPath={repoPath || ''} target={target} />;
}

function ReleaseSessionView({ draftKey, repoPath, target }: { draftKey: string; repoPath: string; target: ReturnType<typeof useReleaseTarget> }) {
  const { tr } = useI18n();
  const branch = useGitStore((state) => state.currentBranch);
  const refreshTrigger = useGitStore((state) => state.refreshTrigger);
  const appLanguage = useSettingsStore((state) => state.settings.language);
  const onOpenRemoteConfig = useUIStore((state) => state.onOpenRemoteConfig);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const [initial] = useState(() => newReleaseSession(branch, appLanguage));
  const session = useReleaseDraftState((state) => state.sessions[draftKey]) || initial;
  const update = useCallback(
    (updater: (previous: ReleaseSession) => ReleaseSession) => {
      useReleaseDraftState.getState().update(draftKey, (previous) => updater(previous || initial));
    },
    [draftKey, initial],
  );
  useLayoutEffect(() => {
    useReleaseDraftState.getState().update(draftKey, (previous) => previous || initial);
  }, [draftKey, initial]);
  useLayoutEffect(() => {
    if (!session.form.targetCommitish && branch) update((previous) => ({ ...previous, form: { ...previous.form, targetCommitish: branch } }));
  }, [branch, session.form.targetCommitish, update]);
  const scope = JSON.stringify([draftKey, target.scope, branch, hostingClient.sessionVersion(target.endpoint?.repository?.connectionId)]);
  const input = useMemo(
    () =>
      target.repository && target.endpoint
        ? {
            repoPath,
            repository: target.repository.ref,
            remoteName: target.endpoint.remoteName,
            target: session.form.targetCommitish.trim(),
            fromRef: session.form.fromRef?.trim() || undefined,
          }
        : null,
    [repoPath, target.repository, target.endpoint, session.form.targetCommitish, session.form.fromRef],
  );
  const history = useReleaseContext(input, scope, refreshTrigger);
  useLayoutEffect(() => {
    if (!history.context || session.suggestionApplied) return;
    const tagName = suggestNextReleaseTag(history.context.existingTags, session.versionBump);
    update((previous) => ({
      ...previous,
      suggestionApplied: true,
      form: previous.form.tagName
        ? previous.form
        : {
            ...previous.form,
            tagName,
            releaseName: previous.form.releaseName || `Release ${tagName}`,
          },
    }));
  }, [history.context, session.suggestionApplied, session.versionBump, update]);
  const notes = useReleaseNotesGeneration(scope, session, history.context, target.endpoint?.repository?.connectionId, update, repoPath);
  const publication = useReleasePublication({
    scope,
    repoPath,
    repository: target.repository,
    remoteName: target.endpoint?.remoteName || '',
    endpointUrl: target.endpoint?.url,
    capabilities: target.capabilities,
    session,
    context: history.context,
    update,
    refresh: history.refresh,
  });
  useReleaseFeedback({
    targetLoading: target.loading,
    missingTarget: target.missingTarget,
    targetError: target.error,
    contextLoading: history.loading,
    contextError: history.error,
    contextWarning: history.context?.warning,
    fallbackUsed: Boolean(history.context?.fallbackUsed),
    notesMessage: notes.message,
    notesError: notes.isError,
    publicationError: publication.error,
    created: session.created,
  });
  const locked = notes.busy || publication.busy;
  const targetLabel = (index: number) => {
    const endpoint = target.choices[index];
    const connection = useHostingState.getState().connections.find((entry) => entry.id === endpoint.repository?.connectionId);
    return `${endpoint.remoteName} · ${connection ? providerLabels[connection.provider] : 'Hosting'} · ${connection?.baseUrl.replace(/^https?:\/\//, '') || ''} · ${connection?.username || connection?.label || ''} · ${endpoint.repository?.fullPath}`;
  };
  return (
    <section className="repository-release-page" aria-busy={target.loading || history.loading || locked}>
      <div className="release-target-toolbar">
        <div className="release-target-toolbar__identity">
          <span className="release-target-label">{tr('Veröffentlichungsziel', 'Publication target')}:</span>
          {target.choices.length > 1 ? (
            <select
              className="release-select"
              aria-label={tr('Hosting-Ziel', 'Hosting target')}
              value={target.endpoint ? target.choices.indexOf(target.endpoint) : ''}
              disabled={locked || target.loading}
              onChange={(event) => target.choose(target.choices[Number(event.target.value)])}
            >
              <option value="" disabled>
                {tr('Ziel auswählen', 'Choose target')}
              </option>
              {target.choices.map((_, index) => (
                <option key={index} value={index}>
                  {targetLabel(index)}
                </option>
              ))}
            </select>
          ) : (
            <span className="release-target-name">
              {target.endpoint
                ? targetLabel(target.choices.indexOf(target.endpoint))
                : target.loading
                  ? tr('Hosting-Ziel wird geladen …', 'Loading hosting target …')
                  : tr('Kein Ziel zugeordnet', 'No target configured')}
            </span>
          )}
        </div>
        <Button variant="ghost" disabled={locked} onClick={onOpenRemoteConfig}>
          {tr('Remote-Konfiguration', 'Remote configuration')}
        </Button>
        {!target.loading && !target.repository && (
          <Button
            variant="ghost"
            onClick={() => {
              useHostingState.getState().navigate('connections');
              setActiveTab('hosting');
            }}
          >
            {tr('Konten & Server', 'Accounts & servers')}
          </Button>
        )}
        {publication.busy && <Button onClick={publication.cancel}>{tr('Veröffentlichung abbrechen', 'Cancel publication')}</Button>}
        {session.created && (
          <>
            {session.assets.some((file) => !session.uploaded.includes(file)) && (
              <Button disabled={locked} onClick={() => void publication.retryAssets()}>
                {tr('Ausstehende Dateien hochladen', 'Upload pending files')}
              </Button>
            )}
            <Button
              disabled={locked}
              onClick={() => {
                update(() => newReleaseSession(branch, appLanguage));
                void history.refresh();
              }}
            >
              {tr('Neuen Release vorbereiten', 'Prepare another release')}
            </Button>
          </>
        )}
      </div>
      <div className="repository-release-page__creator">
        <ReleaseCreator
          repositoryLabel={target.repository?.fullName || null}
          hasLocalRepository={Boolean(repoPath)}
          capabilities={target.capabilities}
          releaseForm={session.form}
          setReleaseForm={(updater) => update((previous) => ({ ...previous, form: updater(previous.form) }))}
          releaseSubmitting={publication.busy}
          releasePhase={publication.phase}
          onCreateRelease={publication.publish}
          versionBump={session.versionBump}
          setVersionBump={(value) => update((previous) => ({ ...previous, versionBump: value }))}
          pendingAssets={session.assets}
          uploadedAssets={session.uploaded}
          published={Boolean(session.created)}
          onAddPendingAssets={publication.addAssets}
          onRemovePendingAsset={(file) => update((previous) => ({ ...previous, assets: previous.assets.filter((entry) => entry !== file) }))}
          contextLoading={target.loading || history.loading}
          context={history.context}
          onRefreshContext={history.refresh}
          onGenerateNotes={notes.generate}
          onGenerateOfflineNotes={notes.generateOffline}
          notesGenerating={notes.busy}
          notesGenerationMode={notes.mode}
          notesLanguage={session.language}
          setNotesLanguage={(value) => update((previous) => ({ ...previous, language: value }))}
          notesOptions={session.options}
          setNotesOptions={(updater) => update((previous) => ({ ...previous, options: updater(previous.options) }))}
        />
      </div>
    </section>
  );
}
