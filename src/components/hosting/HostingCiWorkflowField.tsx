import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { hostingClient } from '@/services/hostingClient';
import type { HostedRepository, HostingLocalWorkflows } from '@/types/hostingDtos';
import { hostedRepositoryKey } from './hostingState';

export function HostingCiWorkflowField({
  id,
  repository,
  repoPath,
  value,
  onChange,
  disabled,
}: {
  id: string;
  repository: HostedRepository;
  repoPath?: string | null;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const { tr } = useI18n();
  const onToast = useGitStore((state) => state.onToast);
  const [result, setResult] = useState<HostingLocalWorkflows | null>(null);
  const [loading, setLoading] = useState(Boolean(repoPath));
  const [revision, setRevision] = useState(0);
  const [manual, setManual] = useState(true);
  const edited = useRef(false);
  const callbacks = useRef({ onChange, onToast, tr });
  callbacks.current = { onChange, onToast, tr };
  const scope = JSON.stringify([hostedRepositoryKey(repository), repoPath]);
  useEffect(() => {
    let active = true;
    setResult(null);
    setLoading(Boolean(repoPath));
    if (repoPath) {
      void hostingClient
        .request('localWorkflows', { repository: repository.ref, repoPath })
        .then((next) => {
          if (!active) return;
          setResult(next);
          if (!edited.current && next.workflows.length) {
            setManual(false);
            callbacks.current.onChange(next.workflows[0].id);
          }
          if (next.issues.length)
            callbacks.current.onToast(
              callbacks.current.tr('Einige Workflow-Dateien konnten nicht gelesen werden: ', 'Some workflow files could not be read: ') +
                [...new Set(next.issues.map((issue) => issue.filePath))].join(', ').slice(0, 300),
              true,
            );
        })
        .catch((error: unknown) => {
          if (active)
            callbacks.current.onToast(
              callbacks.current.tr('Lokale Workflows konnten nicht geladen werden: ', 'Local workflows could not be loaded: ') +
                String(error instanceof Error ? error.message : error),
              true,
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [scope, repoPath, repository.ref, revision]);
  const workflows = result?.workflows ?? [];
  const selected = !manual ? workflows.findIndex((entry) => entry.id === value) : -1;
  const manualEntry = selected < 0;
  return (
    <div className="hosting-ci-start__field">
      <label htmlFor={repoPath ? id : `${id}-manual`}>{tr('Workflow / Pipeline', 'Workflow / pipeline')}</label>
      {repoPath && (
        <div className="hosting-ci-workflow__choice">
          <select
            id={id}
            className="ui-field ui-field--sm"
            aria-describedby={`${id}-help`}
            value={manualEntry ? 'manual' : String(selected)}
            disabled={disabled}
            onChange={(event) => {
              edited.current = true;
              const entry = workflows[Number(event.target.value)];
              setManual(event.target.value === 'manual');
              if (entry) onChange(entry.id);
            }}
          >
            {workflows.map((entry, index) => (
              <option key={`${entry.filePath}/${entry.id}`} value={index}>
                {entry.name} · {entry.filePath}
              </option>
            ))}
            <option value="manual">{tr('Manuell eingeben', 'Enter manually')}</option>
          </select>
          <Button
            variant="ghost"
            size="xs"
            icon={loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            aria-label={tr('Lokale Workflows aktualisieren', 'Refresh local workflows')}
            title={tr('Lokale Workflows aktualisieren', 'Refresh local workflows')}
            disabled={disabled || loading}
            onClick={() => setRevision((previous) => previous + 1)}
          />
        </div>
      )}
      {manualEntry && (
        <TextField
          id={`${id}-manual`}
          aria-label={tr('Workflow manuell eingeben', 'Enter workflow manually')}
          aria-describedby={`${id}-help`}
          value={value}
          onChange={(event) => {
            edited.current = true;
            setManual(true);
            onChange(event.target.value);
          }}
          placeholder={
            result?.provider === 'gitlab' ? tr('Leer = neue Pipeline; job:ID = manueller Job', 'Empty = new pipeline; job:ID = manual job') : 'ci.yml'
          }
          disabled={disabled}
        />
      )}
      <small id={`${id}-help`}>
        {loading
          ? tr('Lokale Workflows werden gelesen …', 'Reading local workflows …')
          : workflows.length
            ? tr(
                'Lokale Vorschläge. Die Konfiguration muss auch auf dem gewählten Branch / Tag beim Anbieter vorhanden sein.',
                'Local suggestions. The configuration must also exist on the selected branch / tag at the provider.',
              )
            : repoPath
              ? result
                ? tr(
                    'Keine manuell startbaren lokalen Workflows gefunden. Datei, ID oder Selector frei eingeben.',
                    'No manually startable local workflows found. Enter a file, ID or selector.',
                  )
                : tr(
                    'Lokale Vorschläge sind derzeit nicht verfügbar. Datei, ID oder Selector frei eingeben.',
                    'Local suggestions are currently unavailable. Enter a file, ID or selector.',
                  )
              : tr(
                  'Ein lokaler Klon liefert Workflow-Vorschläge. Datei, ID oder Selector kann auch direkt eingegeben werden.',
                  'A local clone provides workflow suggestions. You can also enter a file, ID or selector directly.',
                )}
      </small>
    </div>
  );
}
