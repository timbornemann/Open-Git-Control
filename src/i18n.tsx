import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';

export type AppLanguage = 'de' | 'en';

type TranslateFn = (deText: string, enText: string) => string;

type I18nContextValue = {
  language: AppLanguage;
  locale: string;
  tr: TranslateFn;
};

const DEFAULT_LANGUAGE: AppLanguage = 'de';
const TRANSLATABLE_ATTRS = ['title', 'placeholder', 'aria-label'] as const;
type TranslatableAttr = (typeof TRANSLATABLE_ATTRS)[number];

const LEGACY_TEXT_MAP_EN: Record<string, string> = {
  'Bitte wähle ein Repository aus, um den Graphen zu sehen.': 'Please select a repository to view the graph.',
  'Bitte wÃ¤hle ein Repository aus, um den Graphen zu sehen.': 'Please select a repository to view the graph.',
  'Lade Commit-Historie...': 'Loading commit history...',
  'Keine Commits gefunden.': 'No commits found.',
  'Commits durchsuchen (Hash, Autor, Nachricht, Ref)': 'Search commits (hash, author, message, ref)',
  'Alles': 'All',
  'Nachricht': 'Message',
  'Autor': 'Author',
  'Refs': 'Refs',
  'Mehr laden': 'Load more',
  'Lade weitere Commits…': 'Loading more commits...',
  'Lade weitere Commitsâ€¦': 'Loading more commits...',
  'Klicken zum Stage / Commit': 'Click for stage / commit',
  'Branch aus Commit auschecken': 'Checkout branch from commit',
  'Es wird ein neuer Branch auf Basis dieses Commits erstellt und ausgecheckt.': 'A new branch based on this commit will be created and checked out.',
  'Neuer Branch-Name': 'New branch name',
  'Befehl': 'Command',
  'Hinweis': 'Hint',
  'Working Tree ist nicht sauber': 'Working tree is dirty',
  'Du wechselst auf den neuen Branch. Der aktuelle Branch bleibt unveraendert.': 'You switch to the new branch. The current branch remains unchanged.',
  'Branch erstellen': 'Create branch',
  'Nur Commit (detached HEAD) auschecken...': 'Checkout commit only (detached HEAD)...',
  'Detached HEAD aktivieren?': 'Enable detached HEAD?',
  'Du checkst direkt auf den Commit aus und arbeitest temporaer ohne Branch.': 'You checkout the commit directly and work temporarily without a branch.',
  'Modus': 'Mode',
  'Neue Commits sind spaeter schwerer auffindbar, bis du einen Branch erstellst.': 'New commits can be harder to find later until you create a branch.',
  'Trotzdem auschecken': 'Checkout anyway',
  'Neuen Branch erstellen...': 'Create new branch...',
  'Neuen Branch erstellen': 'Create new branch',
  'Der neue Branch zeigt auf den ausgewaehlten Commit.': 'The new branch points to the selected commit.',
  'Branch-Name': 'Branch name',
  'Tag erstellen...': 'Create tag...',
  'Tag auf Commit erstellen': 'Create tag on commit',
  'Lege einen lightweight oder annotierten Tag an.': 'Create a lightweight or annotated tag.',
  'Tag-Name': 'Tag name',
  'Tag-Nachricht (optional)': 'Tag message (optional)',
  'Leer lassen fuer lightweight Tag': 'Leave empty for lightweight tag',
  'Der Tag markiert diesen Commit lokal. Push auf Remote erfolgt separat.': 'The tag marks this commit locally. Push to remote happens separately.',
  'Soft Reset ausfuehren?': 'Run soft reset?',
  'HEAD wird auf den Commit gesetzt, Aenderungen bleiben staged.': 'HEAD will be set to the commit, changes stay staged.',
  'Reset-Modus': 'Reset mode',
  'Die Commit-Historie wird lokal verschoben.': 'Commit history will be moved locally.',
  'Soft Reset': 'Soft reset',
  'Mixed Reset ausfuehren?': 'Run mixed reset?',
  'HEAD wird verschoben, Aenderungen bleiben unstaged im Working Tree.': 'HEAD will be moved, changes stay unstaged in working tree.',
  'Index wird zurueckgesetzt. Commit-Historie aendert sich lokal.': 'Index will be reset. Commit history changes locally.',
  'Mixed Reset': 'Mixed reset',
  'Hard Reset ausfuehren?': 'Run hard reset?',
  'HEAD, Index und Working Tree werden auf den Commit zurueckgesetzt.': 'HEAD, index and working tree will be reset to the commit.',
  'Lokale nicht-gesicherte Aenderungen gehen verloren.': 'Local uncommitted changes will be lost.',
  'Hard Reset': 'Hard reset',
  'Interaktiven Rebase starten...': 'Start interactive rebase...',
  'Interaktiven Rebase bis zu diesem Commit starten?': 'Start interactive rebase up to this commit?',
  'Der Editor wird geoeffnet, um Rebase-Schritte festzulegen.': 'The editor opens to define rebase steps.',
  'Basis-Commit': 'Base commit',
  'Ablauf': 'Flow',
  'Commit-Reihenfolge kann geaendert, zusammengefuehrt oder entfernt werden.': 'Commit order can be changed, squashed, or removed.',
  'Rebase starten': 'Start rebase',
  'Merge-Commit revertieren?': 'Revert merge commit?',
  'Der Merge-Commit wird mit Parent 1 als Hauptlinie reverted.': 'The merge commit is reverted with parent 1 as mainline.',
  'Merge-Commit': 'Merge commit',
  'Parent': 'Parent',
  'Es entsteht ein neuer Revert-Commit und moegliche Konflikte muessen geloest werden.': 'A new revert commit is created and possible conflicts must be resolved.',
  'Merge-Revert': 'Merge revert',
  'Datei-Aenderungen verwerfen?': 'Discard file changes?',
  'Alle nicht gespeicherten Aenderungen dieser Datei werden verworfen.': 'All unsaved changes of this file will be discarded.',
  'Datei': 'File',
  'Bereich': 'Scope',
  'Unstaged Working Tree': 'Unstaged working tree',
  'Die verworfenen Zeilen koennen nicht aus Git wiederhergestellt werden.': 'Discarded lines cannot be restored from Git.',
  'Aenderungen verwerfen': 'Discard changes',
  'Alle unstaged Aenderungen verwerfen?': 'Discard all unstaged changes?',
  'Alle lokalen unstaged Aenderungen werden auf den letzten Commit zurueckgesetzt.': 'All local unstaged changes will be reset to the last commit.',
  'Umfang': 'Scope',
  'Gesamtes Repository': 'Entire repository',
  'Betrifft': 'Affects',
  'Nur unstaged Dateien': 'Only unstaged files',
  'Nicht gespeicherte Aenderungen gehen unwiderruflich verloren.': 'Unsaved changes will be irreversibly lost.',
  'Alles verwerfen': 'Discard all',
  'Untracked Datei loeschen?': 'Delete untracked file?',
  'Die Datei ist nicht versioniert und wird direkt vom Dateisystem entfernt.': 'The file is untracked and will be removed from filesystem.',
  'Git-Status': 'Git status',
  'Die Datei ist danach ohne Backup nicht wiederherstellbar.': 'The file cannot be restored without backup afterwards.',
  'Datei loeschen': 'Delete file',
  'Aenderungen stashen': 'Stash changes',
  'Optional eine Nachricht fuer den neuen Stash hinterlegen.': 'Optionally add a message for the new stash.',
  'Stash-Nachricht (optional)': 'Stash message (optional)',
  'z.B. WIP: Feature XYZ': 'e.g. WIP: feature XYZ',
  '(unbekannt)': '(unknown)',
  'Aenderungen werden temporaer aus dem Working Tree entfernt und im Stash gespeichert.': 'Changes are temporarily removed from working tree and stored in stash.',
  'Stash erstellen': 'Create stash',
  'Staged Diff': 'Staged diff',
  'Unstaged Diff': 'Unstaged diff',
  'Merge abbrechen?': 'Abort merge?',
  'Der laufende Merge wird verworfen und auf den Zustand vor dem Merge zurueckgesetzt.': 'Current merge will be discarded and reset to state before merge.',
  'Aktion': 'Action',
  'Alle noch nicht gesicherten Merge-Konfliktaufloesungen gehen verloren.': 'All unsaved merge conflict resolutions will be lost.',
  'Merge abgebrochen': 'Merge aborted',
  'Rebase abbrechen?': 'Abort rebase?',
  'Der laufende Rebase wird verworfen und der vorherige Branch-Zustand wiederhergestellt.': 'Current rebase will be discarded and previous branch state restored.',
  'Alle noch nicht gesicherten Rebase-Aufloesungen gehen verloren.': 'All unsaved rebase resolutions will be lost.',
  'Rebase abgebrochen': 'Rebase aborted',
  'KI Auto-Commit ist in den Einstellungen deaktiviert.': 'AI auto-commit is disabled in settings.',
  'Bitte in den Einstellungen zuerst ein KI-Modell auswaehlen.': 'Please choose an AI model in settings first.',
  'Bitte zuerst alle Konflikte aufloesen.': 'Please resolve all conflicts first.',
  'Keine Aenderungen fuer KI Auto-Commit vorhanden.': 'No changes available for AI auto-commit.',
  'KI Auto-Commit fehlgeschlagen.': 'AI auto-commit failed.',
  'KI hat keine Commits erstellt.': 'AI did not create commits.',
  'Bitte zuerst Dateien stagen.': 'Please stage files first.',
  'Commit erfolgreich!': 'Commit successful!',
  'Commit fehlgeschlagen': 'Commit failed',
  'Lade Status...': 'Loading status...',
  'Datei suchen...': 'Search file...',
  'Konflikte': 'Conflicts',
  'Staged Diff-Statistik': 'Staged diff stats',
  'Unstaged Diff-Statistik': 'Unstaged diff stats',
  'Working Tree ist sauber.': 'Working tree is clean.',
  'Merge fortsetzen': 'Continue merge',
  'Abbrechen': 'Cancel',
  'Rebase continue': 'Continue rebase',
  'Rebase abort': 'Abort rebase',
  'Konflikt': 'Conflict',
  'Take ours': 'Take ours',
  'Take theirs': 'Take theirs',
  'Diff anzeigen': 'Show diff',
  'Als geloest markieren': 'Mark as resolved',
  'Staged Changes': 'Staged changes',
  'Alle unstagen': 'Unstage all',
  'Changes': 'Changes',
  'Alle stagen': 'Stage all',
  'Alle verwerfen': 'Discard all',
  'Alle untracked stagen': 'Stage all untracked',
  'Konflikte aufloesen, danach committen...': 'Resolve conflicts, then commit...',
  'Commit-Titel...': 'Commit title...',
  'Commit-Beschreibung (optional)...': 'Commit description (optional)...',
  'Offene Konflikte blockieren Commit': 'Open conflicts block commit',
  'KI entscheidet Staging + Commit-Nachrichten automatisch.': 'AI decides staging + commit messages automatically.',
  'In Settings zuerst KI Auto-Commit aktivieren.': 'Enable AI auto-commit in settings first.',
  'KI arbeitet...': 'AI is working...',
  'KI Auto-Commit': 'AI auto-commit',
  'Datei zu .gitignore hinzufuegen': 'Add file to .gitignore',
  'Ordner ignorieren': 'Ignore folder',
  'Oberordner ignorieren': 'Ignore top-level folder',
  'Dateityp ignorieren': 'Ignore file type',
};

