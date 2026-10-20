# Branch cleanup assistant / Branch-Aufräumassistent

## Deutsch

Das Drei-Punkte-Menü **Branch-Aktionen** steht neben dem Plus-Button der Branch-Liste zur Verfügung. Hover, Klick oder Tastatur öffnen das Menü; erst **Branches aufräumen …** startet die Analyse. Der Assistent läuft ausschließlich auf ausdrücklichen Aufruf und hat keinen Hintergrundtimer.

1. Die App prüft die konfigurierten Server mit den vorhandenen Zugangsdaten und lädt fehlende Git-Objekte. Dabei entfernt sie keine Referenzen und verändert keine Tags. Unterschiedliche Fetch- und Push-Adressen werden getrennt behandelt.
2. Im Modal sind lokale und Server-Vorschläge getrennt auswählbar. Jede Zeile erklärt den Vorschlag oder die Sperre und zeigt Commit-Stand, Vergleichsziel, letzten Commit sowie gegebenenfalls Upstream und Worktree-Pfade.
3. Nachweislich zusammengeführte lokale Branches sind vorausgewählt. Server-Branches und verwaiste Branches bleiben zunächst abgewählt. Unter **Weitere lokale Branches – manuell prüfen** lassen sich zusätzlich nicht als zusammengeführt erkannte lokale Branches einzeln auswählen. Dafür ist immer eine Zusatzbestätigung erforderlich. Vergleichsziele lassen sich ändern; eine erneute Prüfung erstellt eine neue Auswahl.
4. Die abschließende Schaltfläche nennt die Anzahl lokaler und Server-Löschungen. Für Branches mit nicht übernommenen Commits folgt eine gesonderte Prüfung mit ausdrücklicher Zusatzbestätigung.
5. Das Ergebnis unterscheidet gelöschte, übersprungene, fehlgeschlagene und ungeklärte Aktionen. Bei einem ungeklärten Server-Ergebnis **Erneut prüfen** verwenden; der Assistent wiederholt keine Löschung automatisch.

### Vorschläge und Schutz

- Für lokale Branches dient zunächst die lokale Version des Standardbranches als Vergleichsziel. Dabei wird der Standardbranch des konfigurierten Hosting-Remotes bevorzugt, sonst von `origin` oder dem einzigen Remote. So werden auch Branches erkannt, die bereits im lokalen `main` enthalten sind, bevor dieser gepusht wurde. Enthält der Server-Standardbranch den gesamten lokalen Stand und zusätzliche Commits, wird stattdessen der Serverstand verwendet. Ohne lokale Version dient ebenfalls der Serverstand als Ziel; ohne erreichbaren Server kann ein eindeutiger lokaler `main` oder `master` verwendet werden. Ohne eindeutiges Ziel ist eine Auswahl nötig. Server-Branches werden unabhängig davon gegen den Standardbranch des jeweiligen Servers geprüft.
- Ein Branch ist zusammengeführt, wenn sein Tip im Zielverlauf enthalten ist. Squash-/Rebase-Merges können zusätzlich durch einen abgeschlossenen Pull-/Merge-Request mit exakt passendem Quell-Commit und nachweisbarem Merge-Ergebnis belegt werden.
- Ein lokaler Branch gilt als verwaist, wenn sein eingerichteter Upstream nach einer vollständigen Server-Prüfung fehlt oder das konfigurierte Remote nicht mehr existiert. Ein Branch ohne Upstream ist deshalb noch kein automatischer Aufräumvorschlag. Er kann nach manueller Auswahl und Zusatzbestätigung gelöscht werden, sofern keine Schutzregel greift.
- Ein Server-Branch gilt nach mindestens 90 Tagen ohne Commit, ohne lokale Zuordnung und ohne offenen Pull-/Merge-Request als möglicherweise verwaist. Das ist ein Vorschlag zur Durchsicht, kein Nachweis, dass die Arbeit entbehrlich ist.
- Aktuelle Branches, alle registrierten Worktree-Zuordnungen einschließlich fehlender oder gesperrter Worktrees, Vergleichs-/Standardbranches und serverseitig geschützte Branches bleiben erhalten. Offene Requests einschließlich Entwürfen sowie laufende Git-Sequencer-Vorgänge werden berücksichtigt. Diese Sperren gelten auch bei manueller Auswahl.
- `main`, `master`, `develop` und `development` bleiben immer geschützt. Unter **Zusätzlicher Branch-Schutz** können weitere Namen oder Muster mit `*` gespeichert werden. Die lokale Einstellung gilt gemeinsam für sämtliche Worktrees dieses Repositorys und bleibt bei Cache-Bereinigungen erhalten.

