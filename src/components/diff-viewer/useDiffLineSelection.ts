import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import type { ParsedDiff } from '@/shared/diff/parser';
import { diffSelectionUnits, toggleDiffSelection } from '@/shared/diff/lineSelection';
import { gitClient } from '@/services/gitClient';
import { useI18n } from '@/i18n';
import type { HunkPatchOperation } from './useHunkPatchActions';

type Params = {
  context: RepositoryFileContextDto;
  diffText: string;
  parsed: ParsedDiff;
  enabled: boolean;
  blocked: boolean;
  onApplied: (operation: HunkPatchOperation) => void;
  onRefresh: () => void;
  onRepoChanged?: () => void;
  onError: (message: string) => void;
};
const empty = new Set<string>();
export function useDiffLineSelection({ context, diffText, parsed, enabled, blocked, onApplied, onRefresh, onRepoChanged, onError }: Params) {
  const { tr } = useI18n();
  const contextKey = JSON.stringify([context.repoPath, context.path, context.source]);
  const contextScope = useMemo(() => ({ contextKey }), [contextKey]);
  const identity = useMemo(() => ({ contextKey, diffText }), [contextKey, diffText]);
  const [state, setState] = useState({ identity, selected: new Set<string>(), anchor: null as string | null });
  const selected = state.identity === identity ? state.selected : empty;
  const ids = useMemo(() => diffSelectionUnits(parsed).map((unit) => unit.id), [parsed]);
  const [isRunning, setRunning] = useState(false);
  const running = useRef(false);
  const scope = useRef<typeof contextScope | null>(contextScope);
  useLayoutEffect(() => {
    scope.current = contextScope;
    return () => {
      scope.current = null;
    };
  }, [contextScope]);
  useLayoutEffect(() => {
    setState({ identity, selected: new Set(), anchor: null });
  }, [identity]);
  const clear = useCallback(() => setState({ identity, selected: new Set(), anchor: null }), [identity]);
  const toggle = (id: string, range: boolean) => {
    if (!enabled || blocked || running.current) return;
    setState((previous) => ({
      identity,
      selected: toggleDiffSelection(
        ids,
        previous.identity === identity ? previous.selected : empty,
        previous.identity === identity ? previous.anchor : null,
        id,
        range,
      ),
      anchor: id,
    }));
  };
  const apply = async () => {
    if (!enabled || blocked || running.current || !selected.size || context.source === 'commit') return;
    running.current = true;
    setRunning(true);
    try {
      const result = await gitClient.applyDiffLineSelection({
        repoPath: context.repoPath,
        path: context.path,
        source: context.source,
        expectedDiff: diffText,
        selectedUnitIds: [...selected],
      });
      if (scope.current !== contextScope) return;
      if (!result.success) {
        onError(result.error);
        return;
      }
      if (result.data.status === 'applied') {
        clear();
        onRepoChanged?.();
        onApplied(context.source === 'unstaged' ? 'stage' : 'unstage');
      } else if (result.data.status === 'stale') {
        clear();
        onRefresh();
        onError(tr('Der Diff hat sich geändert. Bitte die Zeilen erneut auswählen.', 'The diff changed. Please select the lines again.'));
      } else
        onError(
          result.data.reason === 'lineEndingDependency'
            ? tr(
                'Bitte auch die angrenzende Ersetzung auswählen, die den letzten Zeilenumbruch ändert.',
                'Also select the adjacent replacement that changes the final line ending.',
              )
            : tr(
                'Diese Datei lässt sich nicht sicher zeilenweise bearbeiten. Bitte den Diff aktualisieren oder die Dateiaktionen verwenden.',
                'This file cannot safely be staged by line. Refresh the diff or use the file actions.',
              ),
        );
    } catch (error) {
      if (scope.current === contextScope)
        onError(error instanceof Error ? error.message : tr('Zeilenauswahl konnte nicht angewendet werden.', 'Applying selected lines failed.'));
    } finally {
      running.current = false;
      if (scope.current !== null) setRunning(false);
    }
  };
  return { selected, toggle, clear, apply, isRunning };
}
