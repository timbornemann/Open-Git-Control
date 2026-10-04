import type { ReleaseNotesOptions } from '@/types/releaseNotes';
import { useI18n } from '@/i18n';
export function HostingNotesOptions({ options, onChange }: { options: ReleaseNotesOptions; onChange: (options: ReleaseNotesOptions) => void }) {
  const { tr } = useI18n();
  const labels: Record<keyof ReleaseNotesOptions, string> = {
    omitMergeCommits: tr('Merge-Commits auslassen', 'Exclude merge commits'),
    preferGroupedSections: tr('In Abschnitte gruppieren', 'Group into sections'),
    includeTechnicalDetails: tr('Technische Details', 'Technical details'),
    includeBreakingChangesSection: tr('Breaking Changes aufnehmen', 'Include breaking changes'),
    appendAlgorithmicChangeList: tr('Automatische Commit-Liste anhängen', 'Append automatic commit list'),
    includeHashesInAlgorithmicList: tr('Commit-Hashes aufnehmen', 'Include commit hashes'),
  };
  return (
    <details>
      <summary>{tr('KI-Notes anpassen', 'Tune AI notes')}</summary>
      {(Object.keys(labels) as (keyof ReleaseNotesOptions)[]).map((key) => (
        <label className="hosting-checkbox" key={key}>
          <input type="checkbox" checked={options[key]} onChange={(event) => onChange({ ...options, [key]: event.target.checked })} />
          {labels[key]}
        </label>
      ))}
    </details>
  );
}