GitHub, Forgejo, GitLab und Bitbucket liefern Schutz- und Request-Daten über ihre vorhandenen Hosting-Verbindungen. Fehlende Berechtigungen, nicht unterstützte Regeln, Rate-Limits oder unvollständige Antworten sperren die Server-Löschung. Lokale Ergebnisse bleiben mit einem Hinweis auf den eingeschränkten beziehungsweise älteren Stand verfügbar. Unvollständige Git-Historien geben keine sichere Löschung frei.

### Bestätigung und Änderungen während der Prüfung

Prüfungen gelten höchstens 15 Minuten und gehören zum jeweiligen Fenster, Repository sowie Remote-/Kontostand. Vor der Ausführung prüft die App den Zustand erneut. Geänderte Kandidaten werden übersprungen. Lokale Löschungen vergleichen den erwarteten Commit atomar; Server-Löschungen verwenden eine explizite SHA-Lease und werden danach überprüft.

Bei gemeinsam ausgewähltem lokalem und Server-Branch erfolgt zuerst die Server-Löschung. Scheitert sie oder bleibt ihr Ergebnis ungeklärt, bleibt das lokale Gegenstück erhalten. Erfolgreiche Einzelschritte werden bei späteren Fehlern nicht zurückgerollt. Escape beziehungsweise **Weitere Löschungen stoppen** stoppt ausstehende Schritte; bereits gestartete Aktionen werden noch ausgewertet. Ein Repository-Wechsel beendet den alten Ablauf.

## English

The **Branch actions** three-dot menu is next to the branch add button. Open it by hovering, clicking or using the keyboard; choose **Clean up branches …** to start analysis. The assistant runs only when requested and has no background timer.

1. The app inspects configured servers using existing credentials and downloads missing Git objects. Inspection removes no references and changes no tags. Different fetch and push URLs are inspected separately.
2. Review local and server suggestions independently. Each row explains its suggestion or block and shows the captured commit, comparison target, last commit and any upstream/worktree paths.
3. Proven merged local branches are preselected. Server and orphaned branches start unselected. **Other local branches – manual review** also lets you individually select local branches whose integration could not be verified. These always require additional confirmation. Changing a comparison target or inspecting again creates a fresh selection.
4. The final button states the local and server deletion counts. Branches containing unmerged commits require a separate review and explicit additional confirmation.
5. Results distinguish deleted, skipped, failed and unknown actions. Use **Inspect again** after an unknown server outcome; deletion is never retried automatically.

### Suggestions and protection

- Local branches initially use the local version of the default branch, preferring the configured hosting remote's default, then `origin` or the only remote. This recognizes branches already contained in local `main` before it is pushed. If the server's default contains the entire local history plus additional commits, the server version is used instead. The server version is also used when no local counterpart exists; without a reachable server, an unambiguous local `main` or `master` can be used. An ambiguous target requires a selection. Server branches are independently compared with their own server's default branch.
- A branch is merged when its tip is contained in the target history. A completed pull/merge request can also prove a squash/rebase merge when its exact source commit matches and its merge result is contained in the target.
- A local branch is orphaned when its configured upstream is absent from a complete server inventory or its configured remote no longer exists. Merely having no upstream is not an automatic cleanup suggestion. Such a branch can be deleted through manual selection and additional confirmation if no protection rule applies.
- A server branch may be orphaned after at least 90 days without a commit, with no local counterpart and no open pull/merge request. This is a suggestion to review, not proof that the work is disposable.
- Current branches, every registered worktree branch including missing/locked worktrees, comparison/default branches and server-protected branches are retained. Open requests including drafts and active Git sequencer operations are considered. These blocks also apply to manual selection.
- `main`, `master`, `develop` and `development` are always protected. **Additional branch protection** accepts more names or patterns using `*`. Preferences are shared by all worktrees of the repository and survive cache cleanup.

GitHub, Forgejo, GitLab and Bitbucket protection/request data use existing hosting connections. Missing permissions, unsupported rules, rate limits and incomplete responses block server deletion. Local results remain available with a warning about limited or older information. Incomplete Git histories do not authorize safe deletion.

### Confirmation and concurrent changes

Inspections expire after 15 minutes and are bound to the window, repository, remote configuration and account state. The app rechecks before execution and skips changed candidates. Local deletions atomically compare the expected commit; server deletions use an explicit SHA lease and are verified afterwards.

When both counterparts are selected, server deletion runs first. A failed or unknown server result preserves the local counterpart. Successful steps are not rolled back after later failures. Escape or **Stop further deletions** stops pending steps while already-started operations are evaluated. Switching repositories ends the previous workflow.
