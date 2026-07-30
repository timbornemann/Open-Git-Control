import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, GitBranch, GitCommitHorizontal, History, Loader2, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { Button, StatusBadge, TextField } from '@/components/ui';
import { useAppToastSetter } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { GitReflogEntryDto } from '@/types/git';
import type { GitCommandNameDto } from '@/types/gitDtos';
import { parseGitReflog } from '@/utils/gitParsing';
import { validateBranchName } from '@/utils/gitRefValidation';
import { DangerConfirm } from './DangerConfirm';
import {
  filterRecoveryEntries,
  formatRecoveryDate,
  getRecoveryLoadViewState,
  getRecoveryEntryKey,
  getRecoverySubjectParts,
  type RecoveryActionId,
  type RecoveryCenterProps,
  type RecoveryDangerAction,
  selectLoadedRecoveryKey,
} from './recovery-center/recoveryCenterUtils';

export const RecoveryCenter: React.FC<RecoveryCenterProps> = ({ repoPath, refreshTrigger, onRepoChanged, settings }) => {
  const { locale, t, tr } = useI18n();
  const setToast = useAppToastSetter();
  const loadSequenceRef = useRef(0);
  const [loadedReflog, setLoadedReflog] = useState<{ repoPath: string | null; entries: GitReflogEntryDto[] }>({
    repoPath: null,
    entries: [],
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchNameTouched, setBranchNameTouched] = useState(false);
  const [pendingAction, setPendingAction] = useState<RecoveryActionId | null>(null);
  const [dangerAction, setDangerAction] = useState<RecoveryDangerAction>(null);
  const entries = useMemo(() => (loadedReflog.repoPath === repoPath ? loadedReflog.entries : []), [loadedReflog, repoPath]);

  const loadReflog = useCallback(async () => {
    const requestId = ++loadSequenceRef.current;
    if (!repoPath || !gitClient.isAvailable()) {
      setLoadedReflog({ repoPath, entries: [] });
      setSelectedKey(null);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await gitClient.runGitCommandForRepo(repoPath, 'reflog', '300');
      if (requestId !== loadSequenceRef.current) return;

      if (!result.success) {
        const message = result.error || tr('Reflog konnte nicht geladen werden.', 'Could not load reflog.');
        setLoadError(message);
        setToast({ msg: message, isError: true });
        return;
      }

      const parsed = parseGitReflog(String(result.data || ''));
      setLoadedReflog({ repoPath, entries: parsed });
      setSelectedKey((current) => selectLoadedRecoveryKey(current, parsed));
    } catch (error: unknown) {
      if (requestId !== loadSequenceRef.current) return;
      const message = error instanceof Error ? error.message : tr('Reflog konnte nicht geladen werden.', 'Could not load reflog.');
      setLoadError(message);
      setToast({ msg: message, isError: true });
    } finally {
      if (requestId === loadSequenceRef.current) setIsLoading(false);
    }
  }, [repoPath, setToast, tr]);

  useEffect(() => {
    void loadReflog();
    return () => {
      loadSequenceRef.current += 1;
    };
  }, [loadReflog, refreshTrigger]);

  const filtered = useMemo(() => filterRecoveryEntries(entries, filter), [entries, filter]);

  const selected = useMemo(() => filtered.find((entry) => getRecoveryEntryKey(entry) === selectedKey) ?? filtered[0] ?? null, [filtered, selectedKey]);
  const selectedEntryKey = selected ? getRecoveryEntryKey(selected) : null;
  const selectedAbbrevHash = selected?.abbrevHash ?? '';

  useEffect(() => {
    setBranchName(selectedAbbrevHash ? `recovery-${selectedAbbrevHash}` : '');
    setBranchNameTouched(false);
  }, [selectedAbbrevHash, selectedEntryKey]);

  const branchNameError = useMemo(() => validateBranchName(branchName), [branchName]);
  const isBusy = pendingAction !== null;

  const runAction = useCallback(
    async (actionId: RecoveryActionId, args: string[], successMessage: string) => {
      if (!repoPath || !gitClient.isAvailable() || args.length === 0 || pendingAction) return;

      setPendingAction(actionId);
      try {
        const result = await gitClient.runGitCommandForRepo(repoPath, args[0] as GitCommandNameDto, ...args.slice(1));
        if (result.success) {
          setToast({ msg: successMessage, isError: false });
          onRepoChanged();
          await loadReflog();
          return;
        }

        setToast({
          msg: result.error || tr('Wiederherstellungsaktion fehlgeschlagen.', 'Recovery action failed.'),
          isError: true,
        });
      } catch (error: unknown) {
        setToast({
          msg: error instanceof Error ? error.message : tr('Wiederherstellungsaktion fehlgeschlagen.', 'Recovery action failed.'),
          isError: true,
        });
      } finally {
        setPendingAction(null);
      }
    },
    [loadReflog, onRepoChanged, pendingAction, repoPath, setToast, tr],
  );

  const runDangerAware = useCallback(
    async (payload: Exclude<RecoveryDangerAction, null>) => {
      if (settings.confirmDangerousOps) {
        setDangerAction(payload);
        return;
      }
      await payload.run();
    },
    [settings.confirmDangerousOps],
  );

  const createRecoveryBranch = (event: React.FormEvent) => {
    event.preventDefault();
    setBranchNameTouched(true);
    if (!selected || branchNameError || isBusy) return;

    const name = branchName.trim();
    void runAction(
      'branch',
      ['checkout', '-b', name, selected.hash],
      tr(`Recovery-Branch "${name}" wurde erstellt.`, `Recovery branch "${name}" was created.`),
    );
  };

  const selectedSubject = selected ? getRecoverySubjectParts(selected.subject) : null;
  const { isInitialLoading, showLoadError, noResults } = getRecoveryLoadViewState(isLoading, entries.length, Boolean(loadError), filtered.length);

  return (
    <section className="recovery-center" aria-label={tr('Recovery Center', 'Recovery Center')}>
      <header className="recovery-center__intro">
        <div className="recovery-center__intro-icon" aria-hidden="true">
          <History size={19} />
        </div>
        <div className="recovery-center__intro-copy">
          <strong>{tr('Verlorene Arbeit sicher wiederfinden', 'Recover lost work safely')}</strong>
          <span>
            {tr(
              'Wähle einen früheren Zustand und erstelle daraus am besten einen neuen Branch.',
              'Choose an earlier state and preferably create a new branch from it.',
            )}
          </span>
        </div>
        <div className="recovery-center__intro-actions">
          <StatusBadge tone="info">{tr(`${entries.length} Einträge`, `${entries.length} entries`)}</StatusBadge>
          <Button
            size="xs"
            variant="secondary"
            icon={<RefreshCw size={12} className={isLoading ? 'spin' : ''} />}
            onClick={() => void loadReflog()}
            disabled={isLoading || isBusy || !repoPath}
          >
            {tr('Aktualisieren', 'Refresh')}
          </Button>
        </div>
      </header>

      <div className="recovery-center__layout">
        <aside className="recovery-center__history" aria-label={tr('Wiederherstellungspunkte', 'Recovery points')}>
          <div className="recovery-center__history-toolbar">
            <div className="recovery-center__section-heading">
              <span>{tr('Verlauf', 'History')}</span>
              <small>{tr('Neueste zuerst', 'Newest first')}</small>
            </div>
            <label className="recovery-center__search">
              <Search size={14} aria-hidden="true" />
              <TextField
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('generated.components.recoverycenter.filter_reflog_commit_action_date_b0b21090')}
                aria-label={t('generated.components.recoverycenter.filter_reflog_commit_action_date_b0b21090')}
              />
            </label>
          </div>

          <div className="recovery-center__history-list" aria-busy={isLoading}>
            {isInitialLoading &&
              Array.from({ length: 5 }, (_, index) => (
                <div className="recovery-center__skeleton" key={index} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ))}

            {showLoadError && loadError && (
              <div className="recovery-center__empty recovery-center__empty--error" role="alert">
                <AlertTriangle size={22} />
                <strong>{tr('Verlauf nicht verfügbar', 'History unavailable')}</strong>
                <span>{loadError}</span>
                <Button size="xs" variant="secondary" icon={<RefreshCw size={12} />} onClick={() => void loadReflog()}>
                  {tr('Erneut versuchen', 'Try again')}
                </Button>
              </div>
            )}

            {noResults && (
              <div className="recovery-center__empty">
                <History size={22} />
                <strong>
                  {filter.trim()
                    ? t('generated.components.recoverycenter.no_reflog_entries_found_78f44a49')
                    : tr('Noch keine Wiederherstellungspunkte', 'No recovery points yet')}
                </strong>
                <span>
                  {filter.trim()
                    ? tr('Passe den Filter an, um andere Einträge zu sehen.', 'Adjust the filter to see other entries.')
                    : tr(
                        'Git zeigt hier frühere HEAD-Zustände an, sobald sie verfügbar sind.',
                        'Git will show earlier HEAD states here once they are available.',
                      )}
                </span>
                {filter.trim() && (
                  <Button size="xs" variant="ghost" onClick={() => setFilter('')}>
                    {tr('Filter zurücksetzen', 'Clear filter')}
                  </Button>
                )}
              </div>
            )}

            {!isInitialLoading &&
              filtered.map((entry) => {
                const key = getRecoveryEntryKey(entry);
                const subject = getRecoverySubjectParts(entry.subject);
                const isSelected = selectedEntryKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`recovery-center__history-item${isSelected ? ' is-selected' : ''}`}
                    onClick={() => setSelectedKey(key)}
                    aria-pressed={isSelected}
                  >
                    <span className="recovery-center__history-item-topline">
                      <code>{entry.selector}</code>
                      <time>{formatRecoveryDate(entry.date, locale)}</time>
                    </span>
                    <span className="recovery-center__history-item-subject">{subject.description}</span>
                    <span className="recovery-center__history-item-meta">
                      <span>{subject.action}</span>
                      <code>{entry.abbrevHash}</code>
                    </span>
                  </button>
                );
              })}
          </div>
        </aside>

        <main className="recovery-center__detail">
          {!selected || !selectedSubject ? (
            <div className="recovery-center__empty recovery-center__empty--detail">
              <GitCommitHorizontal size={26} />
              <strong>{t('generated.components.recoverycenter.select_a_reflog_entry_2e3edbe5')}</strong>
              <span>
                {tr(
                  'Danach werden sichere und erweiterte Aktionen für diesen Zustand angezeigt.',
                  'Safe and advanced actions for that state will appear here.',
                )}
              </span>
            </div>
          ) : (
            <div className="recovery-center__detail-content">
              <div className="recovery-center__selection">
                <div className="recovery-center__selection-heading">
                  <div>
                    <span className="recovery-center__eyebrow">{tr('Ausgewählter Zustand', 'Selected restore point')}</span>
                    <h2>{selectedSubject.description}</h2>
                  </div>
                  <StatusBadge tone="accent">{selectedSubject.action}</StatusBadge>
                </div>
                <div className="recovery-center__selection-meta">
                  <div>
                    <span>{tr('Reflog-Position', 'Reflog position')}</span>
                    <code>{selected.selector}</code>
                  </div>
                  <div>
                    <span>{tr('Commit', 'Commit')}</span>
                    <code title={selected.hash}>{selected.abbrevHash}</code>
                  </div>
                  <div>
                    <span>{tr('Zeitpunkt', 'Date')}</span>
                    <strong>{formatRecoveryDate(selected.date, locale)}</strong>
                  </div>
                </div>
              </div>

              <section className="recovery-center__action-section">
                <div className="recovery-center__action-title">
                  <span className="recovery-center__action-icon recovery-center__action-icon--safe">
                    <GitBranch size={17} />
                  </span>
                  <div>
                    <span className="recovery-center__eyebrow">{tr('Empfohlen', 'Recommended')}</span>
                    <h3>{tr('Recovery-Branch erstellen', 'Create a recovery branch')}</h3>
                    <p>
                      {tr(
                        'Bewahrt diesen Zustand unter einem neuen Namen und checkt ihn direkt aus. Andere Branches bleiben unverändert.',
                        'Preserves this state under a new name and checks it out. Other branches remain unchanged.',
                      )}
                    </p>
                  </div>
                </div>

                <form className="recovery-center__branch-form" onSubmit={createRecoveryBranch}>
                  <label htmlFor="recovery-branch-name">{t('generated.components.recoverycenter.recovery_branch_name_7dd1650e')}</label>
                  <div className="recovery-center__branch-controls">
                    <div className="recovery-center__branch-field">
                      <TextField
                        id="recovery-branch-name"
                        value={branchName}
                        onChange={(event) => setBranchName(event.target.value)}
                        onBlur={() => setBranchNameTouched(true)}
                        aria-invalid={branchNameTouched && Boolean(branchNameError)}
                        aria-describedby={branchNameTouched && branchNameError ? 'recovery-branch-error' : 'recovery-branch-help'}
                        disabled={isBusy}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {!branchNameError && branchName.trim() && <Check className="recovery-center__branch-valid" size={14} aria-hidden="true" />}
                    </div>
                    <Button
                      type="submit"
                      size="md"
                      variant="primary"
                      icon={pendingAction === 'branch' ? <Loader2 size={14} className="spin" /> : <GitBranch size={14} />}
                      disabled={isBusy || Boolean(branchNameError)}
                    >
                      {t('generated.components.recoverycenter.create_branch_from_entry_605eb742')}
                    </Button>
                  </div>
                  {branchNameTouched && branchNameError ? (
                    <span id="recovery-branch-error" className="recovery-center__field-message recovery-center__field-message--error" role="alert">
                      {branchNameError === 'empty'
                        ? tr('Gib einen Branch-Namen ein.', 'Enter a branch name.')
                        : tr(
                            'Verwende einen gültigen Git-Branch-Namen ohne Leerzeichen oder reservierte Zeichen.',
                            'Use a valid Git branch name without spaces or reserved characters.',
                          )}
                    </span>
                  ) : (
                    <span id="recovery-branch-help" className="recovery-center__field-message">
                      {tr('Der Name kann später wie jeder andere lokale Branch geändert werden.', 'You can rename it later like any other local branch.')}
                    </span>
                  )}
                </form>
              </section>

              <section className="recovery-center__advanced">
                <div className="recovery-center__advanced-heading">
                  <div>
                    <span className="recovery-center__eyebrow">{tr('Weitere Optionen', 'Other options')}</span>
                    <h3>{tr('Zustand direkt anwenden', 'Apply the state directly')}</h3>
                  </div>
                  <span>{tr('Nur verwenden, wenn du die Auswirkungen kennst.', 'Use only when you understand the impact.')}</span>
                </div>

                <div className="recovery-center__advanced-action">
                  <span className="recovery-center__action-icon">
                    <GitCommitHorizontal size={16} />
                  </span>
                  <div>
                    <strong>{t('generated.components.recoverycenter.detached_checkout_04424e95')}</strong>
                    <p>
                      {tr(
                        'Wechselt zu diesem Commit, ohne einen Branch zu erstellen. Gut für eine kurze Prüfung.',
                        'Switches to this commit without creating a branch. Useful for a quick inspection.',
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={pendingAction === 'checkout' ? <Loader2 size={13} className="spin" /> : <GitCommitHorizontal size={13} />}
                    disabled={isBusy}
                    onClick={() =>
                      void runDangerAware({
                        title: t('generated.components.recoverycenter.detached_checkout_3c9fd080'),
                        message: t('generated.components.recoverycenter.you_will_checkout_this_commit_directly_without_a_branch_153b7dd0'),
                        confirmLabel: t('generated.components.recoverycenter.run_detached_checkout_b4ea704c'),
                        irreversible: false,
                        consequences: tr(
                          'HEAD ist danach detached. Erstelle einen Branch, bevor du neue Commits dauerhaft behalten möchtest.',
                          'HEAD will be detached. Create a branch before making commits you want to keep.',
                        ),
                        contextItems: [
                          { label: tr('Reflog-Position', 'Reflog position'), value: selected.selector },
                          { label: tr('Commit', 'Commit'), value: selected.abbrevHash },
                        ],
                        run: async () =>
                          runAction(
                            'checkout',
                            ['checkout', selected.hash],
                            tr(`Commit ${selected.abbrevHash} wurde ausgecheckt.`, `Checked out commit ${selected.abbrevHash}.`),
                          ),
                      })
                    }
                  >
                    {tr('Auschecken', 'Check out')}
                  </Button>
                </div>

                <div className="recovery-center__advanced-action recovery-center__advanced-action--danger">
                  <span className="recovery-center__action-icon recovery-center__action-icon--danger">
                    <RotateCcw size={16} />
                  </span>
                  <div>
                    <strong>{tr('Hard Reset', 'Hard reset')}</strong>
                    <p>{tr('Setzt HEAD, Index und Working Tree auf diesen Commit zurück.', 'Resets HEAD, the index, and the working tree to this commit.')}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={pendingAction === 'reset' ? <Loader2 size={13} className="spin" /> : <AlertTriangle size={13} />}
                    disabled={isBusy}
                    onClick={() =>
                      void runDangerAware({
                        title: t('generated.components.recoverycenter.run_hard_reset_77b9e84d'),
                        message: t('generated.components.recoverycenter.resets_head_and_working_tree_to_this_reflog_commit_unsav_7ef0a45f'),
                        confirmLabel: t('generated.components.recoverycenter.run_hard_reset_dadae533'),
                        irreversible: true,
                        consequences: tr(
                          'Nicht gesicherte Änderungen im Working Tree und Index gehen dauerhaft verloren.',
                          'Uncommitted changes in the working tree and index will be permanently lost.',
                        ),
                        contextItems: [
                          { label: tr('Reflog-Position', 'Reflog position'), value: selected.selector },
                          { label: tr('Ziel-Commit', 'Target commit'), value: selected.abbrevHash },
                        ],
                        run: async () =>
                          runAction(
                            'reset',
                            ['reset', '--hard', selected.hash],
                            tr(`Repository wurde auf ${selected.abbrevHash} zurückgesetzt.`, `Repository was reset to ${selected.abbrevHash}.`),
                          ),
                      })
                    }
                  >
                    {tr('Zurücksetzen', 'Reset')}
                  </Button>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {dangerAction && (
        <DangerConfirm
          open={true}
          title={dangerAction.title}
          message={dangerAction.message}
          contextItems={dangerAction.contextItems}
          irreversible={dangerAction.irreversible}
          consequences={dangerAction.consequences}
          confirmLabel={dangerAction.confirmLabel}
          onCancel={() => setDangerAction(null)}
          onConfirm={() => {
            const action = dangerAction;
            setDangerAction(null);
            void action.run();
          }}
        />
      )}
    </section>
  );
};
