# Backlog: Open-Git-Control

Stand: 2026-03-11
Ziel: Fehlende Kernfunktionen und technische Stabilitaet systematisch umsetzen.

## Priorisierung
- P1: Core-Workflow und kritische Developer-Flows.
- P2: Skalierung, Robustheit, UX und Diagnostik.

## TSK-01 [P1] Interaktives Rebase im Commit-Graph
- Problem: Rebase ist nur teilweise vorhanden (Continue/Abort), aber kein gefuehrter Flow fuer Reorder/Squash/Drop.
- Scope:
  - Rebase-Dialog in der Commit-Ansicht.
  - IPC-Command fuer `git rebase -i` mit sicherem Basis-Commit.
  - Konfliktstatus im UI inkl. Continue/Abort.
- DoD:
  - Rebase kann aus der UI gestartet werden.
  - Todo-Liste ist editierbar und wird validiert.
  - Konfliktfall zeigt klare naechste Schritte.
- Tests:
  - Integrationstest: Start/Reorder/Abort/Continue.
  - Negativtest: Root-Commit und Merge-Commit-Range.

## TSK-02 [P1] Hunk-basiertes Stage/Unstage/Discard im DiffViewer
- Problem: Staging ist aktuell hauptsaechlich dateibasiert.
- Scope:
  - Hunk-Selektion im DiffViewer.
  - Patch-Anwendung via `git apply --cached` und reverse-Patch fuer Unstage/Discard.
  - Fehlerbehandlung fuer hunks mit Konflikt/Drift.
- DoD:
  - Einzelne Hunks koennen zuverlaessig staged/unstaged/verworfen werden.
  - UI zeigt Erfolg/Fehler pro Hunk.
- Tests:
  - Unit-Tests fuer Patch-Builder.
  - Integrationstest fuer Stage/Unstage/Discard pro Hunk.

## TSK-03 [P1] Stash-Manager (Liste, Apply, Pop, Drop, Branch)
- Problem: Es gibt nur `stash` und `stash pop`, aber keine Verwaltung.
- Scope:
  - Neue Stash-Ansicht mit Liste und Detailvorschau.
  - Operationen: `list/show/apply/pop/drop/branch`.
  - Confirm-Dialoge fuer destructive Aktionen.
- DoD:
  - Alle Standard-Stash-Operationen sind aus der UI steuerbar.
  - Fehlermeldungen sind nutzerverstaendlich.
- Tests:
  - IPC-Handler-Tests fuer Stash-Befehle.
  - UI-Integrationstest fuer Apply/Pop/Drop/Branch.

## TSK-04 [P1] Erweiterter Pull/Push-Dialog
- Problem: Pull/Push ist aktuell eine Quick-Action ohne Optionen.
- Scope:
  - Dialog fuer Remote/Branch-Auswahl.
  - Flags: `--rebase`, `--ff-only`, `--force-with-lease`, optional `--tags`.
  - Sicherheitsabfragen fuer force-Operationen.
- DoD:
  - Nutzer kann Sync-Strategie explizit waehlen.
  - Gewaehlte Optionen werden transparent angezeigt.
- Tests:
  - Unit-Tests fuer Command-Mapping.
  - Integrationstest fuer Push mit/ohne lease.

## TSK-05 [P1] PR-Workflow ausbauen (Merge + Review-Basis)
- Problem: PRs koennen erstellt/gelistet/geoeffnet werden, aber nicht gemerged.
- Scope:
  - GitHub-Service um Merge-Endpunkte erweitern (`merge`, `squash`, `rebase`).
  - UI fuer Merge-Aktionen inklusive Status und Fehlerrueckmeldungen.
  - Grundlegende Merge-Checks (z. B. closed/merged/conflict states).
- DoD:
  - PR kann komplett aus der App finalisiert werden.
  - Merge-Fehler sind nachvollziehbar erklaert.
- Tests:
  - API-Mocktests fuer alle Merge-Methoden.
  - UI-Integrationstest fuer Merge-Flow.

## TSK-06 [P2] GitHub-Repoliste mit Suche, Pagination, Lazy Load
- Problem: Derzeit nur erste Seite und begrenzte Repo-Anzahl.
- Scope:
  - Serverseitige Pagination.
  - Clientseitige Suche/Filter/Sortierung.
  - Lazy Load inklusive Load-More/Infinite-Scroll.
- DoD:
  - Grosse Accounts bleiben performant nutzbar.
  - Keine stillen Abschneidungen der Repo-Liste.
- Tests:
  - API-Pagination-Tests.
  - UI-Tests fuer Suche und Nachladen.

