# Open-Git-Control

[![CI](https://github.com/timbornemann/Open-Git-Control/actions/workflows/ci.yml/badge.svg)](https://github.com/timbornemann/Open-Git-Control/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/timbornemann/Open-Git-Control?sort=semver)](https://github.com/timbornemann/Open-Git-Control/releases/latest)
[![License](https://img.shields.io/github/license/timbornemann/Open-Git-Control)](LICENSE)

Open-Git-Control ist ein freier, quelloffener Desktop-Git-Client fuer Windows, macOS und Linux. Die App kombiniert visuellen Commit-Graph, Staging, einen Working-Directory-Dateibaum mit Editor, Diff-Ansicht, Konfliktloesung, GitHub Pull Requests, Releases, Projektplanung, Secret-Scanning, Recovery-Werkzeuge, Repository-Run-Workflows und optionale KI-Unterstuetzung in einer lokalen Anwendung.

Sprache: **Deutsch** | English version: [README.md](README.md)

![Open-Git-Control App-Uebersicht](Docs/App%20Overview.png)

## Warum Open-Git-Control?

Open-Git-Control ist fuer dich interessant, wenn dir ein sehr kleiner Git-Client nicht reicht, du aber trotzdem eine transparente, lokale Alternative zu kommerziellen Desktop-Clients suchst.

- Frei und open source unter der GNU-GPL-Lizenz
- Git-Operationen laufen lokal gegen deine Repositories
- Visueller Commit-Graph mit Branch-, Tag-, Merge-, Reset-, Rebase-, Cherry-Pick-, Revert- und Recovery-Aktionen
- Staging, Stash, Hunk-Diffs, Datei-Historie, Blame und Konfliktloesung in einem Workflow
- GitHub-Login, Repository-Klonen/Forken, Pull Requests, CI-Status, Workflows und Release-Publishing
- Projektplanung mit lokaler REST- und MCP-aehnlicher API fuer agentengestuetzte Arbeit
- Working-Directory-Dateibaum mit sicheren In-App-Dateivorschauen und Bearbeitung sowie System-Dateiaktionen bei Bedarf
- Repository-spezifische Run-Workflows fuer Tests, Formatieren, Starten und Bauen mit Live-Konsole
- Optionale KI-Unterstuetzung durch Ollama, Google Gemini oder OpenAI fuer Commit-Nachrichten, Auto-Commits, Release Notes und Planner-Uebergaben
- Secret-Scanning vor Commits und Pushes, Allowlist, Sicherheitsabfragen fuer gefaehrliche Aktionen und lokale verschluesselte Token-Speicherung, wenn vom OS unterstuetzt

## Downloads

Immer aktuelle Release-Seite:

[github.com/timbornemann/Open-Git-Control/releases/latest](https://github.com/timbornemann/Open-Git-Control/releases/latest)

Aktuell neuestes Release: [v2.1.0](https://github.com/timbornemann/Open-Git-Control/releases/tag/v2.1.0), veroeffentlicht am 2026-07-27.

Badge und Latest-Release-Seite bleiben automatisch aktuell. Die direkten Binary-Links unten sind durch die GitHub-Asset-Namen versioniert und werden vom Release-Workflow nach einem neuen stabilen Release aktualisiert.

| Plattform   | Paket                 | Direkter GitHub-Download                                                                                                                                               |
| ----------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64 | NSIS Installer `.exe` | [Open-Git-Control-2.1.0-win-x64.exe](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.1.0/Open-Git-Control-2.1.0-win-x64.exe)                     |
| Linux x64   | AppImage              | [Open-Git-Control-2.1.0-linux-x86_64.AppImage](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.1.0/Open-Git-Control-2.1.0-linux-x86_64.AppImage) |
| Linux amd64 | Debian-Paket `.deb`   | [Open-Git-Control-2.1.0-linux-amd64.deb](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.1.0/Open-Git-Control-2.1.0-linux-amd64.deb)             |
| macOS x64   | Disk Image `.dmg`     | [Open-Git-Control-2.1.0-mac-x64.dmg](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.1.0/Open-Git-Control-2.1.0-mac-x64.dmg)                     |
| macOS x64   | Zip-Archiv            | [Open-Git-Control-2.1.0-mac-x64.zip](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.1.0/Open-Git-Control-2.1.0-mac-x64.zip)                     |

Die Dateien `latest*.yml` und `.blockmap` in GitHub Releases sind Update-Metadaten fuer den Auto-Updater. Normale Nutzer sollten einen der Installer oben herunterladen.

## Voraussetzungen

- Git muss installiert und im `PATH` verfuegbar sein.
- GitHub CLI (`gh`) ist optional und nur fuer die One-click-GitHub-Login-Methode erforderlich.
- Ollama, ein Gemini API Key oder ein OpenAI API Key ist optional und nur fuer KI-Funktionen erforderlich.
- Entwicklung aus dem Quellcode benoetigt Node.js und npm. CI nutzt aktuell Node.js 20.

## Screenshots

### Repository Cockpit und Commit Graph

![Repository Cockpit und Commit Graph](Docs/App%20Overview.png)

### Diff Viewer mit Hunk-Aktionen, Blame und Datei-Inspector

![Diff Viewer](Docs/View%20diff.png)

### Conflict Resolver

![Conflict Resolver](Docs/Conflict%20Resolver.png)

### Codebase Timeline

![Codebase Timeline](Docs/Timeline.png)

### Project Planning Board

![Project Planning Board](Docs/Project%20Planning.png)

### Release Creator

![Release Creator](Docs/Release.png)

### Settings

![Settings](Docs/Settings.png)

## Inhaltsverzeichnis

- [Warum Open-Git-Control?](#warum-open-git-control)
- [Downloads](#downloads)
- [Voraussetzungen](#voraussetzungen)
- [Screenshots](#screenshots)
- [Feature-Referenz](#feature-referenz)
- [Typische Workflows](#typische-workflows)
- [Lokale Planning API und MCP](#lokale-planning-api-und-mcp)
- [Git installieren](#git-installieren)
- [Repository-Run-Kommandos](#repository-run-kommandos)
- [Entwicklung](#entwicklung)
- [Release Builds](#release-builds)
- [Datenhaltung und Sicherheit](#datenhaltung-und-sicherheit)
- [Troubleshooting](#troubleshooting)
- [Beitraege und Support](#beitraege-und-support)
- [Lizenz](#lizenz)

## Feature-Referenz

### Repository- und Workspace-Management

- Lokale Repositories oeffnen und als aktive Working Session setzen.
- Ordner, die noch kein Git-Repository sind, mit `git init` initialisieren und dabei optional ein Start-README sowie eine Lizenz anlegen.
- Persistenter Repository-Workspace mit zuletzt genutzten Repositories, Favoriten, aktivem Repo und Sortierung.
- Gespeicherte Repositories ohne leeren Zwischenzustand wiederherstellen: das aktive Repository wird zuerst vorbereitet, waehrend die restlichen Eintraege im Hintergrund validiert werden.
- Lokale Repositories suchen und nach zuletzt geoeffnet, Name, Erstellzeit, aufsteigend oder absteigend sortieren.
- Repositories anpinnen, schliessen und schnell zwischen bekannten Repositories wechseln.
- Nicht verfuegbare Repositories erkennen und fehlende Pfade sauber behandeln.
- Repository-Ordner direkt aus Local Repositories oder dem Header des aktiven Repositories im Dateisystem anzeigen.
- Vorhandene `LICENSE`-/`LICENCE`-Datei erkennen sowie Lizenzen aus gebuendelten, nachvollziehbaren SPDX-/Choose-a-License-Vorlagen anlegen oder ersetzen. Benoetigte Copyright-, Programmname-, Programmbeschreibung- und Apache/GNU-Notice-Felder werden vor dem Schreiben abgefragt.
- Gespeicherte Layout-Groessen in den Settings zuruecksetzen.
- Haupt-Sidebar und Graph/Inspector-Split vergroessern oder verkleinern.
- Eingeklappte Sidebar-Panels pro Repository fuer Remotes, Branches, Tags und Submodule merken.

### Branches, Remotes, Tags und Submodule

- Lokale und Remote-Branches mit Suche/Filter anzeigen.
- Branches erstellen, lokale Branches auschecken, umbenennen und loeschen.
- Unmerged Branches nur nach expliziter Bestaetigung force-loeschen.
- Branches aus dem Graphen und von ausgewaehlten Commits erstellen.
- Branches aus Topbar oder Kontextmenu mergen mit:
  - Standard-Merge
  - No-fast-forward-Merge
  - Squash-Merge
  - Fast-forward-only-Merge
- Alle Remotes mit Pruning und Tags fetchen.
- Auto-Fetch in konfigurierbarem Intervall und Refresh, wenn die App wieder sichtbar wird.
- Remote-Zustaende anzeigen:
  - kein Remote konfiguriert
  - kein Tracking-Branch
  - lokal voraus
  - Remote voraus
  - diverged
  - aktuell
  - Fetch-Fehler
- Remotes hinzufuegen, entfernen, umbenennen und URLs aktualisieren.
- Upstream fuer den aktuellen Branch setzen.
- Fehlende GitHub-Remotes behandeln, indem ungueltige `origin`-Mappings entfernt und Repositories wieder lokal/offline genutzt werden.
- Lightweight oder annotated Tags erstellen.
- Tags suchen, auswaehlen, loeschen und pushen.
- Rekursiven Submodule-Status anzeigen.
- `git submodule update --init --recursive` ausfuehren.
- `git submodule sync --recursive` ausfuehren.
- Submodule im Dateisystem oeffnen.

### Topbar-Git-Aktionen

- Fetch.
- Ausgewaehlten Branch mit waehlbarem Merge-Modus mergen.
- Pull mit:
  - Standard-Pull
  - Pull mit Rebase
  - No-fast-forward-Pull
  - Fast-forward-only-Pull
- Push mit:
  - Standard-Push
  - Upstream setzen (`-u`)
  - Force-with-lease
  - Tags pushen
- Repository-spezifische Run-, Test-, Format-, Start- und Build-Workflows starten.
- Codebase Timeline oeffnen.
- Release Creator oeffnen.
- Staging/Commit-Panel oeffnen.
- Kompakte "More actions"-Varianten bei schmalen Fenstern.

### Commit Graph und Historie

- Visueller Commit-Graph mit Branch- und Merge-Topologie.
- Paged Commit Loading fuer groessere Historien.
- Working-Tree-Zeile ueber der Historie mit staged, unstaged und untracked Counts.
- Asynchrone Commit-Statistiken fuer Dateien, Additions und Deletions.
- Commits suchen nach:
  - allen Feldern
  - Subject
  - Autor
  - Hash
  - Refs
- Suchtreffer vor/zurueck navigieren.
- Commits auswaehlen und geaenderte Dateien, Commit-Body, Datei-Historie, Blame und Patch inspizieren.
- Commit-Kontextmenu mit:
  - Checkout als neuer Branch
  - Detached Checkout
  - Branch erstellen
  - Tag erstellen
  - Cherry-Pick
  - Revert
  - Merge-Commit mit `-m 1` reverten
  - Reset `--soft`
  - Reset `--mixed`
  - Reset `--hard`
  - interaktiver Rebase mit editierbarer Todo-Liste
  - ausgewaehlte Ref in aktuellen Branch mergen
  - Commit-Hash kopieren
- Tag-Auswahl springt zum getaggten Commit.

### Codebase Timeline

- Timeline-Ansicht rekonstruiert Datei-Aenderungen ueber die Commit-Historie.
- Canvas-basierte File-Tree-Visualisierung.
- Markiert hinzugefuegte, geaenderte, geloeschte und umbenannte Dateien.
- Playback-Steuerung:
  - Play/Pause
  - Reset zum Anfang
  - Sprung ans Ende
  - Timeline-Slider
  - Geschwindigkeitsauswahl von sehr langsam bis sehr schnell
- Zeigt aktiven Commit-Hash, Autor, Datum, Subject und Position in der Historie.

### Forensische Suche und Recovery

- Forensische Historie direkt aus dem Graphen:
  - String-Suche mit `git log -S`
  - Regex-Suche mit `git log -G`
  - Zeilenbereich-Suche mit `git log -L`
- Pfad-Vorschlaege aus Working Tree und Repository-Historie.
- Ergebnis-Commits inspizieren und direkt in Diffs springen.
- Recovery Center auf Basis von Reflog:
  - Reflog-Eintraege filtern
  - verlorene oder verschobene Commits untersuchen
  - Recovery-Branch aus Reflog-Eintrag erstellen
  - Detached Checkout
  - Hard Reset mit ausdruecklicher Danger-Bestaetigung

### Staging Area, Stash und Commits

- Working Directory Panel mit Bereichen fuer:
  - Konflikte
  - staged files
  - unstaged files
  - untracked files
- Geaenderte Dateien suchen.
- Staged- und unstaged-Dateistatistiken anzeigen.
- Einzelne Dateien stagen und unstagen.
- Stage all und unstage all.
- Alle untracked Dateien stagen.
- Einzelne Dateien oder alle Aenderungen verwerfen.
- Untracked Dateien loeschen.
- Dateien, Ordner, Top-Level-Ordner oder Dateityp-Pattern zu `.gitignore` hinzufuegen.
- Stash mit optionaler Nachricht.
- Stashes anwenden, poppen und droppen.
- Branch aus Stash erstellen.
- Commit mit Titel und optionaler Beschreibung.
- Commit mit `--amend`.
- Commit mit `--signoff`.
- Commit-Signoff standardmaessig in den Settings aktivieren.
- Konfigurierbares Commit Template.
- Commit mit `Ctrl+Enter` in Commit-Feldern ausfuehren.

### Working Directory und Datei-Viewer

- Rechten Inspector zwischen Staging Area und repositorygebundenem Working-Directory-Dateibaum umschalten.
- Sichtbare Dateien und Ordner ohne `.git` oder weitere Dot-Entries durchsuchen; aufgeklappte Ordner bleiben beim Umschalten erhalten und werden lazy geladen.
- Kontextaktionen fuer Dateien und Ordner: oeffnen, umbenennen, ausschneiden, kopieren, einfuegen, loeschen, im Dateisystem zeigen, extern oeffnen oder Anwendung waehlen. Copy/Cut/Paste bleibt im aktiven Repository, destruktive Aktionen verlangen eine Bestaetigung.
- Dateien im Hauptbereich statt des Graphen oeffnen:
  - editierbarer, syntaxhervorgehobener Text mit explizitem Speichern und `Ctrl/Cmd+S`
  - Markdown-Editor und Vorschau
  - sichere Bild- und SVG-Vorschau
  - abgeschirmte HTML-/HTM-Vorschau
  - History- und Blame-Tabs
  - sichere Informationsansicht fuer Binaer- oder zu grosse Dateien mit System-Oeffnen-Aktionen

### Diff Viewer und Datei-Inspector

- Staged, unstaged und commit-spezifische Diffs oeffnen.
- Unified- und Side-by-side-Diff-Modus.
- Syntax-aehnliches Highlighting fuer haeufige Code-Tokens.
- Hunk-Navigation mit aktuellem Hunk-Counter.
- Hunk-Aktionen:
  - Hunk stagen
  - Hunk unstagen
  - Hunk verwerfen
- Blame-Overlay im Diff Viewer.
- Blame-Eintraege anklicken und zum verantwortlichen Commit springen.
- Datei-Inspector-Tabs:
  - History
  - Blame
  - Patch
- Datei-Historie zeigt vorherige Commits der ausgewaehlten Datei.
- Blame laedt in Chunks und kann weitere 500-Zeilen-Seiten laden.
- Patch-Tab oeffnet den Diff im Hauptbereich.
- Schutz bei grossen Diffs:
  - Byte- und Zeilenlimits
  - gekuerztes Rendering
  - Vollkopie-Aktion, wenn verfuegbar
- Binary-Erkennung fuer haeufige Binaer-Dateiendungen und Git Binary Patches.

### Conflict Resolver

- Eigene Conflict-Resolver-Ansicht fuer Merge- und Rebase-Konflikte.
- Oeffnet automatisch, wenn Konflikte erkannt werden.
- Konfliktdateiliste und Konfliktblock-Navigation.
- Side-by-side-Darstellung fuer current/incoming Konfliktbloecke.
- Einzelne Bloecke loesen mit:
  - current uebernehmen
  - incoming uebernehmen
  - beide Versionen uebernehmen
- Alle Bloecke loesen mit:
  - alle current uebernehmen
  - alle incoming uebernehmen
- Manueller Editor mit Konfliktmarkern und Line-Gutter-Feedback.
- Datei von Disk neu laden.
- Aenderungen speichern.
- Speichern und als resolved markieren.
- Aenderungen verwerfen.
- Merge fortsetzen oder abbrechen.
- Rebase fortsetzen oder abbrechen.
- Commits verhindern, solange ungeloeste Konflikte vorhanden sind.

### GitHub Integration

- Authentifizierung mit:
  - Personal Access Token
  - OAuth Device Flow
  - One-click Login ueber GitHub CLI (`gh`)
- Reconnect aus gespeicherter GitHub Session.
- Logout und gespeicherte Auth entfernen.
- GitHub OAuth Client ID fuer Device Flow konfigurieren.
- GitHub Host fuer GitHub-Enterprise-aehnliche Hosts konfigurieren.
- GitHub-Repositories mit Suche, Pagination und Refresh listen.
- Erkennen, ob GitHub-Repositories lokal bereits geklont sind.
- GitHub-Repositories mit Progress Modal klonen.
- Beliebige HTTP-, HTTPS- oder SSH-Git-Remote-URL klonen.
- GitHub-Repository per URL forken und Fork lokal klonen.
- Neues GitHub-Repository aus lokalem Repo ohne `origin` erstellen.
- Erstelltes GitHub-Repo als `origin` verbinden.
- Ungueltiges Remote Mapping ersetzen, wenn das Upstream-Repository nicht mehr existiert.

### Pull Requests, CI und Workflows

- Pull-Request-Liste fuer das aktive GitHub-Repository.
- PRs nach open, closed oder all filtern.
- Pull Requests mit Titel, Body, Head Branch und Base Branch erstellen.
- PRs im Browser oeffnen.
- PR-URLs kopieren.
- PR-Branches lokal auschecken.
- PRs mergen mit:
  - Merge Commit
  - Squash
  - Rebase
- CI-Auswertung pro PR:
  - success
  - failure
  - pending
  - neutral
  - unknown
- Workflow Runs und Status Checks anzeigen.
- Aktuelle GitHub Actions Workflow Runs fuer den aktuellen Branch anzeigen.
- Workflow Runs filtern und im Browser oeffnen.

### Release Creator

- Eigene Release-Ansicht aus der Topbar.
- GitHub Release Context lesen:
  - Repository URL
  - bestehende Tags
  - letzter Release-Tag
  - Commits seit letztem Release
  - Ziel-Branch oder Commit
- Naechstes SemVer-Tag vorschlagen.
- Version bump waehlen:
  - major
  - minor
  - patch
- Konfigurieren:
  - Tag-Name
  - Release-Name
  - Target commitish
  - Release Body in Markdown
  - Draft-Flag
  - Prerelease-Flag
- Release Notes mit KI generieren.
- KI-Notes anpassen:
  - Sprache Englisch/Deutsch
  - Merge Commits ausschliessen
  - in Sektionen gruppieren
  - mehr technische Details
  - Breaking-Changes-Sektion
  - automatische Commit-Liste anhaengen
  - Commit Hashes anzeigen
- Release direkt auf GitHub veroeffentlichen.

### Projektplanung

- Planning View fuer repositorygebundene Projekte und zukuenftige Projekte.
- Board-Spalten:
  - Idea
  - Bug
  - Planned
  - In progress
  - Blocked
  - Done
- Planungseintraege unterstuetzen:
  - Titel
  - Beschreibung
  - Prioritaet
  - Status
  - Tags
- Planungseintraege nach Suche, Prioritaet, Status und Tag filtern.
- Eintraege erstellen, bearbeiten, verschieben und loeschen.
- Zukuenftige Projekte ohne Git-Repository erstellen.
- Projekte bearbeiten oder loeschen.
- Zukuenftiges Projekt materialisieren: Parent-Verzeichnis waehlen, Projektordner erstellen, `git init` ausfuehren und Planning-Projekt verknuepft halten.
- Beim Entfernen eines Repositories koennen verknuepfte Planungseintraege nach Bestaetigung mit entfernt werden.
- Kontextmenues auf Planungseintraegen bieten schnelle Status-/Prioritaetsaenderungen, Loeschen, Agent-Prompt kopieren und (fuer Repository-Projekte) KI-Commit-Message-Erstellung.
- Agentenfertigen Umsetzungs-Prompt fuer einen Eintrag oder alle aktuell sichtbaren Eintraege einer Status-Spalte kopieren. Spalten-Prompts behalten die sichtbare, nach Prioritaet sortierte Reihenfolge.
- KI-Commit-Message aus einem Eintrag oder einer sichtbaren Status-Spalte generieren. Das Ergebnis wird als Commit-Entwurf des Repositories gespeichert und oeffnet die Staging-Ansicht.

### Lokale Planning API und MCP

- Lokaler HTTP-Server, gebunden an `127.0.0.1`.
- Bevorzugter Port: `2990`; wenn belegt, nutzt die App den naechsten freien lokalen Port.
- API-Dokumentation: `http://127.0.0.1:2990/api/`
- OpenAPI JSON: `/api/openapi.json`
- MCP JSON-RPC-Endpunkt: `/mcp`
- REST-Wrapper fuer MCP-aehnliche Tools:
  - `GET /api/mcp/tools`
  - `POST /api/mcp/tools/call`
- Alle Daten- und MCP-Endpunkte benoetigen einen Token.
- Public Health und Docs-Endpunkte liefern keine geschuetzten Daten.
- Token kann gesendet werden als:
  - `x-open-git-control-token: <TOKEN>`
  - `Authorization: Bearer <TOKEN>`
- Settings zeigen:
  - API-Status
  - Host
  - Port
  - Base URL
  - API-Doku-URL
  - OpenAPI-URL
  - MCP-URL
  - Token-Header
  - aktueller Token
  - Token-Quelle
  - Token-Ablauf
- Persistente API-Token generieren fuer:
  - 1 Tag
  - 1 Monat
  - 1 Jahr
  - dauerhaft
- Persistente API-Token werden mit Electron `safeStorage` gespeichert, wenn OS-Verschluesselung verfuegbar ist.
- Ohne persistenten Token nutzt die App temporaere Session-Tokens.
- Environment-Steuerung:
  - `OPEN_GIT_CONTROL_API_PORT=2990`
  - `OPEN_GIT_CONTROL_API_DISABLED=true`
  - `OPEN_GIT_CONTROL_API_TOKEN=<TOKEN>`
- REST-Planning-Endpunkte:
  - `GET /api/health`
  - `GET /api/projects`
  - `POST /api/projects`
  - `GET/PATCH/DELETE /api/projects/:projectId`
  - `GET/POST /api/projects/:projectId/todos`
  - `GET /api/repositories`
  - `POST /api/repositories/ensure`
  - `GET /api/repositories/todos`
  - `GET/POST /api/todos`
  - `GET /api/todos/next`
  - `GET/PATCH/DELETE /api/todos/:todoId`
  - `POST /api/todos/:todoId/move`
  - `GET /api/tabs`
  - `GET/POST /api/tabs/:tab/todos`
  - `GET /api/agent/next`
- MCP-aehnliche Tools:
  - `list_tabs`
  - `list_projects`
  - `list_repositories`
  - `list_todos`
  - `get_next_todos`
  - `create_project`
  - `ensure_repository_project`
  - `create_todo`
  - `update_todo`
  - `move_todo`
  - `delete_todo`
- Git- und GitHub-Operationen werden bewusst nicht ueber die lokale API oder MCP-Oberflaeche exportiert.

### KI-Unterstuetzung

- Provider:
  - Ollama
  - Google Gemini
  - OpenAI
- Ollama Base URL konfigurieren.
- Gemini API Key sicher speichern, ersetzen und entfernen, wenn OS-Verschluesselung verfuegbar ist.
- Provider-Verbindung testen.
- Verfuegbare Modelle laden.
- Modell auswaehlen oder manuell eintragen.
- Commit-Message-Stil konfigurieren:
  - Conventional Commits
  - Plain
  - Detailed
- KI-Ausgabesprache fuer Commit-Nachrichten und Planner-Prompts konfigurieren:
  - Auto
  - Deutsch
  - Englisch
- KI-Commit-Message aus Nutzerhinweisen oder repositorygebundenen Planner-Eintraegen generieren.
- Statusbewusste KI-Agent-Prompts fuer Umsetzung, Bugfix, Fortsetzung, Entblockung oder Abschlusspruefung kopieren.
- KI Auto-Commit:
  - analysiert den Working Tree
  - gruppiert geaenderte Dateien logisch
  - erzeugt Commit Messages
  - erstellt Commits automatisch
  - meldet Phasen wie snapshot, grouping, committing, retry, fallback, done, failed und cancelled
  - kann abgebrochen werden
- KI-Release-Notes aus Commit-Historie und Release Context.

### Security und Safety

- Optionale Bestaetigungsdialoge fuer gefaehrliche Git-Operationen.
- Explizite Danger-Bestaetigungen fuer destruktive Reset-, Discard-, Delete-, Force-Delete- und aehnliche Aktionen.
- Git Command Policy begrenzt, welche Befehle der Renderer beim Main Process anfordern kann.
- External-Link-Policy oeffnet erlaubte URLs ueber den Main Process.
- Diff-Preview-Policy normalisiert sichere Diff-Befehle.
- Secret-Scan vor Commit und Push:
  - scannt staged Diffs lokal vor einem Commit und den Push-Bereich erneut vor dem Push
  - kann Tags einbeziehen
  - unterstuetzt Abbruch
  - meldet Treffer mit Rule, Severity, Datei, Zeile und bereinigtem Kontext
  - nutzt app-eigene Dialoge zum Abbrechen, Fortfahren oder Hinzufuegen betroffener Dateien zur Allowlist
  - formatiert GitHub-Push-Protection-Ablehnungen als handlungsorientierten Dialog mit relevanten Links und Hinweisen
- Secret-Scan-Strengegrad:
  - low
  - medium
  - high
- Secret-Scan-Allowlist-Formate:
  - `path:...`
  - `regex:...`
  - freier Text
  - Kommentarzeilen mit `#`
- GitHub Token, Gemini Key und persistenter Planning-API-Token werden OS-verschluesselt ueber Electron `safeStorage` gespeichert, wenn verfuegbar.
- Wenn OS-Verschluesselung nicht verfuegbar ist, werden Secrets nicht persistent gespeichert.

### Settings, Updates und Job Center

- General Settings:
  - Theme
  - Sprache
  - Default Branch
  - Layout zuruecksetzen
  - Secondary History
  - Commit Signoff Default
  - Commit Template
  - Auto-Fetch Intervall
- Themes:
  - Copper Night
  - Midnight Teal
  - Graphite Blue
  - Forest Copper
  - Porcelain Light
  - Ember Slate
  - Arctic Mint
  - Mono Dark Red
  - Mono Light Red
  - Mono Dark Green
  - Mono Light Green
- Integrations Settings:
  - GitHub OAuth Client ID
- KI & MCP Settings:
  - KI Provider
  - KI Modell
  - KI Message Style/Language
  - Ollama URL
  - Gemini API Key
  - OpenAI API Key und HTTPS-Base-URL
  - Runtime API Status
  - kopierbare URLs und Token-Werte
  - Token generieren und loeschen
  - Beispiel-cURL-Befehle
  - Beispiel-MCP-Server-Config
- Security Settings:
  - Bestaetigungen fuer gefaehrliche Operationen
  - Secret-Scan vor Commit
  - Secret-Scan vor Push
  - Strictness
  - Allowlist
- System Settings:
  - installierte App-Version
  - Updater-Status
  - verfuegbare Version
  - Download-Fortschritt
  - Background-Update-Toggle
  - One-click Update
  - Release Notes
  - Job Center
- Run Settings:
  - repository-spezifische `.Open-Git-Control/run.json`-Konfiguration
  - plattformspezifische Shell-Befehle und geordnete Workflow-Schritte
  - erkannte Befehlsvorlagen und Output-Parser-Auswahl
- Job Center verfolgt aktuelle Operationen wie:
  - clone
  - fetch
  - pull
  - push
  - stage
  - commit
  - stash branch
  - secret scan
  - AI auto-commit

### Shortcuts und Produktivitaet

- `Ctrl+1..4`: Haupt-Sidebar-Tabs wechseln
- `Ctrl+Shift+F`: Fetch
- `Ctrl+Shift+P`: Command Palette
- `Ctrl+Shift+T`: Todo fuer das aktive Repository erstellen
- `Ctrl+Enter`: Commit aus Commit-Feldern ausfuehren
- Command Palette mit Tastaturnavigation, Suche, `Enter` zum Ausfuehren und `Esc` zum Schliessen
- Copy-Buttons fuer Hashes, URLs, Tokens, API-Beispiele und PR-Links
- Virtualisierte Listen fuer groessere Datei- und Commit-Detailansichten

## Typische Workflows

### Repository oeffnen oder initialisieren

1. Tab "Local Repositories" oeffnen.
2. Ordner auswaehlen.
3. Falls es noch kein Git-Repository ist, Initialisierung bestaetigen.
4. In den Repository-Tab wechseln und arbeiten.

### Standard-Lokalworkflow

1. Fetch oder Pull aus der Topbar.
2. Branch erstellen oder wechseln.
3. Geaenderte Dateien im Working Directory pruefen.
4. Diffs oeffnen, Dateien oder Hunks stagen und bei Bedarf stashen.
5. Commit mit Titel und Beschreibung erstellen.
6. Push, Upstream setzen, Tags pushen oder Force-with-lease nutzen, wenn noetig.

### Konflikte loesen

1. Merge, Pull, Rebase, Cherry-Pick oder eine andere Operation starten, die Konflikte erzeugt.
2. Conflict Resolver oeffnen, wenn er erscheint.
3. Jeden Block mit current, incoming oder both loesen.
4. Manuellen Editor nutzen, wenn das Ergebnis Feinschliff braucht.
5. Speichern und Dateien als resolved markieren.
6. Merge/Rebase im Resolver fortsetzen oder abbrechen.

### GitHub Pull Request Flow

1. Per PAT, Device Flow oder GitHub CLI One-click Login anmelden.
2. Sicherstellen, dass `origin` auf ein GitHub-Repository zeigt.
3. Pull Request aus der Repo-Sidebar erstellen.
4. PR-CI und Workflow-Status pruefen.
5. PR oeffnen, kopieren, auschecken, mergen, squashen oder rebasen.

### Release Flow

1. Release aus der Topbar oeffnen.
2. Release Context aktualisieren.
3. Major, Minor oder Patch waehlen.
4. Tag, Release-Name, Target und Markdown Body anpassen.
5. Optional KI-Release-Notes generieren.
6. Als normales Release, Draft oder Prerelease veroeffentlichen.

### Recovery Flow

1. Recovery Center im Graph-Bereich oeffnen.
2. Reflog-Eintraege filtern.
3. Recovery-Branch aus relevantem Eintrag erstellen.
4. Detached Checkout oder Hard Reset nur verwenden, wenn du sicher bist.

### Agenten-Planning-Workflow

1. Open-Git-Control starten.
2. Settings -> KI & MCP oeffnen und MCP-URL plus Token kopieren.
3. Externen Agenten mit MCP-URL oder REST-Endpunkten konfigurieren.
4. Agent nach `get_next_todos` oder `GET /api/agent/next` fragen.
5. Agent Planungseintraege erstellen oder verschieben lassen.
6. Git- und GitHub-Arbeit in der Desktop-App behalten.

## Lokale Planning API und MCP

Beispiel: naechste Todos fuer ein Repository abrufen.

```bash
curl "http://127.0.0.1:2990/api/agent/next?repoPath=<REPO_PATH_URL_ENCODED>&limit=10" \
  -H "x-open-git-control-token: <TOKEN>"
```

Beispiel: MCP-aehnliche Tools per JSON-RPC listen.

```bash
curl -X POST "http://127.0.0.1:2990/mcp" \
  -H "x-open-git-control-token: <TOKEN>" \
  -H "content-type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"
```

Beispiel-MCP-Server-Config:

```json
{
  "mcpServers": {
    "open-git-control": {
      "type": "http",
      "url": "http://127.0.0.1:2990/mcp",
      "headers": {
        "x-open-git-control-token": "<TOKEN>"
      }
    }
  }
}
```

## Git installieren

Git muss installiert und im `PATH` verfuegbar sein.

### Windows

1. Git von [git-scm.com/downloads](https://git-scm.com/downloads) herunterladen.
2. Windows Installer ausfuehren.
3. "Git from the command line" aktiviert lassen.
4. Terminal oder PC neu starten, falls `git` nicht sofort gefunden wird.

### macOS

Homebrew:

```bash
brew install git
```

Apple Command Line Tools:

```bash
xcode-select --install
```

### Linux

Debian/Ubuntu:

```bash
sudo apt update && sudo apt install git -y
```

Fedora:

```bash
sudo dnf install git -y
```

Arch:

```bash
sudo pacman -S git
```

### Git pruefen

```bash
git --version
git config --global user.name "Dein Name"
git config --global user.email "dein@email.de"
```

## Repository-Run-Kommandos

Das **Run**-Menue in der Topbar startet repository-spezifische **Run**-, **Test**-, **Format**-, **Start**- und **Build**-Befehle. Die Konfiguration wird versioniert in `.Open-Git-Control/run.json` abgelegt; Befehle laufen nur nach einem expliziten Klick und immer mit dem Repository-Root als Arbeitsverzeichnis.

```json
{
  "version": 1,
  "actions": {
    "test": {
      "steps": [
        {
          "id": "unit-tests",
          "label": "Unit-Tests",
          "parser": "vitest-jest",
          "windows": { "shell": "powershell", "command": "npm test" },
          "macos": { "shell": "zsh", "command": "npm test" },
          "linux": { "shell": "bash", "command": "npm test" }
        }
      ]
    }
  }
}
```

Unter **Einstellungen -> Run** lassen sich die fuenf festen Aktionen bearbeiten, erkannte Vorlagen uebernehmen und geordnete Workflows konfigurieren. Vorlagen decken npm, pnpm, Yarn, Bun, Python, Rust, Go, .NET, Maven, Gradle, Flutter und CMake ab. Jeder Schritt kann PowerShell oder CMD unter Windows, zsh unter macOS und bash unter Linux verwenden.

Es laeuft immer nur ein Workflow gleichzeitig. Er kann im Hintergrund weiterlaufen, ueber das Run-Menue erneut geoeffnet und in der App gestoppt werden. Die Konsole behaelt einen begrenzten Roh-Ausgabepuffer, einen ausgewerteten Probleme-Tab, eine Zusammenfassung sowie Kopieraktionen fuer Ausgabe und Probleme. Ein ungelesenes erfolgreiches Ergebnis faerbt den Run-Button gruen; ein ungelesenes fehlgeschlagenes Ergebnis rot, bis es geoeffnet wird.

## Entwicklung

Dependencies installieren:

```bash
npm install
```

Vite und Electron im Development-Modus starten:

```bash
npm run dev
```

App bauen:

```bash
npm run build
```

Tests ausfuehren:

```bash
npm run test
npm run test:coverage
npm run test:ci
```

Verfuegbare Skripte:

| Skript                   | Zweck                                                       |
| ------------------------ | ----------------------------------------------------------- |
| `npm run dev`            | Vite und Electron zusammen starten                          |
| `npm run electron:dev`   | Electron-Prozess bauen und Electron gegen Vite starten      |
| `npm run build`          | TypeScript, Vite Build und Electron-Prozess bauen           |
| `npm run build:electron` | Electron Main/Preload-Prozess kompilieren                   |
| `npm run legal:prepare`  | Installer-Lizenz und Drittanbieterhinweise erzeugen         |
| `npm run legal:check`    | Erzeugte rechtliche Dateien pruefen                         |
| `npm run dist`           | Paketierte App fuer aktuelle Plattform bauen                |
| `npm run dist:win`       | Windows NSIS x64 Paket bauen                                |
| `npm run dist:linux`     | Linux AppImage und deb Pakete bauen                         |
| `npm run dist:mac`       | macOS dmg und zip Pakete bauen                              |
| `npm run release:win`    | Unsignierte Windows-Release-Artefakte ohne Publishing bauen |
| `npm run release:linux`  | Linux-Release-Artefakte ohne Publishing bauen               |
| `npm run release:mac`    | Unsignierte macOS-Release-Artefakte ohne Publishing bauen   |
| `npm run preview`        | Vite Build previewen                                        |
| `npm run electron:start` | Electron nach gebautem Electron-Prozess starten             |
| `npm run test`           | Unit Tests ausfuehren                                       |
| `npm run test:coverage`  | Tests mit Coverage ausfuehren                               |
| `npm run test:ci`        | Kompilieren, Tests mit Coverage und Build ausfuehren        |

## Release Builds

Lokale Paket-Artefakte landen in `release/`.

```bash
npm run dist
npm run dist:win
npm run dist:linux
npm run dist:mac
```

GitHub Publishing laeuft ueber [.github/workflows/release.yml](.github/workflows/release.yml). Das Veroeffentlichen eines Releases mit einem Tag wie `vX.Y.Z` in Open Git Control oder auf GitHub startet Qualitaetspruefungen und Plattform-Builds fuer Windows, Linux und macOS. Der Workflow leitet Paket- und Lockfile-Version aus dem Release-Tag ab, erzeugt rechtliche Hinweise, validiert die paketierten Anwendungen und Updater-Metadaten und erzeugt `SHA256SUMS.txt`. Danach haengt er alle Assets an den bereits sichtbaren Release an und prueft sie remote. Fuer einen fehlgeschlagenen Build kann der Workflow mit einem vorhandenen Release-Tag auch manuell erneut gestartet werden.

Lokale `dist:*`-Builds verwenden die in `package.json` eingecheckte Version. Offizielle Release-Builds fuehren `prepare-release-version.js` aus, damit `package.json`, `package-lock.json`, paketierte App-Version und MCP-Server-Metadaten auf dieselbe Release-Tag-Version aufgeloest werden.

Es sind keine eigenen Repository-Secrets oder Signierungszertifikate erforderlich. GitHub stellt dem Workflow das `GITHUB_TOKEN` automatisch bereit. Die Windows- und macOS-Pakete sind bewusst unsigniert und der macOS-Build wird nicht notarisiert. Deshalb koennen die Betriebssysteme SmartScreen- oder Gatekeeper-Warnungen anzeigen. Code-Signierung und Notarisierung lassen sich spaeter ergaenzen, ohne den Release-Trigger zu aendern.

Erwartete Release Assets:

- `Open-Git-Control-<version>-win-x64.exe`
- `Open-Git-Control-<version>-linux-x86_64.AppImage`
- `Open-Git-Control-<version>-linux-amd64.deb`
- `Open-Git-Control-<version>-mac-x64.dmg`
- `Open-Git-Control-<version>-mac-x64.zip`
- Updater-Metadaten wie `latest.yml`, `latest-linux.yml`, `latest-mac.yml` und Blockmaps
- `SHA256SUMS.txt` fuer manuell heruntergeladene Installer und Archive
- eingebundene `LICENSE`- und `THIRD_PARTY_NOTICES.txt`-Ressourcen

## Datenhaltung und Sicherheit

- Git-Befehle laufen gegen das ausgewaehlte lokale Repository.
- Repository-Workspace-State wird im Electron-User-Data-Verzeichnis gespeichert.
- Settings werden lokal gespeichert.
- Planning-Projekte und Planning-Items werden lokal gespeichert.
- Die Planning API bindet an `127.0.0.1`.
- Token-geschuetzte Planning-API-Endpunkte sind fuer lokale Prozesse auf derselben Maschine gedacht.
- GitHub Token, Gemini Key und persistenter Planning-API-Token werden mit OS-gestuetzter Verschluesselung ueber Electron `safeStorage` gespeichert, wenn verfuegbar.
- Wenn OS-Verschluesselung nicht verfuegbar ist, werden Secrets nicht persistent gespeichert.
- Die lokale API stellt nur Planungsdaten bereit; sie exportiert keine Git- oder GitHub-Aktionen.

## Troubleshooting

### `git` nicht gefunden

- Git installieren.
- Terminal oder PC neu starten.
- Mit `git --version` pruefen.

### GitHub One-click Login funktioniert nicht

- GitHub CLI von [cli.github.com](https://cli.github.com/) installieren.
- Mit `gh --version` pruefen.
- PAT oder Device Flow nutzen, wenn GitHub CLI nicht verwendet werden soll.

### Device Flow funktioniert nicht

- GitHub OAuth Client ID in Settings -> Integrations setzen.
- Alternativ `GITHUB_OAUTH_CLIENT_ID` vor dem App-Start setzen.

### Keine Pull Requests sichtbar

- Sicherstellen, dass `origin` auf ein GitHub-Repository zeigt.
- Im GitHub-Tab anmelden.
- Repository und PR-Panel aktualisieren.

### Commit oder Push wird vom Secret-Scan blockiert

- Gemeldete Datei und Zeile pruefen.
- Secret entfernen oder rotieren, falls es versehentlich committed wurde.
- Die Allowlist-Aktion im Dialog nur fuer beabsichtigte Test- oder Beispielwerte verwenden; sie erlaubt den betroffenen Dateipfad bei künftigen Scans.
- Allowlist nur eng fuer absichtliche Dummy-/Beispielwerte setzen.

### Auto-Update nicht verfuegbar

- Auto-Update funktioniert nur in installierten Production Builds.
- `npm run dev` und lokale unverpackte Builds nutzen den Updater nicht.

### Planning API laeuft nicht auf Port `2990`

- Eventuell nutzt ein anderer lokaler Prozess den Port.
- In Settings -> KI & MCP steht der tatsaechliche Port.
- `OPEN_GIT_CONTROL_API_PORT=<PORT>` vor dem App-Start setzen, wenn ein anderer bevorzugter Port gewuenscht ist.

### KI-Funktionen reagieren nicht

- Fuer Ollama Server-URL und Modellnamen pruefen.
- Fuer Gemini gueltigen API Key speichern und passendes Modell auswaehlen.
- "Test connection" und "Load models" in Settings -> Integrations nutzen.

## Beitraege und Support

Open-Git-Control nutzt strukturierte GitHub-Formulare fuer Bug Reports, Feature Requests, Fragen und Dokumentationsmeldungen:

[Strukturiertes Issue oeffnen](https://github.com/timbornemann/Open-Git-Control/issues/new/choose)

- Lies [Beitraege](Docs/community/de/beitraege.md), bevor du einen Pull Request oeffnest.
- Nutze [Support](Docs/community/de/support.md), um den passenden Weg fuer Meldungen oder Fragen zu waehlen.
- Melde Sicherheitsluecken privat ueber [Sicherheit](Docs/community/de/sicherheit.md), nicht in oeffentlichen Issues.
- Beachte den [Verhaltenskodex](Docs/community/de/verhaltenskodex.md) bei Issues, Reviews und Pull Requests.

Leere Issues sind deaktiviert, damit neue Meldungen genug Kontext fuer die Triage enthalten.

## Lizenz

Open-Git-Control ist unter der [GNU General Public License](LICENSE) lizenziert.