const LEGACY_REGEX_REPLACERS_EN: Array<[RegExp, string]> = [
  [/^Checkout \(Branch von ([^)]+)\)$/, 'Checkout (branch from $1)'],
  [/^Cherry-Pick (.+)$/, 'Cherry-pick $1'],
  [/^Revert (.+)$/, 'Revert $1'],
  [/^Reset --soft auf (.+)$/, 'Reset --soft to $1'],
  [/^Reset --mixed auf (.+)$/, 'Reset --mixed to $1'],
  [/^Reset --hard auf (.+)$/, 'Reset --hard to $1'],
  [/^Rebase \.\.\. auf (.+)$/, 'Rebase ... onto $1'],
  [/^Merge-Revert (.+)$/, 'Merge revert $1'],
  [/^vor (\d+)d$/, '$1d ago'],
  [/^(\d+) Treffer$/, '$1 matches'],
  [/^(\d+) sichtbar$/, '$1 visible'],
  [/^Konflikte \((\d+)\)$/, 'Conflicts ($1)'],
  [/^PR #([0-9]+) Branch geladen\.$/, 'Loaded branch for PR #$1.'],
  [/^PR #([0-9]+) wird geladen\.\.\.$/, 'Loading PR #$1...'],
  [/^PR-Branch (.+) ausgecheckt\.$/, 'Checked out PR branch $1.'],
  [/^Branch "(.+)" erstellt\.$/, 'Created branch "$1".'],
  [/^Branch "(.+)" geloescht\.$/, 'Deleted branch "$1".'],
  [/^Tag "(.+)" erstellt\.$/, 'Created tag "$1".'],
  [/^Tag "(.+)" geloescht\.$/, 'Deleted tag "$1".'],
  [/^Remote "(.+)" hinzugefuegt\.$/, 'Added remote "$1".'],
  [/^Remote "(.+)" entfernt\.$/, 'Removed remote "$1".'],
  [/^Ignore-Regel hinzugefuegt: (.+)$/, 'Added ignore rule: $1'],
  [/^Regel existiert bereits: (.+)$/, 'Rule already exists: $1'],
  [/^([0-9]+) untracked Datei(en)? gestaged$/, 'Staged $1 untracked files'],
  [/^(.+): ours uebernommen$/, '$1: took ours'],
  [/^(.+): theirs uebernommen$/, '$1: took theirs'],
  [/^(.+) als geloest markiert$/, 'Marked $1 as resolved'],
  [/^(.+) gestaged$/, 'Staged $1'],
  [/^(.+) unstaged$/, 'Unstaged $1'],
  [/^(.+) verworfen$/, 'Discarded $1'],
  [/^(.+) geloescht$/, 'Deleted $1'],
];

const getLocale = (language: AppLanguage): string => {
  return language === 'en' ? 'en-US' : 'de-DE';
};

export const trByLanguage = (language: AppLanguage, deText: string, enText: string): string => {
  return language === 'en' ? enText : deText;
};

const translateLegacyToEn = (value: string): string => {
  if (!value) return value;

  const exact = LEGACY_TEXT_MAP_EN[value];
  if (exact) return exact;

  let next = value;
  for (const [pattern, replacement] of LEGACY_REGEX_REPLACERS_EN) {
    next = next.replace(pattern, replacement);
  }

  return next;
};

const LEGACY_TEXT_MAP_DE: Record<string, string> = {
  'Datei-Aenderungen verwerfen?': 'Datei-Änderungen verwerfen?',
  'Alle nicht gespeicherten Aenderungen dieser Datei werden verworfen.': 'Alle nicht gespeicherten Änderungen dieser Datei werden verworfen.',
  'Aenderungen verwerfen': 'Änderungen verwerfen',
  'Alle unstaged Aenderungen verwerfen?': 'Alle unstaged Änderungen verwerfen?',
  'Alle lokalen unstaged Aenderungen werden auf den letzten Commit zurueckgesetzt.': 'Alle lokalen unstaged Änderungen werden auf den letzten Commit zurückgesetzt.',
  'Nicht gespeicherte Aenderungen gehen unwiderruflich verloren.': 'Nicht gespeicherte Änderungen gehen unwiderruflich verloren.',
  'Untracked Datei loeschen?': 'Untracked Datei löschen?',
  'Datei loeschen': 'Datei löschen',
  'Aenderungen stashen': 'Änderungen stashen',
  'Optional eine Nachricht fuer den neuen Stash hinterlegen.': 'Optional eine Nachricht für den neuen Stash hinterlegen.',
  'Aenderungen werden temporaer aus dem Working Tree entfernt und im Stash gespeichert.': 'Änderungen werden temporär aus dem Working Tree entfernt und im Stash gespeichert.',
  'Der laufende Merge wird verworfen und auf den Zustand vor dem Merge zurueckgesetzt.': 'Der laufende Merge wird verworfen und auf den Zustand vor dem Merge zurückgesetzt.',
  'Alle noch nicht gesicherten Merge-Konfliktaufloesungen gehen verloren.': 'Alle noch nicht gesicherten Merge-Konfliktauflösungen gehen verloren.',
  'Alle noch nicht gesicherten Rebase-Aufloesungen gehen verloren.': 'Alle noch nicht gesicherten Rebase-Auflösungen gehen verloren.',
  'Bitte in den Einstellungen zuerst ein KI-Modell auswaehlen.': 'Bitte in den Einstellungen zuerst ein KI-Modell auswählen.',
  'Bitte zuerst alle Konflikte aufloesen.': 'Bitte zuerst alle Konflikte auflösen.',
  'Keine Aenderungen fuer KI Auto-Commit vorhanden.': 'Keine Änderungen für KI Auto-Commit vorhanden.',
  'Als geloest markieren': 'Als gelöst markieren',
  'Konflikte aufloesen, danach committen...': 'Konflikte auflösen, danach committen...',
  'Datei zu .gitignore hinzufuegen': 'Datei zu .gitignore hinzufügen',
};

const LEGACY_REGEX_REPLACERS_DE: Array<[RegExp, string]> = [
  [/^Branch \"(.+)\" geloescht\.$/, 'Branch "$1" gelöscht.'],
  [/^Tag \"(.+)\" geloescht\.$/, 'Tag "$1" gelöscht.'],
  [/^(.+) geloescht$/, '$1 gelöscht'],
  [/^(.+) als geloest markiert$/, '$1 als gelöst markiert'],
  [/^(.+): ours uebernommen$/, '$1: ours übernommen'],
  [/^(.+): theirs uebernommen$/, '$1: theirs übernommen'],
  [/^Ignore-Regel hinzugefuegt: (.+)$/, 'Ignore-Regel hinzugefügt: $1'],
  [/^Remote \"(.+)\" hinzugefuegt\.$/, 'Remote "$1" hinzugefügt.'],
];

const normalizeLegacyGerman = (value: string): string => {
  if (!value) return value;

  const exact = LEGACY_TEXT_MAP_DE[value];
  if (exact) return exact;

  let next = value;
  for (const [pattern, replacement] of LEGACY_REGEX_REPLACERS_DE) {
    next = next.replace(pattern, replacement);
  }

  return next;
};

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANGUAGE,
  locale: getLocale(DEFAULT_LANGUAGE),
  tr: (deText) => deText,
});

type I18nProviderProps = {
  language: AppLanguage;
  children: React.ReactNode;
};

export const I18nProvider: React.FC<I18nProviderProps> = ({ language, children }) => {
  const originalTextNodesRef = useRef(new WeakMap<Text, string>());
  const originalAttrsRef = useRef(new WeakMap<Element, Partial<Record<TranslatableAttr, string>>>());

  const value = useMemo<I18nContextValue>(() => {
    const locale = getLocale(language);
    return {
      language,
      locale,
      tr: (deText, enText) => trByLanguage(language, deText, enText),
    };
  }, [language]);

  useEffect(() => {
    const root = document.body;
    if (!root) return;

    const processTextNode = (node: Text) => {
      if (!node.parentElement) return;
      const tag = node.parentElement.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;

      const original = originalTextNodesRef.current.get(node) ?? node.data;

      if (language === 'en') {
        if (!originalTextNodesRef.current.has(node)) {
          originalTextNodesRef.current.set(node, node.data);
        }
        const translated = translateLegacyToEn(original);
        if (translated !== node.data) {
          node.data = translated;
        }
        return;
      }

      const normalized = normalizeLegacyGerman(original);
      if (normalized !== node.data) {
        node.data = normalized;
      }
      originalTextNodesRef.current.delete(node);
    };

    const processAttributes = (element: Element) => {
      for (const attr of TRANSLATABLE_ATTRS) {
        if (!element.hasAttribute(attr)) continue;

        const originalAttrs = originalAttrsRef.current.get(element) || {};
        const currentValue = element.getAttribute(attr) || '';
        const originalValue = originalAttrs[attr] ?? currentValue;

        if (language === 'en') {
          if (!(attr in originalAttrs)) {
            originalAttrs[attr] = currentValue;
            originalAttrsRef.current.set(element, originalAttrs);
          }
          const translated = translateLegacyToEn(originalValue);
          if (translated !== currentValue) {
            element.setAttribute(attr, translated);
          }
          continue;
        }

        const normalized = normalizeLegacyGerman(originalValue);
        if (normalized !== currentValue) {
          element.setAttribute(attr, normalized);
        }

        delete originalAttrs[attr];
        if (Object.keys(originalAttrs).length === 0) {
          originalAttrsRef.current.delete(element);
        } else {
          originalAttrsRef.current.set(element, originalAttrs);
        }
      }
    };

    const processNodeDeep = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        processTextNode(node as Text);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as Element;
      processAttributes(element);
      for (const child of Array.from(element.childNodes)) {
        processNodeDeep(child);
      }
    };

    processNodeDeep(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          processTextNode(mutation.target as Text);
        }

        if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          processAttributes(mutation.target as Element);
        }

        if (mutation.type === 'childList') {
          for (const addedNode of Array.from(mutation.addedNodes)) {
            processNodeDeep(addedNode);
          }
        }
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRS],
    });

    return () => observer.disconnect();
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => useContext(I18nContext);

