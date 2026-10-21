import { useState } from 'react';
import { Loader2, Unlink } from 'lucide-react';
import { DialogFrame } from '@/components/DialogFrame';
import { VirtualList } from '@/components/VirtualList';
import { useI18n } from '@/i18n';
import type { UntrackScope } from '@/shared/ipc/untrackFiles';
import type { useUntrackFiles } from './useUntrackFiles';
import { untrackBlockText, untrackErrorText, untrackPhaseText, untrackScopeText } from './untrackFilesText';
import './untrackFiles.css';

export function UntrackFilesDialog({ model }: { model: ReturnType<typeof useUntrackFiles> }) {
  const { tr } = useI18n();
  const [focusRequest, setFocusRequest] = useState<{ index: number; id: number; planId: string }>();
  const { inspection, selected, busy, result } = model;
  const candidates = inspection?.candidates ?? [];
  const chosen = candidates.filter((candidate) => selected.has(candidate.id));
  const added = chosen.filter((candidate) => candidate.added).length;
  const nonIgnored = chosen.filter((candidate) => !candidate.ignored).length;
  return (
    <DialogFrame
      open={model.visible}
      title={tr('Aus Versionierung entfernen', 'Stop tracking files')}
      onClose={model.close}
      onConfirm={result ? undefined : () => void model.execute()}
      confirmDisabled={Boolean(busy) || !inspection || !selected.size}
      confirmLabel={tr(`${selected.size} Dateien aus Versionierung entfernen`, `Stop tracking ${selected.size} files`)}
      secondaryActionLabel={tr('Erneut prüfen', 'Inspect again')}
      onSecondaryAction={!busy && !result ? model.refresh : undefined}
      cancelLabel={model.cancelling ? tr('Wird abgebrochen …', 'Cancelling …') : busy === 'execute' ? tr('Abbrechen', 'Cancel') : tr('Schließen', 'Close')}
      closeOnBackdrop={!busy}
    >
      <p className="dialog-message">
        {tr('Lokale Dateien bleiben erhalten. .gitignore wird nicht verändert.', 'Local files are kept. .gitignore is not changed.')}
      </p>
      {busy && (
        <p className="untrack-progress" role="status">
          <Loader2 size={16} className="untrack-spinner" />
          {model.cancelling
            ? tr('Abbruch und tatsächlichen Zustand prüfen …', 'Cancelling and checking the actual outcome …')
            : untrackPhaseText(model.phase, tr)}
        </p>
      )}
      {model.error && (
        <p role="alert" className="untrack-error">
          {untrackErrorText(model.error, tr)}
        </p>
      )}
      {result ? (
        <div role="status">
          <p>
            {tr(
              `${result.length} Dateien aus der Versionierung entfernt. Lokale Inhalte wurden beibehalten.`,
              `Stopped tracking ${result.length} files. Local contents were kept.`,
            )}
          </p>
          <p className="dialog-impact">
            {tr(
              'Bei bereits committeten Dateien ist die Entfernung jetzt gestagt. Erst ein Commit übernimmt sie in die Historie.',
              'For previously committed files, the removal is now staged. Commit it to record it in history.',
            )}
          </p>
        </div>
      ) : inspection ? (
        <>
          <label className="dialog-field">
            <span>{tr('Umfang', 'Scope')}</span>
            <select
              value={model.scope}
              disabled={Boolean(busy)}
              onChange={(event) => {
                setFocusRequest(undefined);
                model.changeScope(event.target.value as UntrackScope);
              }}
            >
              {inspection.scopes.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {untrackScopeText(option, tr)}
                </option>
              ))}
            </select>
          </label>
          {model.scope !== 'file' && (
            <p className="dialog-impact">
              {tr(
                'Nur bereits ignorierte Dateien sind vorausgewählt. Weitere Dateien können einzeln ausgewählt werden.',
                'Only files already ignored are preselected. You can select other files individually.',
              )}
            </p>
          )}
          <div
            className="untrack-files"
            role="group"
            aria-label={tr('Versionierte Dateien', 'Tracked files')}
            onKeyDown={(event) => {
              const input = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-untrack-index]');
              if (!input || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const current = Number(input.dataset.untrackIndex);
              const enabled = candidates.map((candidate, index) => (candidate.blocked ? -1 : index)).filter((index) => index >= 0);
              const position = enabled.indexOf(current);
              const next =
                event.key === 'Home'
                  ? enabled[0]
                  : event.key === 'End'
                    ? enabled.at(-1)
                    : enabled[Math.max(0, Math.min(enabled.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)))];
              if (next !== undefined) setFocusRequest((previous) => ({ index: next, id: (previous?.id ?? 0) + 1, planId: inspection.planId }));
            }}
          >
            <VirtualList
              key={inspection.planId}
              items={candidates}
              rowHeight={70}
              maxHeight={280}
              focusRequest={focusRequest?.planId === inspection.planId ? focusRequest : undefined}
              getKey={(candidate) => candidate.id}
              renderItem={(candidate, index) => {
                const description = candidate.blocked
                  ? untrackBlockText(candidate.blocked, tr)
                  : candidate.ignored
                    ? tr('Ignoriert', 'Ignored')
                    : tr('Nicht ignoriert · erscheint danach als unversioniert', 'Not ignored · will appear as untracked');
                return (
                  <label className={`untrack-file${candidate.blocked ? ' untrack-file--blocked' : ''}`} title={`${candidate.path}\n${description}`}>
                    <input
                      type="checkbox"
                      data-untrack-index={index}
                      tabIndex={0}
                      aria-label={candidate.path}
                      aria-describedby={`untrack-reason-${candidate.id}`}
                      checked={selected.has(candidate.id)}
                      disabled={Boolean(busy) || Boolean(candidate.blocked)}
                      onChange={() => model.toggle(candidate.id)}
                    />
                    <span className="untrack-file-text">
                      <strong>{candidate.path}</strong>
                      <span id={`untrack-reason-${candidate.id}`}>{description}</span>
                    </span>
                    {candidate.blocked && <Unlink size={15} aria-hidden="true" />}
                  </label>
                );
              }}
            />
          </div>
          {!candidates.length && <p>{tr('Keine versionierten Dateien in diesem Umfang.', 'No tracked files in this scope.')}</p>}
          <div className="dialog-impact" aria-live="polite">
            <strong>{tr(`${selected.size} von ${candidates.length} Dateien ausgewählt`, `${selected.size} of ${candidates.length} files selected`)}</strong>
            {chosen.length > added && (
              <span>
                {tr(
                  `${chosen.length - added} bereits committete Dateien: Entfernung wird gestagt.`,
                  `${chosen.length - added} previously committed files: removal will be staged.`,
                )}
              </span>
            )}
            {added > 0 && (
              <span>{tr(`${added} neu gestagte Dateien: werden aus dem Index genommen.`, `${added} newly staged files: will be removed from the index.`)}</span>
            )}
            {nonIgnored > 0 && (
              <span className="untrack-warning">
                {tr(
                  `${nonIgnored} Dateien sind nicht ignoriert und können danach erneut gestagt werden.`,
                  `${nonIgnored} files are not ignored and can be staged again afterwards.`,
                )}
              </span>
            )}
          </div>
        </>
      ) : null}
    </DialogFrame>
  );
}
