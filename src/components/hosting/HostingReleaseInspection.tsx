import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import type { HostingReleaseTarget } from '@/types/hostingDtos';

export function HostingReleaseInspection({
  inspection,
  busy,
  native,
  onPublish,
  onSuggest,
  onTransfer,
}: {
  inspection: HostingReleaseTarget;
  busy: boolean;
  native: boolean;
  onPublish: () => void;
  onSuggest: () => void;
  onTransfer: () => void;
}) {
  const { tr } = useI18n();
  return (
    <div className="hosting-card">
      <h3>{tr('Geprüfter Veröffentlichungsstand', 'Reviewed publication revision')}</h3>
      <p>
        Local: <code>{inspection.localSha ?? '—'}</code>
      </p>
      <p>
        Remote: <code>{inspection.remoteSha ?? '—'}</code>
      </p>
      <p>
        Ahead {inspection.ahead} · Behind {inspection.behind}
      </p>
      {inspection.pushBlockedReason && <p>{inspection.pushBlockedReason}</p>}
      <div className="hosting-actions">
        <Button variant="primary" disabled={busy || !inspection.canReleaseRemote} onClick={onPublish}>
          {native ? tr('Remote-Stand veröffentlichen', 'Publish remote revision') : tr('Tag auf Remote-Stand erstellen', 'Create tag on remote revision')}
        </Button>
        <Button type="button" disabled={busy} onClick={onSuggest}>
          {tr('Nächsten Versionstag vorschlagen', 'Suggest next version tag')}
        </Button>
        {inspection.localSha && (!inspection.remoteSha || inspection.ahead > 0) && (
          <Button disabled={busy} onClick={onTransfer}>
            {tr('Lokalen Stand zuerst pushen', 'Push local revision first')}
          </Button>
        )}
      </div>
    </div>
  );
}
