import { useState } from 'react';
import { useI18n } from '@/i18n';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useOptionalRepositoryContext } from '@/contexts/AppStateContext';
import type { PublicationContext, PublicationSelection } from '@/types/repositoryPublication';

export function PublicationRefs({
  context,
  selection,
  update,
  disabled,
}: {
  context: PublicationContext;
  selection: PublicationSelection;
  update: (value: PublicationSelection) => void;
  disabled: boolean;
}) {
  const { tr } = useI18n();
  const showBranchCreator = useOptionalRepositoryContext()?.onSetCreatingBranch;
  const [advanced, setAdvanced] = useState(false);
  const main = selection.branches[0];
  return (
    <div className="publication-refs">
      <div className="publication-grid">
        <label>
          {tr('Hauptbranch', 'Main branch')}
          <select
            aria-label={tr('Hauptbranch', 'Main branch')}
            value={main?.sourceBranch || ''}
            disabled={disabled || !context.branches.length}
            onChange={(event) => {
              const sourceBranch = event.target.value;
              update({
                ...selection,
                branches: sourceBranch
                  ? [{ sourceBranch, destinationBranch: sourceBranch }, ...selection.branches.filter((b) => b.sourceBranch !== sourceBranch && b !== main)]
                  : [],
              });
            }}
          >
            <option value="">{tr('Branch auswählen', 'Choose branch')}</option>
            {context.branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('Branch am Hosting-Ziel', 'Branch at hosting target')}
          <TextField
            value={main?.destinationBranch || ''}
            disabled={disabled || !main}
            onChange={(event) =>
              update({ ...selection, branches: selection.branches.map((b, i) => (i ? b : { ...b, destinationBranch: event.target.value })) })
            }
          />
        </label>
      </div>
      <p className="publication-help">
        {!context.snapshot.branch
          ? tr(
              'Detached HEAD: Wähle einen lokalen Branch oder erstelle einen in der Seitenleiste und aktualisiere die Auswahl. Ein Checkout ist für die Veröffentlichung nicht nötig.',
              'Detached HEAD: choose a local branch or create one in the sidebar and refresh the selection. Publication does not require a checkout.',
            )
          : !context.branches.length
            ? tr(
                'Noch kein Commit vorhanden. Das Repository kann bereits erstellt und verbunden werden. Danach kannst du in Staging committen und hier fortsetzen.',
                'No commits yet. You can create and connect the repository now, then make a commit in Staging and resume here.',
              )
            : tr(
                'Der gewählte Branch wird einschließlich seiner Historie veröffentlicht. Arbeitsdateien werden nicht automatisch committet.',
                'The selected branch is published with its history. Working files are not committed automatically.',
              )}
      </p>
      {!context.snapshot.branch && showBranchCreator && (
        <Button disabled={disabled} onClick={() => showBranchCreator(true)}>
          {tr('Branch erstellen', 'Create branch')}
        </Button>
      )}
      <details open={advanced} onToggle={(event) => setAdvanced(event.currentTarget.open)}>
        <summary>
          {tr('Weitere Branches und Tags', 'Additional branches and tags')} · {Math.max(0, selection.branches.length - 1)} / {selection.tagNames.length}
        </summary>
        <div className="publication-ref-lists">
          <div>
            <strong>{tr('Zusätzliche Branches', 'Additional branches')}</strong>
            {context.branches
              .filter((b) => b.name !== main?.sourceBranch)
              .map((branch) => {
                const selected = selection.branches.find((b) => b.sourceBranch === branch.name);
                return (
                  <div className="publication-ref-row" key={branch.name}>
                    <label className="publication-check">
                      <input
                        type="checkbox"
                        disabled={disabled || !main}
                        checked={Boolean(selected)}
                        onChange={(event) =>
                          update({
                            ...selection,
                            branches: event.target.checked
                              ? [...selection.branches, { sourceBranch: branch.name, destinationBranch: branch.name }]
                              : selection.branches.filter((b) => b.sourceBranch !== branch.name),
                          })
                        }
                      />
                      {branch.name}
                    </label>
                    {selected && (
                      <TextField
                        aria-label={`${tr('Zielbranch für', 'Target branch for')} ${branch.name}`}
                        disabled={disabled}
                        value={selected.destinationBranch}
                        onChange={(event) =>
                          update({
                            ...selection,
                            branches: selection.branches.map((b) => (b === selected ? { ...b, destinationBranch: event.target.value } : b)),
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
          </div>
          <div>
            <strong>Tags</strong>
            {context.tags.length ? (
              context.tags.map((tag) => (
                <label className="publication-check publication-ref-row" key={tag.name}>
                  <input
                    type="checkbox"
                    checked={selection.tagNames.includes(tag.name)}
                    disabled={disabled || !main}
                    onChange={(event) =>
                      update({
                        ...selection,
                        tagNames: event.target.checked ? [...selection.tagNames, tag.name] : selection.tagNames.filter((name) => name !== tag.name),
                      })
                    }
                  />
                  {tag.name}
                </label>
              ))
            ) : (
              <small>{tr('Keine lokalen Tags.', 'No local tags.')}</small>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
