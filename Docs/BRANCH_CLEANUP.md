# Branch cleanup assistant / Branch-Aufräumassistent

## Deutsch

Das Drei-Punkte-Menü **Branch-Aktionen** steht neben dem Plus-Button der Branch-Liste zur Verfügung. Hover, Klick oder Tastatur öffnen das Menü; erst **Branches aufräumen …** startet die Analyse. Der Assistent läuft ausschließlich auf ausdrücklichen Aufruf und hat keinen Hintergrundtimer.

1. Die App prüft die konfigurierten Server mit den vorhandenen Zugangsdaten und lädt fehlende Git-Objekte. Dabei entfernt sie keine Referenzen und verändert keine Tags. Unterschiedliche Fetch- und Push-Adressen werden getrennt behandelt.
2. Im Modal sind lokale und Server-Vorschläge getrennt auswählbar. Jede Zeile erklärt den Vorschlag oder die Sperre und zeigt Commit-Stand, Vergleichsziel, letzten Commit sowie gegebenenfalls Upstream und Worktree-Pfade.
3. Nachweislich zusammengeführte lokale Branches sind vorausgewählt. Server-Branches und verwaiste Branches bleiben zunächst abgewählt. Vergleichsziele lassen sich ändern; eine erneute Prüfung erstellt eine neue Auswahl.
4. Die abschließende Schaltfläche nennt die Anzahl lokaler und Server-Löschungen. Für Branches mit nicht übernommenen Commits folgt eine gesonderte Prüfung mit ausdrücklicher Zusatzbestätigung.
5. Das Ergebnis unterscheidet gelöschte, übersprungene, fehlgeschlagene und ungeklärte Aktionen. Bei einem ungeklärten Server-Ergebnis **Erneut prüfen** verwenden; der Assistent wiederholt keine Löschung automatisch.

### Vorschläge und Schutz

- Vergleichsziel ist zunächst der Standardbranch des jeweiligen Servers. Für lokale Branches wird der konfigurierte Hosting-Remote bevorzugt, sonst `origin` oder das einzige Remote. Ohne eindeutiges Ziel ist eine Auswahl nötig.
- Ein Branch ist zusammengeführt, wenn sein Tip im Zielverlauf enthalten ist. Squash-/Rebase-Merges können zusätzlich durch einen abgeschlossenen Pull-/Merge-Request mit exakt passendem Quell-Commit und nachweisbarem Merge-Ergebnis belegt werden.
- Ein lokaler Branch gilt als verwaist, wenn sein eingerichteter Upstream nach einer vollständigen Server-Prüfung fehlt oder das konfigurierte Remote nicht mehr existiert. Ein Branch ohne Upstream ist deshalb noch kein Aufräumkandidat.
- Ein Server-Branch gilt nach mindestens 90 Tagen ohne Commit, ohne lokale Zuordnung und ohne offenen Pull-/Merge-Request als möglicherweise verwaist. Das ist ein Vorschlag zur Durchsicht, kein Nachweis, dass die Arbeit entbehrlich ist.
- Aktuelle Branches, alle registrierten Worktree-Zuordnungen einschließlich fehlender oder gesperrter Worktrees, Vergleichs-/Standardbranches und serverseitig geschützte Branches bleiben erhalten. Offene Requests einschließlich Entwürfen sowie laufende Git-Sequencer-Vorgänge werden berücksichtigt.
- `main`, `master`, `develop` und `development` bleiben immer geschützt. Unter **Zusätzlicher Branch-Schutz** können weitere Namen oder Muster mit `*` gespeichert werden. Die lokale Einstellung gilt gemeinsam für sämtliche Worktrees dieses Repositorys und bleibt bei Cache-Bereinigungen erhalten.