## TSK-07 [P2] Lokale Repo-Erkennung robust machen
- Problem: Zuordnung erfolgt ueber Namensgleichheit und ist fehleranfaellig.
- Scope:
  - Match ueber normalisierte `remote.origin.url` statt Ordnername.
  - Normalizer fuer SSH/HTTPS/Formate.
  - Fallback-Strategie bei fehlendem Origin.
- DoD:
  - Korrekte Zuordnung auch bei gleichen Repo-Namen verschiedener Owner.
  - Fehlklassifikationen sind minimiert.
- Tests:
  - Unit-Tests fuer URL-Normalisierung.
  - Integrationstest mit gleichnamigen Repos.

## TSK-08 [P2] GitHub Enterprise-Unterstuetzung
- Problem: Parsing und API-Flows sind auf `github.com` fokussiert.
- Scope:
  - Konfigurierbarer GitHub-Host.
  - Host-agnostisches Remote-Parsing und API-Basis-URL.
  - Dokumentierter Unterschied beim Device/Web OAuth Flow.
- DoD:
  - PR- und Repo-Flows funktionieren mit `github.com` und GHES.
  - Hostwechsel ist ohne Neustart robust.
- Tests:
  - Service-Tests fuer Host-Normalisierung.
  - API-Mocktests fuer GHES-Base-URL.

## TSK-09 [P2] i18n-Hardening und Mojibake-Bereinigung
- Problem: Legacy-Strings und Encoding-Artefakte fuehren zu inkonsistenter UI.
- Scope:
  - Key-basierte Uebersetzungen fuer Kernbereiche.
  - Konsolidierung DE/EN Texte.
  - Entfernen von Runtime-Text-Mutationen.
- DoD:
  - Keine fehlerhaften Zeichen in Kernflows.
  - Einheitliche Lokalisierung in Menues, Dialogen und Fehlern.
- Tests:
  - Snapshot-Tests DE/EN.
  - Regressionstest fuer kritische UI-Texte.

## TSK-10 [P2] Performance-Optimierung fuer Polling und History-Laden
- Problem: Mehrere 3-Sekunden-Refreshes und grosse Log-Mengen erzeugen Last.
- Scope:
  - Zentrales Refresh-Scheduling.
  - Deduplizierte Requests und inkrementelles Nachladen.
  - UI-Virtualisierung fuer grosse Listen.
- DoD:
  - Spuerbar fluessigere UI bei grossen Repos.
  - Reduzierte CPU-Last im Idle/Active-Modus.
- Tests:
  - Benchmark-Szenario mit 10k+ Commits.
  - Messung von Refresh-Zyklen und Render-Kosten.

## TSK-11 [P1] Testabdeckung auf UI/Hooks/IPC erweitern
- Problem: Kritische User-Flows sind nicht ausreichend regressionsgesichert.
- Scope:
  - Unit-Tests fuer Domain-Hooks.
  - IPC-Handler-Tests fuer Git/GitHub-Flows.
  - Integrationstests fuer Staging/PR/Remote-Status.
- DoD:
  - Kritische Flows sind automatisiert abgesichert.
  - Regressionsrisiko bei Refactorings sinkt messbar.
- Tests:
  - CI faehrt die neuen Suites stabil durch.
  - Coverage-Schwellwert fuer geaenderte Module wird eingehalten.

## TSK-12 [P2] Diagnostik- und Fehlercenter
- Problem: Fehler sind technisch, verstreut und schwer supportbar.
- Scope:
  - Zentrale Fehleransicht mit copybaren Details.
  - Sanitized Diagnostics-Export.
  - Handlungsempfehlungen je Fehlerklasse.
- DoD:
  - Support/Debugging ohne manuelle Log-Suche moeglich.
  - Keine sensitiven Daten im Export.
- Tests:
  - Unit-Tests fuer Sanitizer.
  - UI-Test fuer Export-Flow.

## Globaler Testplan
1. E2E: Feature-Branch erstellen -> Committen -> Push/Pull -> PR erstellen -> PR mergen.
2. Konfliktfaelle fuer Merge/Rebase inkl. Abort/Continue und Integritaetschecks.
3. Performance auf grossen Repos (10k+ Commits, viele Branches/Dateien).
4. i18n-Regression (DE/EN Snapshot + kritische Texte).
5. GitHub API-Mocks fuer Rate-Limit, Auth-Fehler, Pagination.

## Annahmen
1. Reihenfolge: P1 vor P2.
2. Stack bleibt Electron + React + TypeScript + Git CLI.
3. Stubs sind direkt als Issue-Vorlagen nutzbar.
