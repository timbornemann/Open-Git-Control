import { hostingClient } from '@/services/hostingClient';
import { awaitRemoteTransfer } from '@/components/hosting/awaitRemoteTransfer';
import { resolveReleasePushTarget } from '@/components/hosting/releasePushTarget';
import type { HostingCreateRelease, HostingReleaseTarget } from '@/types/hostingDtos';
import type { ReleaseSubmissionPhase } from '@/types/releaseNotes';

type Params = {
  input: HostingCreateRelease;
  targetOid: string;
  endpointUrl?: string;
  signal: AbortSignal;
  assertCurrent: () => void;
  setPhase: (phase: ReleaseSubmissionPhase) => void;
  choose: (inspection: HostingReleaseTarget) => Promise<'push' | 'remote'>;
  tr: (de: string, en: string) => string;
};

/** Publication can continue only after this exact endpoint and captured commit have been checked. */
export async function prepareReleasePublication({ input, targetOid, endpointUrl, signal, assertCurrent, setPhase, choose, tr }: Params) {
  let inspection = await hostingClient.request('inspectRelease', input);
  assertCurrent();
  if ((inspection.localSha || inspection.remoteSha) !== targetOid)
    throw new Error(tr('Der Ziel-Commit wurde geändert. Aktualisiere die Release-History.', 'The target commit changed. Refresh release history.'));
  if (inspection.behind > 0 && inspection.ahead > 0)
    throw new Error(
      tr('Die Branches sind auseinander gelaufen. Synchronisiere sie vor der Veröffentlichung.', 'The branches diverged. Synchronize them before publication.'),
    );
  if (inspection.ahead > 0 || !inspection.remoteSha) {
    if (!inspection.canPush && !inspection.canReleaseRemote)
      throw new Error(inspection.pushBlockedReason || tr('Kein gültiges Veröffentlichungsziel.', 'No valid publication target.'));
    setPhase('awaiting-decision');
    const mode = await choose(inspection);
    assertCurrent();
    if (mode === 'push') {
      if (!inspection.canPush || !inspection.localSha || !inspection.targetBranch) throw new Error('The inspected release branch cannot be pushed.');
      const urls = await resolveReleasePushTarget(input.repoPath, input.remoteName, input.repository, endpointUrl);
      assertCurrent();
      setPhase('pushing');
      const batch = await awaitRemoteTransfer(
        {
          repoPath: input.repoPath,
          mode: 'push',
          sourceBranch: inspection.targetBranch,
          destinationBranch: inspection.targetBranch,
          expectedSourceOid: inspection.localSha,
          constrainedRemoteNames: [input.remoteName],
          constrainedTargetUrls: urls,
          tagNames: [],
        },
        signal,
      );
      assertCurrent();
      if (batch.sourceOid !== inspection.localSha) throw new Error('The publication transfer used a different commit.');
      setPhase('checking');
      inspection = await hostingClient.request('inspectRelease', input);
      assertCurrent();
      if (inspection.remoteSha !== batch.sourceOid || inspection.localSha !== batch.sourceOid || inspection.ahead || inspection.behind)
        throw new Error(tr('Der Veröffentlichungsstand wurde verändert. Bitte erneut prüfen.', 'The publication revision changed. Inspect it again.'));
    }
  }
  if (!inspection.canReleaseRemote)
    throw new Error(tr('Der Ziel-Commit ist am gewählten Endpunkt nicht veröffentlicht.', 'The target commit is not published on the selected endpoint.'));
  return inspection;
}
