# Open-Git-Control

Open-Git-Control ist ein freier, quelloffener Desktop-Git-Client fuer Windows, macOS und Linux.

Die App kombiniert visuellen Commit-Graph, Staging, Diff-Tools, Konfliktloesung, GitHub-PRs und Releases, Secret-Scanning, Recovery-Werkzeuge und optionale KI-Unterstuetzung fuer Commits/Release Notes in einer lokalen Desktop-App - ohne zentrale Git-Workflows hinter ein Abo zu legen.

Sprache: **Deutsch** | English main version: [README.md](README.md)

![Open-Git-Control App Overview](Docs/App%20Overview.png)

## Warum Open-Git-Control?

Open-Git-Control ist fuer dich interessant, wenn dir ein minimaler Git-Client nicht reicht, du aber trotzdem eine lokale, offene Alternative zu kommerziellen Desktop-Clients suchst.

- Frei und open source
- Lokale Desktop-App fuer taegliche Git-Arbeit
- Visueller Commit-Graph mit Branch-, Tag-, Merge- und Recovery-Aktionen
- Integriertes Staging, Hunk-Diff-Viewer, Stash-Werkzeuge und Conflict Resolver
- GitHub-Login, Repositories, Pull Requests, CI-Status, Workflows und Releases
- Secret-Scanning vor Pushes und Sicherheitsabfragen fuer destruktive Aktionen
- Optionale KI-Unterstuetzung ueber Ollama oder Gemini
- Lokale Planning API und MCP-aehnliche Tools fuer agentengestuetzte Projektarbeit

## Installation

Aktuelles Release herunterladen:

[github.com/timbornemann/Open-Git-Control/releases/latest](https://github.com/timbornemann/Open-Git-Control/releases/latest)

Git muss installiert und im `PATH` verfuegbar sein. Siehe [Git installieren](#git-installieren-wie-und-wo), falls du Setup-Hilfe brauchst.

Fuer Entwicklung aus dem Quellcode:

```bash
npm install
npm run dev
```

## Screenshots

### Diff Viewer
![Open-Git-Control Diff View](Docs/View%20diff.png)

### Conflict Resolver
![Open-Git-Control Conflict Resolver](Docs/Conflict%20Resolver.png)

## Kurzueberblick

Mit Open-Git-Control kannst du:

- lokale Repositories schnell oeffnen, initialisieren und wechseln
- Branches, Remotes, Tags und Submodule in einer Sidebar verwalten
- Historie ueber einen visuellen Commit-Graph mit Suche nach Refs, Autor, Hash und Subject verstehen
- Aenderungen ueber staged/unstaged/commit-spezifische Diffs und Hunk-Aktionen pruefen
- Merge- und Rebase-Konflikte direkt in der App loesen
- Fehler ueber Reflog-basierte Werkzeuge und geschuetzte destruktive Aktionen beheben
- GitHub-Repositories klonen, forken, verbinden und veroeffentlichen
- GitHub-PRs erstellen/mergen, CI-Status pruefen und Releases veroeffentlichen
- optionale KI-Commit-Messages und Release Notes mit Ollama oder Gemini erstellen
- vor Pushes automatisch Secret-Scans ausfuehren
- Planungsdaten ueber eine lokale API und MCP-aehnliche Tools fuer Agenten bereitstellen

## Inhaltsverzeichnis

- [Warum Open-Git-Control?](#warum-open-git-control)
- [Installation](#installation)
- [Screenshots](#screenshots)
- [Kurzueberblick](#kurzueberblick)
- [Features im Detail](#features-im-detail)
  - [1) Repository- und Arbeitsbereich-Management](#1-repository--und-arbeitsbereich-management)
  - [2) Branches, Remotes, Tags, Submodule](#2-branches-remotes-tags-submodule)
  - [3) Commit Graph und Historie](#3-commit-graph-und-historie)
  - [4) Forensische Suche und Recovery](#4-forensische-suche-und-recovery)
  - [5) Staging Area, Stash, Commits](#5-staging-area-stash-commits)
  - [6) Conflict Resolver](#6-conflict-resolver)
  - [7) Diff Viewer](#7-diff-viewer)
  - [8) GitHub Integration](#8-github-integration)
  - [9) Pull Requests, CI und Workflows](#9-pull-requests-ci-und-workflows)
  - [10) Releases](#10-releases)
  - [11) KI (Ollama / Gemini)](#11-ki-ollama--gemini)
  - [12) Security und Safety](#12-security-und-safety)
  - [13) System, Updates, Job Center](#13-system-updates-job-center)
  - [14) Shortcuts und Produktivitaet](#14-shortcuts-und-produktivitaet)
  - [15) Lokale Planning API und MCP-Tools](#15-lokale-planning-api-und-mcp-tools)
- [Git installieren (wie und wo)](#git-installieren-wie-und-wo)
- [Entwicklung und lokale Builds](#entwicklung-und-lokale-builds)
- [Typische Ablaeufe](#typische-ablaeufe)
- [Einstellungen (Uebersicht)](#einstellungen-uebersicht)
- [Datenhaltung und Sicherheit](#datenhaltung-und-sicherheit)
- [Verfuegbare npm-Skripte](#verfuegbare-npm-skripte)
- [Troubleshooting](#troubleshooting)

## Features im Detail

### 1) Repository- und Arbeitsbereich-Management

- Lokale Repositories oeffnen und als aktive Working Session setzen
- Wenn ein Ordner noch kein Repo ist: direktes `git init` aus der App
- Repo-Liste mit:
  - Suche
  - Sortierung (zuletzt geoeffnet, Name, Erstellzeit)
  - Favoriten (Pin)
  - Repo schliessen
- Persistenter Workspace:
  - zuletzt aktive Repositories
  - Sortierung
  - Favoriten
- Projektplanung:
  - repositorybezogene Todos, Bugs, Features und Notizen
  - Status, Dringlichkeit, Beschreibung und frei definierbare Tags
  - eigene Tabs/Status: idea, bug, planned, in-progress, blocked, done
  - zukuenftige Projekte, die noch kein Git-Repository besitzen
  - Projektordner erstellen, `git init` ausfuehren und alle Planungseintraege automatisch zugeordnet behalten
- Resizable Layout:
  - Sidebar-Breite
  - Breite zwischen Graph und Inspector
  - Collapse-Status pro Repo fuer Branch/Tag/Remote/Submodule-Panels

### 2) Branches, Remotes, Tags, Submodule

- Branches:
  - lokale + remote Branch-Liste
  - Branch erstellen
  - Checkout
  - Kontextmenu mit Merge-Optionen
  - Umbenennen
  - Loeschen (inkl. Force-Delete-Fallback)
- Remotes:
  - Remote hinzufuegen, entfernen, umbenennen, URL aendern
  - upstream setzen fuer aktuellen Branch
  - Remote-only Branches erkennen, direkt auschecken oder mergen
  - Remote-Gesundheitsanzeige (ahead/behind/diverged/no-upstream/error)
  - Auto-Fetch in einstellbarem Intervall
- Tags:
  - lightweight oder annotated Tags erstellen
  - Tags loeschen
  - Tags pushen
  - Tag-Suche
- Submodule:
  - rekursive Statusanzeige
  - `submodule update --init --recursive`
  - `submodule sync --recursive`
  - Submodule im Dateisystem oeffnen

### 3) Commit Graph und Historie

- Visueller Commit-Graph mit Branch-/Merge-Topologie
- Suchmodus fuer Commits:
  - alles
  - subject
  - author
  - hash
  - refs
- Treffer-Navigation (vor/zurueck)
- Working-Tree-Zeile direkt ueber der Historie (staged/unstaged/untracked)
- Commit-Kontextmenu mit erweiterten Aktionen:
  - Checkout als neuer Branch
  - Detached Checkout
  - Branch erstellen
  - Tag erstellen
  - Cherry-Pick
  - Revert (bei Merge-Commit auch `revert -m 1`)
  - Reset `--soft`, `--mixed`, `--hard`
  - Interaktiver Rebase (Todo-Liste editierbar)
  - Commit-Hash kopieren
- Merge-Panel direkt im Commit-Kontextmenu:
  - Commit/Ref/Branch in aktuellen Branch mergen

### 4) Forensische Suche und Recovery

- Forensische Historie direkt im Graph:
  - String-Suche (`git log -S`)
  - Regex-Suche (`git log -G`)
  - Zeilenbereich (`git log -L`)
- Pfad-Suggestions aus Working Tree + Historie
- Treffer als Commitliste mit Direkt-Sprung in Diff
- Recovery Center (Reflog-basiert):
  - Reflog filtern und inspizieren
  - Recovery-Branch aus Reflog-Eintrag erstellen
  - Detached Checkout
  - Hard Reset mit Sicherheitsbestaetigung

### 5) Staging Area, Stash, Commits

- Bereiche fuer:
  - Konflikte
  - Staged
  - Unstaged
  - Untracked
- Dateiaktionen:
  - stage/unstage
  - stage all/unstage all
  - discard file/all
  - delete untracked
  - stage all untracked
- Diff-Statistiken fuer staged/unstaged
- Stash-Funktionen:
  - Stash mit optionaler Nachricht
  - Apply / Pop / Drop
- Commit-Form:
  - Titel + Beschreibung
  - `--amend`
  - `--signoff`
  - `Ctrl+Enter` fuer Commit

### 6) Conflict Resolver

- Eigene Conflict-Ansicht mit Datei- und Blocknavigation
- Blockbasierte Konfliktauflosung:
  - Current/Incoming side-by-side
  - pro Block: ours/theirs/both uebernehmen
  - fuer alle Bloecke: ours/theirs uebernehmen
- Manueller Conflict-Editor mit Marker-/Line-Gutter-Feedback
- Save, Save+Resolved, Reload, Discard
- `merge --continue` / `merge --abort`
- `rebase --continue` / `rebase --abort`
- Automatisches Oeffnen bei erkannten Merge-/Rebase-Konflikten

### 7) Diff Viewer

- Quellen:
  - staged
  - unstaged
  - commit-spezifisch
- Ansichten:
  - Unified
  - Side-by-Side
- Hunk-Navigation
- Hunk-Operationen:
  - Stage Hunk
  - Unstage Hunk
  - Discard Hunk
- Schutz bei grossen Diffs (Truncation + Full-Copy)
- Binary-File-Erkennung

### 8) GitHub Integration

- Auth-Methoden:
  - PAT
  - OAuth Device Flow
  - One-click Login ueber GitHub CLI (`gh`)
- Gespeicherte Login-Session mit Auto-Reconnect
- GitHub-Repoliste mit Suche, Pagination und Refresh
- Clone-Workflow mit Progress-Modal
- Beliebige Remote-Repositories per HTTP/HTTPS/SSH URL klonen
- Beliebige GitHub-Repositories per URL forken (und den Fork lokal klonen)
- Erkennung, ob ein GitHub-Repo lokal bereits vorhanden ist
- Lokales Repo ohne `origin` direkt als neues GitHub-Repo erstellen und verbinden

### 9) Pull Requests, CI und Workflows

- PR-Liste fuer das aktive Repo (open/closed/all)
- PR erstellen (title/body/head/base)
- PR-Aktionen:
  - im Browser oeffnen
  - URL kopieren
  - PR-Branch lokal auschecken
  - Merge mit Methoden: merge, squash, rebase
- CI-/Check-Auswertung pro PR:
  - badge success/failure/pending/unknown
  - Workflow Runs + Status Checks
- Actions-Workflow-Panel mit Filter und Direktlink

### 10) Releases

- Release Creator mit eigenem View
- Release Context:
  - bestehende Tags
  - letzter Release-Tag
  - Commits seit letztem Release
- Tag-Vorschlag fuer naechste Version
- Release erstellen mit:
  - Tag
  - Name
  - target commitish
  - body
  - draft/prerelease
- AI-generierte Release Notes (Deutsch/Englisch)

### 11) KI (Ollama / Gemini)

- AI Auto-Commit:
  - Aenderungen analysieren
  - Dateien logisch gruppieren
  - Commit-Messages erzeugen
  - Fortschritt in Phasen (snapshot/grouping/committing/retry/fallback)
  - laufenden Job abbrechen
- AI Release Notes aus Commit-Historie
- In Settings:
  - Provider umschalten
  - Modelle laden
  - Verbindung testen
  - Gemini API Key sicher speichern/loeschen

### 12) Security und Safety

- Optionale Bestaetigungen fuer gefaehrliche Git-Operationen
- Secret-Scan vor Push:
  - scannt staged + to-push Diffs
  - Strengegrad low/medium/high
  - Allowlist per Text/Path/Regex
  - Warn-/Bestaetigungsdialog bei Treffern
- Kontextmenu-Aktionen fuer `.gitignore`:
  - Datei
  - Ordner
  - Top-Level-Ordner
  - Dateityp-Muster

### 13) System, Updates, Job Center

- App-Updater (nur in installierten Production Builds):
  - Check
  - One-click Check+Download
  - Installation heruntergeladener Updates
  - Release Notes Anzeige
- Job Center mit Verlauf fuer laufende/abgeschlossene Jobs:
  - clone
  - fetch/pull/push
  - secret scan
  - AI auto-commit

### 14) Shortcuts und Produktivitaet

- `Ctrl+1..4`: Tabs wechseln (Local Repos, Repo, GitHub, Settings)
- `Ctrl+Shift+F`: Fetch
- `Ctrl+Shift+P`: Command Palette
- `Ctrl+Enter`: Commit ausfuehren (in Commit-Feldern)

### 15) Lokale Planning API und MCP-Tools

- Lokale HTTP-API fuer die Projektplanung, gebunden an `127.0.0.1`
- Bevorzugter Port: `2990`; wenn er belegt ist, versucht die App den naechsten freien lokalen Port
- API-Dokumentation unter `http://127.0.0.1:2990/api/`
- Maschinenlesbare API-Beschreibung unter `/api/openapi.json`
- Alle Daten- und MCP-Endpunkte erfordern einen API-Token
  - Token und Headername stehen in den Einstellungen unter `API/MCP`
  - Token als `x-open-git-control-token: <TOKEN>` oder `Authorization: Bearer <TOKEN>` senden
  - Nutzer koennen einen persistenten Token fuer 1 Tag, 1 Monat, 1 Jahr oder dauerhaft generieren
  - Persistente API-Token werden ueber Electron `safeStorage` OS-verschluesselt gespeichert; abgelaufene Tokens werden automatisch entfernt
  - Ohne persistenten Token nutzt die App einen temporaeren Token fuer den aktuellen App-Prozess
- Planner-Endpunkte fuer:
  - Projekte, Repositories, Tabs und Todos abfragen
  - naechste offene Todos nach Dringlichkeit abrufen
  - flachen Projektkontext an jedem Todo liefern (`projectName`, `projectKind`, `projectRepoPath`), damit Agenten Todos direkt zuordnen koennen
  - Todos erstellen, aktualisieren, verschieben und loeschen
  - geplante Projekte erstellen
  - Planner-Projekt fuer einen Repository-Pfad sicherstellen
- Git- und GitHub-Operationen werden bewusst nicht ueber die lokale API oder MCP-Tools bereitgestellt
- Tab-spezifische Endpunkte wie `/api/tabs/bug/todos` und `/api/tabs/working/todos`
  - `working` wird als Alias fuer `in-progress` akzeptiert
- Agenten-Shortcuts:
  - `GET /api/agent/next`
  - `GET /api/mcp/tools`
  - `POST /api/mcp/tools/call`
- MCP-aehnlicher JSON-RPC-Endpunkt unter `/mcp`
  - unterstuetzt `initialize`, `tools/list` und `tools/call`
  - stellt Planning-Tools wie `get_next_todos`, `list_todos`, `create_todo`, `move_todo` und `delete_todo` bereit
- Runtime-Steuerung:
  - `OPEN_GIT_CONTROL_API_PORT=2990` fuer den bevorzugten Port
  - `OPEN_GIT_CONTROL_API_DISABLED=true` zum Deaktivieren des lokalen API-Servers
  - `OPEN_GIT_CONTROL_API_TOKEN=<TOKEN>` fuer ein fest vorgegebenes API-Token, das gespeicherte/generierte Tokens ueberschreibt

## Git installieren (wie und wo)

Git muss installiert und im `PATH` verfuegbar sein.

### Windows

1. Offizielle Download-Seite: [git-scm.com/downloads](https://git-scm.com/downloads)
2. Windows Installer herunterladen und ausfuehren.
3. Standardoptionen sind in der Regel passend (inkl. "Git from the command line").
4. Terminal neu starten.

### macOS

Option A (empfohlen mit Homebrew):

```bash
brew install git
```

Option B (Apple Command Line Tools):

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

### Installation pruefen

```bash
git --version
git config --global user.name "Dein Name"
git config --global user.email "dein@email.de"
```

## Entwicklung und lokale Builds

### Start aus Source

Voraussetzungen:

- Node.js (aktuelles LTS)
- npm
- Git

```bash
npm install
npm run dev
```

### Lokale Build-Artefakte erstellen

```bash
npm run build
npm run dist
```

Plattform-spezifisch:

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Output liegt in `release/`.

## Typische Ablaeufe

### 1) Erstes Repo oeffnen oder neu initialisieren

1. `Lokale Repositories` -> `Repository oeffnen`.
2. Ordner auswaehlen.
3. Wenn noch kein Repo: Initialisierung bestaetigen.
4. Danach in den `Repository`-Tab wechseln.

### 2) Standard-Workflow (lokal)

1. Fetch/Pull aus der Topbar.
2. Branch erstellen oder wechseln.
3. Dateien in der Staging Area bearbeiten (stage/unstage/discard).
4. Commit erstellen (optional amend/signoff).
5. Push (optional Upstream setzen oder force-with-lease).

### 3) Konflikte loesen

1. Bei Merge-/Rebase-Konflikten oeffnet sich der Conflict Resolver.
2. Pro Block `Current`, `Incoming` oder `Both` waehlen.
3. Speichern + als geloest markieren.
4. Merge/Rebase fortsetzen.

### 4) GitHub-PR-Flow

1. GitHub verbinden (PAT/Device/One-click).
2. PR im Repo-Panel erstellen.
3. CI-Status im PR-Eintrag pruefen.
4. PR mergen (merge/squash/rebase) oder lokal auschecken.

### 5) Release-Flow

1. Topbar `Release` oeffnen.
2. Release Context aktualisieren.
3. Tag und Release-Name setzen.
4. Optional AI Release Notes generieren.
5. Release erstellen.

### 6) Recovery-Flow

1. Im Commit-Graph auf `Recovery Center` wechseln.
2. Reflog-Eintrag auswaehlen.
3. Recovery-Branch erstellen oder (vorsichtig) hard reset.

### 7) Agenten-Planning-API-Flow

1. Open-Git-Control starten.
2. `http://127.0.0.1:2990/api/` fuer die lokale API-Dokumentation oeffnen.
3. Einen externen Agenten `GET /api/agent/next?repoPath=...` aufrufen lassen, um offene Arbeit fuer ein Repository zu finden.
4. Der Agent kann Planungseintraege ueber `/api/todos` oder `/mcp`-Toolaufrufe erstellen oder verschieben.
5. Git- und GitHub-Arbeit bleibt in der Desktop-App und ist nicht ueber die lokale API oder MCP-Oberflaeche verfuegbar.

## Einstellungen (Uebersicht)

- `General`:
  - Theme
  - Sprache (DE/EN)
  - Default Branch
  - Secondary History
  - Commit Template
  - Auto-Fetch Intervall
- `Integrations`:
  - AI Provider/Modelle
  - Gemini API Key
  - GitHub OAuth Client ID
- `Security`:
  - Confirm dangerous ops
  - Secret-Scan before push
  - Secret-Scan strictness + allowlist
- `System`:
  - Update-Status
  - One-click Update
  - Install Update
  - Job Center

## Datenhaltung und Sicherheit

- Git-Operationen laufen lokal gegen dein ausgewaehltes Repo.
- Repositories/Settings werden im User-Data-Verzeichnis der App gespeichert.
- Planungsprojekte und Todos werden lokal im User-Data-Verzeichnis der App gespeichert.
- Die lokale Planning API bindet an `127.0.0.1` und stellt Planungsdaten lokalen Prozessen auf deinem Rechner bereit.
- GitHub-Token, Gemini-Key und persistente Planning-API-Token werden ueber Electron `safeStorage` OS-verschluesselt gespeichert, wenn verfuegbar.
- Falls OS-Verschluesselung nicht verfuegbar ist, werden Secrets nicht persistent gespeichert.

## Verfuegbare npm-Skripte

- `npm run dev` - Vite + Electron Development
- `npm run build` - Frontend + Electron Build
- `npm run dist` - Packaging fuer aktuelle Plattform
- `npm run dist:win` - Windows Paket
- `npm run dist:linux` - Linux Paket
- `npm run dist:mac` - macOS Paket
- `npm run test` - Tests starten
- `npm run test:coverage` - Tests mit Coverage
- `npm run test:ci` - CI-geeignete Test/Build-Kette

## Troubleshooting

- `git not found`
  - Git installieren und Terminal/PC neu starten.
  - Pruefen mit `git --version`.
- One-click GitHub Login funktioniert nicht
  - GitHub CLI installieren und `gh --version` pruefen.
- Device Flow geht nicht
  - GitHub OAuth Client ID in Settings setzen (oder `GITHUB_OAUTH_CLIENT_ID`).
- Keine PRs sichtbar
  - `origin` muss auf GitHub zeigen und Auth muss aktiv sein.
- Auto-Update nicht verfuegbar
  - Update-Funktionen sind nur in installierten Production Builds aktiv, nicht in `npm run dev`.
- Planning API ist nicht auf Port `2990` erreichbar
  - Eventuell nutzt ein anderer Prozess den Port; im App-Log steht die tatsaechliche lokale API-URL.
  - `OPEN_GIT_CONTROL_API_PORT` vor dem App-Start setzen, um einen anderen bevorzugten Port zu waehlen.

