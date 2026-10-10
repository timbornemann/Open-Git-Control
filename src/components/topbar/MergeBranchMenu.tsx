import { useId, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { BranchInfo, GitMergeDirection, GitMergeMode } from '@/types/git';
import { MERGE_MODES } from '@/shared/git/merge';
import { normalizeBranchRefForMerge } from '@/utils/gitParsing';
import { mergeModePresentation } from '@/utils/mergePresentation';
import { useI18n } from '@/i18n';

type Props = {
  branches: BranchInfo[];
  currentBranch: string;
  onMerge: (branchName: string, mode: GitMergeMode, direction: GitMergeDirection) => void;
};

export function MergeBranchMenu({ branches, currentBranch, onMerge }: Props) {
  const { tr } = useI18n();
  const id = useId();
  const [direction, setDirection] = useState<GitMergeDirection>('intoCurrent');
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<GitMergeMode>('default');
  const outward = direction === 'intoSelected';
  const candidates = branches
    .filter((b) => !b.isHead && b.name !== currentBranch && (!outward || b.scope === 'local'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedBranch = candidates.find((branch) => branch.name === selected);
  const activeLabel = currentBranch || tr('Detached HEAD', 'Detached HEAD');
  const otherLabel = selectedBranch ? normalizeBranchRefForMerge(selectedBranch.name) : tr('Branch auswählen', 'Choose a branch');
  const behavior = mergeModePresentation(mode, tr);

  return (
    <div className="merge-branch-menu">
      <div className="merge-branch-heading">{tr('Branches zusammenführen', 'Merge branches')}</div>
      <fieldset className="merge-direction">
        <legend>{tr('Welche Richtung?', 'Which direction?')}</legend>
        <div className="merge-direction-options">
          <button
            type="button"
            aria-pressed={!outward}
            onClick={() => {
              setDirection('intoCurrent');
              setSelected('');
            }}
          >
            {tr('In aktuellen Branch', 'Into current branch')}
          </button>
          <button
            type="button"
            aria-pressed={outward}
            disabled={!currentBranch}
            onClick={() => {
              setDirection('intoSelected');
              setSelected('');
            }}
          >
            {tr('Aktuellen Branch weitergeben', 'Current into another')}
          </button>
        </div>
        <p>
          {outward
            ? tr(
                'Die App wechselt selbst zum Zielbranch und übernimmt deine bisherigen Commits dort.',
                'The app switches to the target branch and takes your existing commits there.',
              )
            : tr(
                'Übernimm Änderungen eines anderen Branches. Dein aktueller Branch bleibt aktiv.',
                'Take changes from another branch. Your current branch stays active.',
              )}
        </p>
        {!currentBranch && (
          <p>
            {tr(
              'Zum Weitergeben zuerst einen lokalen Branch auswählen; aktuell ist kein Branch aktiv.',
              'Choose a local branch first to merge outwards; no branch is currently active.',
            )}
          </p>
        )}
      </fieldset>
      <label className="merge-menu-field">
        <span>
          {outward
            ? tr('Zielbranch · erhält Änderungen', 'Target branch · receives changes')
            : tr('Quellbranch · liefert Änderungen', 'Source branch · provides changes')}
        </span>
        <select value={selectedBranch?.name || ''} onChange={(event) => setSelected(event.target.value)} autoFocus>
          <option value="">
            {candidates.length ? tr('Branch auswählen…', 'Choose a branch…') : tr('Keine anderen Branches verfügbar', 'No other branches available')}
          </option>
          {(['local', 'remote'] as const).map((scope) => {
            const options = candidates.filter((b) => b.scope === scope);
            return options.length ? (
              <optgroup key={scope} label={scope === 'local' ? tr('Lokale Branches', 'Local branches') : tr('Remote-Branches', 'Remote branches')}>
                {options.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {normalizeBranchRefForMerge(branch.name)}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </label>
      <div className="merge-flow" aria-label={tr('Merge-Richtung', 'Merge direction')}>
        <strong title={outward ? activeLabel : otherLabel}>{outward ? activeLabel : otherLabel}</strong>
        <ArrowRight size={16} aria-hidden="true" />
        <strong title={outward ? otherLabel : activeLabel}>{outward ? otherLabel : activeLabel}</strong>
      </div>
      <label className="merge-menu-field">
        <span>{tr('Wie übernehmen?', 'How to combine?')}</span>
        <select value={mode} onChange={(event) => setMode(event.target.value as GitMergeMode)} aria-describedby={`${id}-behavior`}>
          {MERGE_MODES.map((value) => (
            <option key={value} value={value}>
              {mergeModePresentation(value, tr).label}
            </option>
          ))}
        </select>
      </label>
      <p id={`${id}-behavior`} className="merge-menu-explanation">
        {behavior.description}
      </p>
      <p className="merge-menu-note">
        {outward
          ? tr(
              'Vorher committen oder stashen. Das Ziel bleibt danach aktiv, auch bei Konflikten. Kein Upload.',
              'Commit or stash first. The target stays active afterwards, including with conflicts. No upload.',
            )
          : tr('Der Quellbranch bleibt unverändert. Es wird nichts hochgeladen.', 'The source branch stays unchanged. Nothing is uploaded.')}
      </p>
      <button
        type="button"
        className="dialog-btn dialog-btn-primary merge-menu-continue"
        disabled={!selectedBranch}
        onClick={() => onMerge(selected, mode, direction)}
      >
        {tr('Weiter · Merge prüfen', 'Continue · review merge')}
      </button>
    </div>
  );
}
