import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import { plannerWorkReferenceKey } from '@/shared/plannerWork';
import type { PlannerChangeRequestReference } from '@/types/projectPlanner';
import type { PlannerWorkDetails } from '@/types/plannerWork';

export function PlannerWorkRequests({
  references,
  details,
  busy,
  onAttach,
  onDetach,
}: {
  references: PlannerChangeRequestReference[];
  details?: PlannerWorkDetails;
  busy: boolean;
  onAttach(reference: PlannerChangeRequestReference): void;
  onDetach(id: string): void;
}) {
  const { tr } = useI18n();
  const candidates = details?.requests.filter((entry) => !references.some((ref) => plannerWorkReferenceKey(ref) === plannerWorkReferenceKey(entry))) || [];
  const labels = { open: tr('offen', 'open'), closed: tr('geschlossen', 'closed'), merged: tr('zusammengeführt', 'merged') };
  return (
    <>
      <h4>Pull / Merge Requests</h4>
      <ul>
        {references.map((reference) => {
          const checked = details?.requests.find((entry) => plannerWorkReferenceKey(entry) === plannerWorkReferenceKey(reference));
          return (
            <li key={plannerWorkReferenceKey(reference)}>
              <button type="button" onClick={() => void appClient.openExternalUrl(reference.url)}>
                #{reference.number} {checked?.title || reference.fullPath}
              </button>{' '}
              · {checked ? labels[checked.state] : tr('gespeicherter Link', 'saved link')}{' '}
              <button type="button" disabled={busy} onClick={() => onDetach(plannerWorkReferenceKey(reference))}>
                {tr('Verknüpfung lösen', 'Unlink')}
              </button>
            </li>
          );
        })}
      </ul>
      {candidates.length > 0 && (
        <label>
          {tr('Geprüften PR ausdrücklich zuordnen', 'Explicitly link a verified PR')}
          <select
            value=""
            disabled={busy}
            onChange={(event) => {
              const reference = candidates.find((entry) => plannerWorkReferenceKey(entry) === event.target.value);
              if (reference) onAttach(reference);
            }}
          >
            <option value="">{tr('PR auswählen …', 'Choose PR …')}</option>
            {candidates.map((entry) => (
              <option key={plannerWorkReferenceKey(entry)} value={plannerWorkReferenceKey(entry)}>
                #{entry.number} {entry.title} · {entry.headSha.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
      )}
      {details?.remoteCheckedAt && (
        <small>
          {tr('Letzte Serverprüfung:', 'Last server check:')} {new Date(details.remoteCheckedAt).toLocaleString()}
        </small>
      )}
    </>
  );
}