GitHub, Forgejo, GitLab und Bitbucket liefern Schutz- und Request-Daten über ihre vorhandenen Hosting-Verbindungen. Fehlende Berechtigungen, nicht unterstützte Regeln, Rate-Limits oder unvollständige Antworten sperren die Server-Löschung. Lokale Ergebnisse bleiben mit einem Hinweis auf den eingeschränkten beziehungsweise älteren Stand verfügbar. Unvollständige Git-Historien geben keine sichere Löschung frei.

### Bestätigung und Änderungen während der Prüfung

Prüfungen gelten höchstens 15 Minuten und gehören zum jeweiligen Fenster, Repository sowie Remote-/Kontostand. Vor der Ausführung prüft die App den Zustand erneut. Geänderte Kandidaten werden übersprungen. Lokale Löschungen vergleichen den erwarteten Commit atomar; Server-Löschungen verwenden eine explizite SHA-Lease und werden danach überprüft.

Bei gemeinsam ausgewähltem lokalem und Server-Branch erfolgt zuerst die Server-Löschung. Scheitert sie oder bleibt ihr Ergebnis ungeklärt, bleibt das lokale Gegenstück erhalten. Erfolgreiche Einzelschritte werden bei späteren Fehlern nicht zurückgerollt. Escape beziehungsweise **Weitere Löschungen stoppen** stoppt ausstehende Schritte; bereits gestartete Aktionen werden noch ausgewertet. Ein Repository-Wechsel beendet den alten Ablauf.

## English

The **Branch actions** three-dot menu is next to the branch add button. Open it by hovering, clicking or using the keyboard; choose **Clean up branches …** to start analysis. The assistant runs only when requested and has no background timer.

1. The app inspects configured servers using existing credentials and downloads missing Git objects. Inspection removes no references and changes no tags. Different fetch and push URLs are inspected separately.
2. Review local and server suggestions independently. Each row explains its suggestion or block and shows the captured commit, comparison target, last commit and any upstream/worktree paths.
3. Proven merged local branches are preselected. Server and orphaned branches start unselected. Changing a comparison target or inspecting again creates a fresh selection.
4. The final button states the local and server deletion counts. Branches containing unmerged commits require a separate review and explicit additional confirmation.
5. Results distinguish deleted, skipped, failed and unknown actions. Use **Inspect again** after an unknown server outcome; deletion is never retried automatically.

### Suggestions and protection

- Comparisons initially use each server's default branch. Local branches prefer the configured hosting remote, then `origin` or the only remote. An ambiguous target requires a selection.
- A branch is merged when its tip is contained in the target history. A completed pull/merge request can also prove a squash/rebase merge when its exact source commit matches and its merge result is contained in the target.
- A local branch is orphaned when its configured upstream is absent from a complete server inventory or its configured remote no longer exists. Merely having no upstream is not evidence of an orphaned branch.
- A server branch may be orphaned after at least 90 days without a commit, with no local counterpart and no open pull/merge request. This is a suggestion to review, not proof that the work is disposable.
- Current branches, every registered worktree branch including missing/locked worktrees, comparison/default branches and server-protected branches are retained. Open requests including drafts and active Git sequencer operations are considered.
- `main`, `master`, `develop` and `development` are always protected. **Additional branch protection** accepts more names or patterns using `*`. Preferences are shared by all worktrees of the repository and survive cache cleanup.

GitHub, Forgejo, GitLab and Bitbucket protection/request data use existing hosting connections. Missing permissions, unsupported rules, rate limits and incomplete responses block server deletion. Local results remain available with a warning about limited or older information. Incomplete Git histories do not authorize safe deletion.

### Confirmation and concurrent changes

Inspections expire after 15 minutes and are bound to the window, repository, remote configuration and account state. The app rechecks before execution and skips changed candidates. Local deletions atomically compare the expected commit; server deletions use an explicit SHA lease and are verified afterwards.

When both counterparts are selected, server deletion runs first. A failed or unknown server result preserves the local counterpart. Successful steps are not rolled back after later failures. Escape or **Stop further deletions** stops pending steps while already-started operations are evaluated. Switching repositories ends the previous workflow.
