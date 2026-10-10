# Open-Git-Control

[![CI (Linux, Windows, macOS)](https://github.com/timbornemann/Open-Git-Control/actions/workflows/ci.yml/badge.svg?branch=master&event=push)](https://github.com/timbornemann/Open-Git-Control/actions/workflows/ci.yml?query=branch%3Amaster+event%3Apush)
[![Latest release](https://img.shields.io/github/v/release/timbornemann/Open-Git-Control?sort=semver)](https://github.com/timbornemann/Open-Git-Control/releases/latest)
[![License](https://img.shields.io/github/license/timbornemann/Open-Git-Control)](LICENSE)

Open-Git-Control ist ein freier, quelloffener Desktop-Git-Client für Windows, macOS und Linux. Die App kombiniert visuellen Commit-Graph, Staging, einen Working-Directory-Dateibaum mit Editor, Diff-Ansicht, Konfliktlösung, Offline-Repository-Analysen, Hosting mit Pull/Merge Requests und CI, geführte Repository-Veröffentlichung, Releases, Projektplanung, Secret-Scanning, Recovery-Werkzeuge, Repository-Run-Workflows und optionale KI-Unterstützung in einer lokalen Anwendung.

Sprache: **Deutsch** | English version: [README.md](README.md)

Git ist erforderlich; Git LFS und GitHub CLI sind optional. Die App prüft diese Werkzeuge und bietet unter **Einstellungen → App & Diagnose → Werkzeuge** offizielle Downloads oder die Installation über einen vorhandenen Paketmanager an. Siehe [Werkzeuge einrichten](Docs/SYSTEM_TOOLS.md).

![Atlas-Workspace in der Repository-Ansicht mit Commit-Graph, Branches, Dateistatistiken und Staging](Docs/screenshots/repository.jpg)

## Warum Open-Git-Control?

Open-Git-Control ist fuer dich interessant, wenn dir ein sehr kleiner Git-Client nicht reicht, du aber trotzdem eine transparente, lokale Alternative zu kommerziellen Desktop-Clients suchst.

- Frei und open source unter der GNU-GPL-Lizenz
- Git-Operationen laufen lokal gegen deine Repositories
- Visueller Commit-Graph mit Branch-, Tag-, Merge-, Reset-, Rebase-, Cherry-Pick-, Revert- und Recovery-Aktionen
- Staging, Stash, Hunk-Diffs, Datei-Historie, Blame und Konfliktloesung in einem Workflow
- Offline-Repository-Analysen: Aktivität, Sprachverteilung, Änderungsschwerpunkte, Code Churn, Dateikopplungsnetz, Release-Vergleiche und Timeline-Wiedergabe
- Konten von GitHub, Forgejo, GitLab, Bitbucket Cloud und Data Center, Repository-Kataloge, Klonen/Forken, PRs/MRs, CI und anbieterspezifische Veröffentlichungen
- Geführter Ablauf **Repository veröffentlichen** zum Erstellen, Verbinden und Hochladen ausgewählter Branches und Tags
- Unabhängige Pull-Quellen, Hosting-Ziele und gespeicherte Push-Profile für mehrere Endpunkte mit einzelnen Ergebnissen
- Projektplanung mit lokaler REST- und MCP-aehnlicher API fuer agentengestuetzte Arbeit
- Working-Directory-Dateibaum mit sicheren In-App-Dateivorschauen und Bearbeitung sowie System-Dateiaktionen bei Bedarf
- Repository-spezifische Run-Workflows mit strukturierter Konsole, erkannten Problemen und anklickbaren Dateiverweisen zum In-App-Editor
- Optionale KI-Unterstuetzung durch Ollama, Google Gemini oder OpenAI fuer Commit-Nachrichten, Auto-Commits, Release Notes und Planner-Uebergaben
- Secret-Scanning vor Commits und Pushes, versionierte Repository-Allowlists, Sicherheitsabfragen für gefährliche Aktionen und lokale verschlüsselte Token-Speicherung, wenn vom OS unterstützt
- Geführte Git-Installation, Commit-Identität und Wiederfinden verschobener Repositories

## Downloads

Immer aktuelle Release-Seite:

[github.com/timbornemann/Open-Git-Control/releases/latest](https://github.com/timbornemann/Open-Git-Control/releases/latest)

Aktuell neuestes Release: [v2.2.1](https://github.com/timbornemann/Open-Git-Control/releases/tag/v2.2.1), veroeffentlicht am 2026-10-02.

Badge und Latest-Release-Seite bleiben automatisch aktuell. Die direkten Binary-Links unten sind durch die GitHub-Asset-Namen versioniert und werden vom Release-Workflow nach einem neuen stabilen Release aktualisiert.

| Plattform   | Paket                 | Direkter GitHub-Download                                                                                                                                               |
| ----------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64 | NSIS Installer `.exe` | [Open-Git-Control-2.2.1-win-x64.exe](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.2.1/Open-Git-Control-2.2.1-win-x64.exe)                     |
| Linux x64   | AppImage              | [Open-Git-Control-2.2.1-linux-x86_64.AppImage](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.2.1/Open-Git-Control-2.2.1-linux-x86_64.AppImage) |
| Linux amd64 | Debian-Paket `.deb`   | [Open-Git-Control-2.2.1-linux-amd64.deb](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.2.1/Open-Git-Control-2.2.1-linux-amd64.deb)             |
| macOS x64   | Disk Image `.dmg`     | [Open-Git-Control-2.2.1-mac-x64.dmg](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.2.1/Open-Git-Control-2.2.1-mac-x64.dmg)                     |
| macOS x64   | Zip-Archiv            | [Open-Git-Control-2.2.1-mac-x64.zip](https://github.com/timbornemann/Open-Git-Control/releases/download/v2.2.1/Open-Git-Control-2.2.1-mac-x64.zip)                     |

Die Dateien `latest*.yml` und `.blockmap` in GitHub Releases sind Update-Metadaten fuer den Auto-Updater. Normale Nutzer sollten einen der Installer oben herunterladen.

## Voraussetzungen

- Git muss installiert und ausführbar sein. Die App prüft den Prozess-`PATH` und übliche Installationsorte; fehlendes Git öffnet einen Einrichtungsdialog und hinterlässt bis zur erfolgreichen Prüfung ein Warnsymbol in der Seitenleiste.
- Git LFS ist optional, für LFS-Inhalte und Transfers aber erforderlich. Git for Windows liefert es normalerweise mit; die Verfügbarkeit wird trotzdem separat geprüft.
- GitHub CLI (`gh`) ist optional und nur zum Importieren einer bestehenden GitHub-CLI-Anmeldung erforderlich.
- Ollama, ein Gemini API Key oder ein OpenAI API Key ist optional und nur fuer KI-Funktionen erforderlich.
- Entwicklung aus dem Quellcode benötigt Node.js und npm. CI nutzt aktuell Node.js 22.

## Screenshots

Diese neuen Browser-Aufnahmen zeigen die tatsächliche App-Oberfläche mit fiktiven Atlas-Projekten, Konten und Team-Aktivitäten im Theme **Copper Night**. Sie stammen aus dem aktuellen Quellcode-Stand; einige Funktionen können neuer als das oben verlinkte Paket-Release sein.

Die Ansicht für das aktuelle Repository und Staging ist oben abgebildet. Diese Hauptbereiche zeigen den übrigen Arbeitsalltag in der App.

### Lokaler Repository-Workspace

Gespeicherte Projekte finden, Favoriten anpinnen, das aktive Repository erkennen sowie Projekte an einer Stelle öffnen oder klonen.

![Local Repositories mit gespeicherten Atlas-Projekten, angepinntem aktivem Repository und Öffnen-/Klonen-Aktionen](Docs/screenshots/local-repositories.jpg)

### Hosting über mehrere Anbieter

Repositories über Konten und Server hinweg durchsuchen, lokale Klone erkennen und direkt aus dem Katalog zur Erstellung oder Veröffentlichung gelangen.

![Hosting-Katalog mit GitHub-Repositories, privatem Forgejo-Mirror und passenden lokalen Klonen](Docs/screenshots/hosting-catalog.jpg)

### Offline-Statistiken und Änderungsschwerpunkte

Aktivität, Sprachverteilung und eine nach Verzeichnissen gegliederte Hotspot-Karte teilen sich eine kompakte Übersicht. Die Filter liegen in der Analyse-Seitenleiste.

![Statistikübersicht mit Wochenaktivität, Sprachanteilen und Hotspot-Treemap](Docs/screenshots/analytics-overview.jpg)

### Planung, die mit dem Repository reist

Ideen, Bugs und Umsetzungsarbeit als gemeinsames Board, gespeichert in `.Open-Git-Control/planning.json`.

![Atlas-Planungsboard mit Prioritäten, Beschreibungen und Statusspalten](Docs/screenshots/planning.jpg)

### Allgemeine Einstellungen

Einstellungen über Kategorien hinweg suchen und Erscheinungsbild, Git-Workflow, Commit-Identität, Konten, KI, Sicherheit und Diagnose konfigurieren.

![Allgemeine Einstellungen mit Kategorienavigation, Suche, Erscheinungsbild und Git-Commit-Vorgaben](Docs/screenshots/settings-general.jpg)

<details>
<summary>Weitere Ansichten: Dateikopplung, Run, Churn, Releases, Timeline, Hosting-Konten, Veröffentlichung und Einrichtung</summary>

### Dateikopplung als zusammenhängendes Netz

Gemeinsam geänderte Dateien erkunden, Partner einer Datei hervorheben und jede Verbindung prüfen. Zoom, Verschieben und die Gesamtansicht ersetzen das Blättern durch Ergebnisse.

![Dateikopplungsnetz mit ausgewählter Datei und hervorgehobenen Verbindungen](Docs/screenshots/file-coupling.jpg)

### Run-Ausgaben mit hilfreichen Diagnosen

Tests und Builds als strukturiertes Protokoll lesen, Probleme prüfen und genannte Dateien direkt im Working-Directory-Editor öffnen.

![Run-Konsole mit gruppierten Testausgaben, Fehlerhinweis und anklickbaren Quellcodepositionen](Docs/screenshots/run-console.jpg)

### Code Churn über die Zeit

![Code-Churn-Kennzahlen und beschriftetes Diagramm für hinzugefügte und gelöschte Zeilen](Docs/screenshots/code-churn.jpg)

### Statistische Release-Vergleiche

![Vergleich zweier ausgewählter Tags mit Commit-, Personen- und Nettoänderungsstatistik](Docs/screenshots/release-comparison.jpg)

### Timeline-Wiedergabe

![Canvas-Timeline mit Projektdateibaum und Wiedergabesteuerung](Docs/screenshots/timeline.jpg)

### Hosting und Pull Requests

![Hosting-Ansicht mit fiktiven Atlas-Pull-Requests und verbundenen Anbieter-Konten](Docs/screenshots/hosting.jpg)

### Hosting-Konten und Server

![Hosting-Kontoverwaltung mit getrennten GitHub- und Forgejo-Verbindungen samt Serveradressen](Docs/screenshots/hosting-accounts.jpg)

### Neues Hosting-Repository anlegen

![Veröffentlichungsassistent mit Remote-, Anmeldungs- und Branch-Auswahl](Docs/screenshots/publish.jpg)

### Unabhängige Transfer-Einstellungen

![Remote-Konfiguration mit Erklärungen zu Fetch, Pull-Strategie und Push-Zielen](Docs/screenshots/remotes.jpg)

### Erforderliche und optionale Werkzeuge

![Einstellungen mit Git, optionalem Git LFS und optionaler GitHub CLI samt Versionen und Einrichtungsaktionen](Docs/screenshots/settings-tools.jpg)

</details>

## Inhaltsverzeichnis

- [Warum Open-Git-Control?](#warum-open-git-control)
- [Downloads](#downloads)
- [Voraussetzungen](#voraussetzungen)
- [Screenshots](#screenshots)
- [Feature-Referenz](#feature-referenz)
  - [Statistik & Analyse](#statistik--analyse)
  - [Git-Werkzeuge und Commit-Identität](#git-werkzeuge-und-commit-identität)
  - [Remote-Konfiguration und Pull-Strategie](#remote-konfiguration-und-pull-strategie)
  - [Geführte Repository-Veröffentlichung](#geführte-repository-veröffentlichung)
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
- Repositories anhand lokal gefundener Icons und Logos in Seitenleiste und Repository-Liste erkennen. Über das Kontextmenü **Repository-Logo** lässt sich ein anderes Bild auswählen, auf Buchstaben umstellen oder erneut suchen. Kleine Vorschaubilder und Einstellungen bleiben lokal über Neustarts erhalten; Originalbilder und Repository-Konfiguration bleiben unverändert.
- Repositories anpinnen, schliessen und schnell zwischen bekannten Repositories wechseln.
- Nicht verfügbare Repositories mit **Neuen Speicherort auswählen** oder **Erneut prüfen** wiederfinden. Bei verschobenen Projekten bleiben Repository-Einstellungen, Planungsdaten und aktive Auswahl erhalten.
- Repository-Ordner direkt aus Local Repositories oder dem Header des aktiven Repositories im Dateisystem anzeigen.
- Vorhandene `LICENSE`-/`LICENCE`-Datei erkennen sowie Lizenzen aus gebuendelten, nachvollziehbaren SPDX-/Choose-a-License-Vorlagen anlegen oder ersetzen. Benoetigte Copyright-, Programmname-, Programmbeschreibung- und Apache/GNU-Notice-Felder werden vor dem Schreiben abgefragt.
- Gespeicherte Layout-Groessen in den Settings zuruecksetzen.
- Haupt-Sidebar und Graph/Inspector-Split vergroessern oder verkleinern.
- Eingeklappte Sidebar-Panels pro Repository fuer Remotes, Branches, Tags und Submodule merken.

### Git-Werkzeuge und Commit-Identität

- Die Startprüfung unterscheidet verfügbares, fehlendes und nicht ausführbares Git, Git LFS sowie GitHub CLI und zeigt erkannte Versionen. Ein negativer Git-Test öffnet einmal pro App-Sitzung einen Dialog; optionale Werkzeuge lösen keine Startwarnung aus.
- **Einstellungen → App & Diagnose → Werkzeuge** bietet erneute Prüfungen, offizielle Downloads und die Prüfung eines unterstützten Installationsbefehls. Die Installation startet ausschließlich durch eine Nutzeraktion, nutzt einen vorhandenen Paketmanager und die Rechte-/Zustimmungsdialoge des Betriebssystems. Erfolg wird erst nach erneuter Werkzeugprüfung gemeldet.
- Unter Windows liefert Git for Windows LFS normalerweise mit. Nach einer Git-Installation wird LFS erneut geprüft, bevor eine separate Installation angeboten wird. Repository-lokale LFS-Filter und Hooks bleiben ein eigener Einrichtungsschritt.
- Fehlendes Git pausiert Git-abhängige Arbeit, ohne gespeicherte Repositories zu entfernen. Prüfungen nach Installation, App-Fokus oder manueller Anforderung setzen die Repository-Wiederherstellung fort, sobald Git nutzbar ist. Siehe [Werkzeugerkennung und Installation](Docs/SYSTEM_TOOLS.md).
- Vor einem Commit öffnen fehlender wirksamer Git-Name oder E-Mail die **Git-Commit-Identität**. Vorhandene Werte bleiben erhalten; der Geltungsbereich ist **dieses Repository** oder **global**. Eine Hosting-Anmeldung richtet diese Angaben nicht ein.
- Name und E-Mail lassen sich später unter **Einstellungen → Allgemein → Git-Commit-Identität** ändern. Das gilt für zukünftige Commits; bestehende Commits behalten ihre Identitäten. Abbrechen erhält Commit-Entwurf und gestagte Dateien.

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
- Fetch-/Pull-Remote unabhängig von Push-Zielen auswählen; Fetch entfernt veraltete Remote-Branches.
- Remote-Tags getrennt verfolgen und vorhandene lokale Tags bei abweichenden Ziel-Commits erhalten.
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
- Bei nicht erreichbaren Endpunkten URL, Konto und Berechtigungen unter Remote-Konfiguration prüfen.
- Lightweight oder annotated Tags erstellen.
- Tags suchen, auswaehlen, loeschen und pushen.
- Rekursiven Submodule-Status anzeigen.
- `git submodule update --init --recursive` ausfuehren.
- `git submodule sync --recursive` ausfuehren.
- Submodule im Dateisystem oeffnen.

### Topbar-Git-Aktionen

- Fetch vom ausdrücklich ausgewählten Remote.
- Ausgewaehlten Branch mit waehlbarem Merge-Modus mergen.
- Normaler Pull verwendet die gespeicherte Repository-Strategie: Git-Standard, Rebase, Merge oder Nur Fast-forward.
- Ausdrückliche Pull-Dropdown-Auswahlen gelten nur für diese Operation, einschließlich eines No-fast-forward-Merge (`--no-rebase --no-ff`).
- Direkt zu einem eindeutigen oder gespeicherten Remote-Ziel pushen; bei mehreren Remotes die Ziele beim ersten Aufruf auswählen.
- Auswahlmodi für Fetch, Pull und Push unabhängig auf der Repository-Seite Remote-Konfiguration einstellen.
- **Remote-Konfiguration** aus dem Pull- oder Push-Dropdown öffnen.
- Force-with-lease gegen den geprüften Stand jedes Endpunkts bestätigen.
- Upstream ausdrücklich unter Remote-Konfiguration setzen.
- Ergebnisse je Ziel prüfen und erfolglose Ziele mit dem geprüften Commit erneut versuchen.
- Repository-spezifische Run-, Test-, Format-, Start- und Build-Workflows starten.
- Release Creator oeffnen.
- Staging/Commit-Panel oeffnen.
- Kompakte "More actions"-Varianten bei schmalen Fenstern.

### Commit Graph und Historie

- Visueller Commit-Graph mit Branch- und Merge-Topologie.
- Paged Commit Loading fuer groessere Historien.
- Working-Tree-Zeile ueber der Historie mit staged, unstaged und untracked Counts.
- Asynchrone Commit-Statistiken mit kompakter Dateianzahl und ausgerichteten hinzugefügten/gelöschten Zeilenzahlen.
- Hover oder Tastaturfokus zeigt bei gekürzten oder ausgeblendeten Informationen den vollständigen Titel, Autor, Hash, Zeitstempel, Refs und verfügbare Statistiken, auch in schmalen Fenstern.
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
  - Commit-Nachricht bearbeiten, mit erforderlichen Prüfungen für eine Historienänderung
  - ausgewaehlte Ref in aktuellen Branch mergen
  - Commit-Hash kopieren
- Tag-Auswahl springt zum getaggten Commit.

### Statistik & Analyse

Der eigene Menüpunkt **Statistik & Analyse** liegt direkt unter **Aktuelles Repository** und ist außerdem über Repository-Menü, Kontextmenü lokaler Repositories und Command Palette erreichbar. Die Ansicht bezieht sich immer auf das aktive lokale Repository. Ihre Seitenleiste enthält Unterseiten und gemeinsame Filter; ein Repository-Wechsel erfolgt weiterhin über Local Repositories oder Hosting.

| Bereich               | Auswertungen                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Überblick             | Commits, Mitwirkende, Branches, Tags, versionierte Dateien und Textzeilen, Aktivität, Sprach-/Dateitypanteile und Hotspot-Vorschau                          |
| Änderungsschwerpunkte | Verzeichnisbasierte Treemap häufig geänderter Dateien; Hover zeigt Änderungshäufigkeit, Churn, Personen und letzte Aktivität, mit Einstieg zur Dateianalyse |
| Contributions         | Responsiver Aktivitätskalender, Beiträge über Zeit und Personenkennzahlen sowie **Zuletzt geänderte Zeilen** aus Blame mit Abdeckung                        |
| Code Churn            | Hinzugefügte und gelöschte Zeilen über Zeit, deren Anteile, gesamte Änderungsmenge und Nettoveränderung                                                     |
| Dateikopplung         | Ein zusammenhängendes, zoombares Netz aller passenden Dateipaare, hervorgehobene Partner und Verbindungsdetails mit Links zur Dateianalyse                  |
| Release-Vergleich     | Tag-/Branch-/Revisionsauswahl und statistische Übersicht neuer Commits, Personen, Netto-Dateiänderungen, Dateitypen und betroffener Bereiche                |
| Timeline              | Wiedergabe des versionierten Dateibaums mit Zoom und Verschieben                                                                                            |

Standardmäßig werden alle vorhandenen lokalen und Remote-Branches einschließlich HEAD betrachtet; jeder erreichbare Commit zählt einmal. Zeitraum-, Personen- und Pfadfilter bleiben repositorybezogen gespeichert. Der separat beschriftete **Projektstand** ist standardmäßig HEAD und bestimmt Datei-, Zeilen- und Blame-Zahlen. Uncommittete Dateien und Staging-Änderungen fließen nicht ein.

Die Analyse arbeitet offline und speichert Ergebnisse in den App-Daten. Beim erneuten Öffnen erscheint der letzte Bericht sofort; anschließend werden geänderte Refs und neue Commits ergänzt, ohne unveränderte Commit-Diffs erneut auszuwerten. Unveränderte Background-Fetches bleiben ohne Analyse-Notification. Aktualisierungen erhalten Ansicht, Release-Auswahl sowie Auswahl, Zoom und Anordnung im Dateikopplungsnetz. Hintergrundarbeit zeigt Fortschritt und Abbruch im zentralen Notification-System.

Die Zählung berücksichtigt `.mailmap`-Identitäten und `.gitignore`-Regeln des ausgewählten Projektstands. Diese Ignore-Regeln wirken bei Analytics ausdrücklich auch auf versionierte und historische Pfade. Binärdateien, LFS-Pointer, Symlinks und Submodule bleiben eigene Kategorien ohne künstliche Textzeilenzahlen. Flache Historie, fehlende Objekte und unvollständige Blame-Abdeckung werden angezeigt. Hotspots beschreiben Änderungshäufigkeit; **Zuletzt geänderte Zeilen** nennt die letzte bearbeitende Person vorhandener Zeilen. Daraus werden weder Code-Komplexität noch Eigentum abgeleitet.

Dateikopplung benötigt standardmäßig drei gemeinsame Commits; Commits mit mehr als 50 berücksichtigten Dateien entfallen ausschließlich in dieser Auswertung. Release-Vergleiche trennen neu erreichbare Commits (`A..B`) von der Netto-Baumänderung zwischen den Revisionen und kennzeichnen nichtlineare Vergleiche. Siehe [Zählregeln und Cache-Verhalten](Docs/REPOSITORY_ANALYTICS.md).

### Codebase Timeline

- Einstieg über **Statistik & Analyse → Timeline**; der Staging-Inspector ist hier ausgeblendet.
- Rekonstruiert die First-parent-Historie bis zum ausgewählten Projektstand mit maximal den neuesten 5.000 Commits. Analytics-Filter bestimmen die Wiedergabepositionen; zwischenzeitliche Änderungen gehen weiterhin in den rekonstruierten Baum ein.
- Canvas-basierte File-Tree-Visualisierung.
- Zoom und Verschieben mit zwischengespeicherten Baumanordnungen und pro Bild zusammengefassten Eingaben. Wiedergabeposition, eingeklappte Verzeichnisse und Kamera bleiben beim Ansichtswechsel erhalten.
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
- Dateien oder Dateitypen per Kontextmenü mit Git LFS verwalten, mit Größenempfehlungen und sicherer Umstellung im Staging. Siehe [Git LFS im Staging](Docs/GIT_LFS.md).
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
- Manuelle und KI-/gruppierte Commits prüfen wirksame Git-Identität und Secret-Regeln. Index-Snapshots erhalten dabei unabhängige oder teilweise gestagte Änderungen.

### Working Directory und Datei-Viewer

- Rechten Inspector zwischen Staging Area und repositorygebundenem Working-Directory-Dateibaum umschalten.
- Sichtbare Dateien und Ordner ohne `.git` oder weitere Dot-Entries durchsuchen; aufgeklappte Ordner bleiben beim Umschalten erhalten und werden lazy geladen.
- Kontextaktionen fuer Dateien und Ordner: oeffnen, umbenennen, ausschneiden, kopieren, einfuegen, loeschen, im Dateisystem zeigen, extern oeffnen oder Anwendung waehlen. Copy/Cut/Paste bleibt im aktiven Repository, destruktive Aktionen verlangen eine Bestaetigung.
- Dateien und Ordner erstellen, mehrere Einträge für Sammelaktionen auswählen sowie Präfixe oder Suffixe beim Umbenennen ergänzen.
- Repository-Dateinamen und Textinhalte durchsuchen, Treffer prüfen und Text über die Working-Directory-Suche ersetzen.
- Dateien im Hauptbereich statt des Graphen oeffnen:
  - editierbarer, syntaxhervorgehobener Text mit explizitem Speichern und `Ctrl/Cmd+S`
  - Markdown-Editor und Vorschau
  - sichere Bild- und SVG-Vorschau
  - abgeschirmte HTML-/HTM-Vorschau
  - History- und Blame-Tabs
  - sichere Informationsansicht fuer Binaer- oder zu grosse Dateien mit System-Oeffnen-Aktionen
- Working Directory, Staging und Commit-Diffs nutzen einen gemeinsamen Viewer mit Text, Diff, Vorschau, CSV-Tabelle, History und Blame. Working Directory startet im Text; geänderte Dateien und Commits starten im Diff.
- **Arbeitsdatei speichern** schreibt den Working Tree. **Staging speichern** bearbeitet nur den ausgewählten Index-Eintrag und erhält teilweise gestagte Änderungen, andere gestagte Dateien und die Arbeitsdatei. Commit-Versionen bleiben schreibgeschützt, auch in Werkzeugen und CSV-Zellen.
- Vorschau, relative Assets und Hashes verwenden die ausgewählte Quelle. Fehlende Assets werden erklärt, statt aus einer anderen Version geladen.
- Aufklappbare Textwerkzeuge bieten JSON-/JSONC-Formatierung, CSV-Tabellenbearbeitung und kopierbare Inhaltshashes.
- Ungespeicherte Entwürfe überstehen Wechsel zwischen Text, Tabelle und Vorschau. Vor Diff, anderer Datei/Quelle/Repository oder Schließen wird Speichern, Verwerfen oder Abbrechen angeboten. Externe Änderungen und Index-Sperren verhindern Überschreiben und erhalten den Entwurf.

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

### Hosting-Integration

**Repository veröffentlichen** führt ein bestehendes lokales Repository durch Anbieter- und Kontowahl, Remote-Einrichtung und den sicheren Upload ausgewählter Branches und Tags. Bestehende Remotes und Tracking bleiben standardmäßig erhalten; unterbrochene Schritte lassen sich fortsetzen. Siehe [Repository-Veröffentlichung](Docs/REPOSITORY_PUBLICATION.md).

Der gemeinsame **Hosting**-Bereich verwaltet mehrere Server und Konten gleichzeitig. Native Git-Funktionen bleiben mit jedem passenden Git-Server nutzbar. Adapter ergänzen Repository-Kataloge, Erstellen, Forks, PRs/MRs, CI und Veröffentlichungen für GitHub, Forgejo, GitLab sowie Bitbucket Cloud und Data Center. Verfügbare Aktionen richten sich nach API, Serverversion und Repository-Berechtigungen. Die [Hosting-Dokumentation](Docs/HOSTING.md) beschreibt Anmeldung, OAuth, Endpunktauswahl und Anbieterunterschiede.

Die gemeinsame [Remote-Konfiguration](#remote-konfiguration-und-pull-strategie) macht Git-Transferquellen, Hosting-Ziele und Anmeldung ausdrücklich sichtbar.

Kann das installierte Git einzelne Push-URLs nicht isolieren, veröffentlicht ein normaler Push alle URLs dieses benannten Remote als Gruppe. Force, gezielte Wiederholung und unterschiedliche ausdrücklich zugeordnete Hosting-Konten innerhalb einer solchen Gruppe benötigen getrennte benannte Remotes oder ein Git-Update.

- Verbindungen unter **Hosting → Konten & Server** hinzufügen, einschließlich eigener Server-URLs und Installationspfade.
- Mit Token oder pro Verbindung konfiguriertem Browser-OAuth anmelden. GitHub unterstützt außerdem Device Flow und CLI-Import nach Prüfung des angebotenen Kontos.
- Gespeicherte Konten erneut verbinden, abmelden oder Verbindungen entfernen.
- Repository-Kataloge durchsuchen, seitenweise laden und aktualisieren; passende lokale Klone erkennen.
- Katalog-Repositories mit ausgewähltem Konto und Fortschrittsanzeige klonen oder direkt eine Git-URL verwenden.
- Repositories erstellen oder forken, wenn der Anbieter dies unterstützt, und mit einem ausdrücklich gewählten lokalen Remote-Namen verbinden.
- Tatsächliche Fetch-/Push-URLs ihrem Hosting-Konto zuordnen. Bei SSH-Aliasen löst eine Repository-Web-URL die Identität auf; die SSH-Remote-URL bleibt erhalten.
- Für die Git-Anmeldung je Endpunkt zwischen zugeordnetem Hosting-Konto und vorhandenen System-/SSH-Zugangsdaten wählen.

### Remote-Konfiguration und Pull-Strategie

- **Remote-Konfiguration** ist über Repository-Seitenleiste, Aktionsmenü und unten in den Pull-/Push-Dropdowns erreichbar. Die geführte Transfer-Seite erklärt Herunterladen, Integration und Hochladen getrennt und zeigt den nächsten Transfer vor dem Speichern.
- Fetch- und Pull-Quelle, ein Hosting-Ziel und ein oder mehrere Push-Ziele unabhängig wählen. Eine einzelne/gespeicherte Auswahl direkt verwenden oder für jede Aktion getrennt immer nachfragen. Verbindungen & Konten verwaltet Endpunkt-URLs und Kontozuordnungen.
- **Git-Standard**, **Rebase**, **Merge** oder **Nur Fast-forward** als Repository-Pull-Strategie speichern. Git-Standard zeigt die wirksame Git-Konfiguration und bleibt für bestehende Repositories der Standard. Alle normalen Pull-Einstiege verwenden diese Einstellung; ausdrückliche Dropdown-Modi gelten einmalig.
- Fehlgeschlagene Pull-Wiederholungen behalten Quelle, Branch und Strategie. Push-Profile können denselben geprüften Commit auf Hauptserver und Backup übertragen, während Upstream-Tracking und mehrere Push-URLs erhalten bleiben. Ergebnisse unterscheiden Erfolg und Fehler je Ziel; Wiederholung adressiert erfolglose Ziele.
- Erweiterte Branch-Zuordnungen, Push-Profile und Upstream-Einstellungen bleiben verfügbar, ohne für normale Transfers erforderlich zu sein. Speichern startet keinen Transfer.

### Geführte Repository-Veröffentlichung

**Repository veröffentlichen** ist ein gemeinsamer Ablauf aus lokaler Seitenleiste, Repository-/Aktions-/Kontextmenüs, Remote-Konfiguration, Hosting und Command Palette. Die Seite nutzt die volle Breite, erhält die lokale Seitenleiste und schützt ungespeicherte Editoränderungen.

1. **Hosting-Ziel:** Anbieter, Server, Konto und persönliches/Organisations-/Namespace-/Workspace-/Projektziel auswählen. Der lokale Ordner schlägt den Namen vor; Sichtbarkeit ist standardmäßig privat.
2. **Verbindung & Inhalt:** freien Remote-Namen, HTTPS mit gewähltem App-Konto oder SSH/System-Zugangsdaten und Hauptbranch auswählen. Weitere Branches und Tags sind ausdrücklich wählbar. Bestehende Remotes und Tracking bleiben erhalten, sofern **Als neues Hauptziel verwenden** nicht ausdrücklich aktiviert wird.
3. **Veröffentlichen:** erfassten Commit-Stand prüfen und **Erstellen und veröffentlichen** wählen. Die App erstellt ein leeres Hosting-Repository, verbindet das neue Remote und lädt über den gemeinsamen Secret-Scan-/LFS-/Anmeldeablauf hoch. Nach geprüftem Upload werden Default-Branch und gewünschtes Tracking eingerichtet.

GitHub und Forgejo unterstützen persönliche oder Organisationsziele; GitLab Namespaces sowie Gruppen/Untergruppen; Bitbucket Cloud benötigt Workspace und ausgewähltes Projekt, Data Center ein bestehendes Projekt. Anbieter-Berechtigungen bestimmen die Verfügbarkeit. Ein gleichnamiges vorhandenes Repository wird nicht stillschweigend übernommen.

Uncommittete Dateien werden angezeigt und nicht automatisch committed. Ohne Commit bleibt **Erstellen und verbinden** möglich, anschließend Staging und Fortsetzung nach dem ersten Commit. Detached HEAD verlangt die Wahl oder Erstellung eines Branches. Sitzungsentwürfe sind nach Repository und Konto getrennt; erledigte Einrichtungsschritte werden lokal ohne Zugangsdaten gespeichert. Ein fehlgeschlagener Upload oder Abschluss kann deshalb am erstellten Repository fortgesetzt werden, ohne es doppelt anzulegen. Siehe [Veröffentlichung und Wiederaufnahme](Docs/REPOSITORY_PUBLICATION.md).

### Pull Requests, CI und Workflows

- PR-/MR-Listen und Checks verwenden das ausdrücklich gewählte Hosting-Ziel und Konto.
- Nach Status filtern, Requests mit ausdrücklich gewählten Quell-/Zielrepositories und Branches erstellen sowie URLs öffnen oder kopieren.
- Requests lokal auschecken und mit vom Repository unterstützten Methoden mergen: Merge Commit, Squash oder Rebase.
- GitHub-/Forgejo-Actions, GitLab-Pipelines, Bitbucket-Cloud-Pipelines oder Data-Center-Buildstatus anzeigen.
- Jobs/Schritte, begrenzte Logs und Artefakte prüfen; Runs starten, abbrechen oder wiederholen, soweit API und Berechtigungen dies unterstützen.
- Nicht unterstützte CI-Aktionen zeigen ihre Verfügbarkeit und bei Bedarf einen Link zur Anbieter-Webseite.

### Release Creator

- Gemeinsamer Release Creator über die volle Breite aus Repository-Topbar, Aktionsmenü und Command Palette oder **Release erstellen** in Hosting. Die lokale Seitenleiste bleibt sichtbar; der Creator besitzt eine eigene Commit-Historie.
- Sitzungsentwürfe sind nach lokalem Repository und vollständiger Hosting-Identität getrennt. Öffnen oder Verlassen veröffentlicht nichts.
- Markdown-Notes mit Vorschau bearbeiten; fehlgeschlagener Upload oder lokale Tag-Einrichtung lassen sich wiederholen, ohne den Release erneut zu veröffentlichen.
- Release-Kontext des ausdrücklich ausgewählten Endpunkts lesen:
  - Repository URL
  - bestehende Tags
  - letzter Release-Tag
  - Commits ab optionalem Start-Tag/Ref für Release-Notes
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
- Direkt **Notes aus Vorlage erstellen**: deutsche/englische Patch-, Minor- oder Major-Texte mit automatisch gruppierter Commit-Liste, einschließlich Commit-Beschreibungen. Die Erstellung benötigt weder KI noch Netzwerk; wenn der Hosting-Kontext fehlt, wird das lokale Git-Log verwendet (bis zu 400 Commits). Eine explizite Notes-Ausgangsrevision begrenzt die lokale Historie; ohne diese wird keine letzte Veröffentlichung angenommen.
- Commit-Beschreibungen fließen auch in den KI-Kontext ein. Leere Breaking-Changes-Abschnitte und Platzhalter wie „None“ entfallen; tatsächliche Migrationshinweise bleiben erhalten.
- KI-Notes anpassen:
  - Sprache Englisch/Deutsch
  - Merge Commits ausschliessen
  - in Sektionen gruppieren
  - mehr technische Details
  - Breaking-Changes-Sektion
  - automatische Commit-Liste anhaengen
  - Commit Hashes anzeigen
- Native Releases auf GitHub, Forgejo und GitLab veröffentlichen; Tags & Downloads auf Bitbucket Cloud sowie Tags/lokale Notes auf Data Center verwalten. Draft und Prerelease erscheinen nur bei Unterstützung.

### Projektplanung

- Planning View fuer repositorygebundene Projekte und zukuenftige Projekte.
- Planungsdaten eines Repositorys werden in `.Open-Git-Control/planning.json` versioniert. Die Datei enthaelt keine maschinenspezifischen Pfade, deshalb liest und schreibt jeder Checkout denselben Inhalt und die Datei kann im Team committet werden.
- Planungsdaten, die ausserhalb der App geaendert werden (zum Beispiel durch Pull, Checkout oder Branch-Wechsel), werden ohne Neustart automatisch uebernommen.
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

### Funktionen der lokalen Planning API und MCP

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
- Git- und Hosting-Operationen werden bewusst nicht ueber die lokale API oder MCP-Oberflaeche exportiert.

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
  - scannt staged Diffs lokal vor einem Commit
  - prüft jeden gewählten Push-Endpunkt frisch und scannt nur dort fehlende Commits, einschließlich aller Zwischenstände, in denen Secrets hinzugefügt und später entfernt wurden
  - berücksichtigt mehrere Endpunkte, ausgewählte Branches/Tags und Force-Push-Pläne; gemeinsame Commits werden innerhalb eines Scans nur einmal geprüft
  - überspringt die Historienprüfung ohne neue Commits; bei unklarer Remote-Basis folgt ein vollständiger Scan mit angezeigtem Grund
  - richtet Fortschritt am tatsächlichen Prüfumfang aus
  - unterstuetzt Abbruch
  - meldet Treffer mit Rule, Severity, Datei, Zeile und bereinigtem Kontext
  - nutzt app-eigene Dialoge zum Abbrechen, Fortfahren oder Hinzufuegen betroffener Dateien zur Allowlist
  - formatiert GitHub-Push-Protection-Ablehnungen als handlungsorientierten Dialog mit relevanten Links und Hinweisen
- Secret-Scan-Strengegrad:
  - low
  - medium
  - high
- Repository-Secret-Scan-Allowlist: `.Open-Git-Control/secret-scan-allowlist.txt`
  - **Secret-Scan-Allowlist** aus Repository-Menü, Kontextmenü lokaler Repositories, Command Palette oder Scan-Dialog öffnen
  - gespeicherte Working-Tree-Regeln gelten sofort für Commit-, Push- und KI-Auto-Commit-Scans; Staging oder Committen ist dafür nicht nötig
  - **Dateien erlauben und committen** stagt die gesamte aktualisierte Allowlist, prüft den Index erneut und nimmt sie in denselben Commit auf; fehlgeschlagenes Staging stoppt den Commit
  - Speichern im Editor oder Erlauben während eines Pushs stagt und committet die Datei nicht; normal committen, um die Regeln im Team zu teilen
  - fehlende Dateien bedeuten keine Ausnahmen; Lesen erstellt keine Datei
  - Speichern erkennt gleichzeitige Änderungen; Regeländerungen machen bestehende Scan-Freigaben ungültig
  - **Dateien erlauben** ergänzt repositoryrelative Pfade und prüft vor der Fortsetzung erneut
  - frühere Einstellungen migrieren nur nachweislich passende `path:`-Regeln für bekannte Repositories; bestehende Repository-Regeln bleiben erhalten
  - allgemeiner Text, Regex und nicht zuordenbare frühere Regeln werden nicht übernommen; nicht verfügbare bekannte Repositories werden beim Öffnen erneut geprüft
  - Formate pro Zeile (UTF-8, maximal 256 KiB): `path:...`, `regex:...`, freier Text oder Kommentar mit `#`
- Hosting-Zugangsdaten, KI-Schlüssel und persistente Planning-API-Token werden OS-verschluesselt ueber Electron `safeStorage` gespeichert, wenn verfuegbar.
- Wenn OS-Verschluesselung nicht verfuegbar ist, werden Secrets nicht persistent gespeichert.

### Settings, Updates und Job Center

- Fünf Kategorien mit gemeinsamer kompakter Gestaltung: **Allgemein**, **Konten & Server**, **KI & API**, **Sicherheit** und **App & Diagnose**.
- **Einstellungen suchen** findet Gruppen über alle Kategorien hinweg und öffnet den passenden Abschnitt. Das Löschen der Suche erhält ausstehende Feldentwürfe.
- Nur der Inhalt scrollt; Überschrift und Suche bleiben sichtbar. Schmale Fenster bieten zusätzlich eine Kategorieauswahl.
- API-Referenzen, Anfragebeispiele und Update-Release-Notes werden bei Bedarf aufgeklappt.
- Deaktivierte Aktionen erklären die fehlende Voraussetzung und verlinken deren Einrichtung, beispielsweise die OAuth Client ID einer Verbindung. Git-Fehler ergänzen eine kurze Erklärung und passende Aktion (Anmelden, Git installieren, Verbindung erneut prüfen oder Konflikt öffnen); technische Ausgabe bleibt aufklappbar.
- Allgemein:
  - Theme
  - Sprache
  - Default Branch
  - Layout zuruecksetzen
  - Secondary History
  - Commit Signoff Default
  - Commit Template
  - Repository-/globale Git-Commit-Identität
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
- Konten & Server:
  - Hosting-Konten, Server-/API-URLs, Token und OAuth-Konfiguration je Verbindung
- KI & API:
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
- Sicherheit:
  - Bestaetigungen fuer gefaehrliche Operationen
  - Secret-Scan vor Commit
  - Secret-Scan vor Push
  - Strictness
  - Repository-Allowlists auf der Unterseite **Secret-Scan-Allowlist** des jeweiligen Repositorys
- App & Diagnose:
  - Status und Versionen von erforderlichem Git und optionalem Git LFS/GitHub CLI, erneute Prüfungen, offizielle Downloads und geprüfte Installationsaktionen
  - installierte App-Version
  - Updater-Status
  - verfuegbare Version
  - Download-Fortschritt
  - Background-Update-Toggle
  - One-click Update
  - Release Notes
  - kopierbarer, bereinigter Diagnosebericht
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

- `Ctrl/Cmd+1..6`: Local Repositories, Aktuelles Repository, Hosting, Einstellungen, Todos und Statistik & Analyse in dieser Reihenfolge
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

1. Fetch oder Pull in der Topbar starten. Eine einzelne oder gespeicherte Quelle wird direkt verwendet; sonst Quelle und Auswahlmodus festlegen.
2. Branch erstellen oder wechseln.
3. Geaenderte Dateien im Working Directory pruefen.
4. Diffs oeffnen, Dateien oder Hunks stagen und bei Bedarf stashen.
5. Commit mit Titel und Beschreibung erstellen. Bei fehlendem Namen oder E-Mail die Git-Identität im Dialog für dieses Repository oder global einrichten.
6. Den aktuellen Branch mit Push direkt auf die einzelnen oder gespeicherten Ziele veröffentlichen. Bei mehreren Remotes die Ziele beim ersten Aufruf wählen. Tags über die separate Tag-Aktion veröffentlichen; Force und Secret-Treffer weiterhin bestätigen. Upstream bei Bedarf separat setzen.
7. Ergebnisse je Ziel prüfen; erfolglose Ziele mit dem geprüften Stand erneut versuchen.

### Bestehendes lokales Repository veröffentlichen

1. **Repository veröffentlichen** für das aktive lokale Repository öffnen und verbundenes Hosting-Konto sowie Erstellungsziel auswählen.
2. Privaten Repository-Namen, neues Remote, Hauptbranch und zusätzliche Branches/Tags prüfen. Arbeitsänderungen vorher in Staging committen, wenn sie hochgeladen werden sollen.
3. **Erstellen und veröffentlichen** wählen, mögliche Secret-Funde prüfen und dem Fortschritt je Schritt folgen.
4. Den Repository-Link öffnen. Bei fehlgeschlagenem Upload oder Abschluss den ausstehenden Schritt am selben erstellten Repository fortsetzen.

### Repository-Statistiken erkunden

1. Lokales Repository aktivieren und **Statistik & Analyse** in der seitlichen Menüleiste öffnen.
2. Historien-/Zeitraum-/Personen-/Pfadfilter in der Seitenleiste verwenden und den versionierten Projektstand separat wählen.
3. Hotspots oder Dateikopplungsnetz erkunden, eine Datei zur Analyse anklicken oder zwei Tags über die Release-Dropdowns vergleichen.
4. Timeline zur Wiedergabe des versionierten Dateibaums öffnen. Beim erneuten Öffnen verwendet Analytics den gespeicherten Bericht.

### Konflikte loesen

1. Merge, Pull, Rebase, Cherry-Pick oder eine andere Operation starten, die Konflikte erzeugt.
2. Conflict Resolver oeffnen, wenn er erscheint.
3. Jeden Block mit current, incoming oder both loesen.
4. Manuellen Editor nutzen, wenn das Ergebnis Feinschliff braucht.
5. Speichern und Dateien als resolved markieren.
6. Merge/Rebase im Resolver fortsetzen oder abbrechen.

### Hosting-Flow für Pull / Merge Requests

1. Anbieter-Konto unter Hosting → Konten & Server hinzufügen und mit Token oder konfigurierter Browser-Anmeldung anmelden.
2. Konto und Hosting-Endpunkt unter Remote-Konfiguration auswählen.
3. PR / MR aus der Repo-Sidebar öffnen und Quell- sowie Zielrepository ausdrücklich auswählen.
4. Request-Checks und die CI-Ansicht des Anbieters prüfen.
5. Request öffnen, kopieren oder auschecken; nach Prüfung des Head-Commits mit einer verfügbaren Methode mergen.

### Release Flow

1. **Release** in der Repository-Topbar oder **Release erstellen** in Hosting öffnen. Hosting aktiviert zuerst einen ausgewählten lokalen Klon; ohne Klon werden Klonen/Öffnen angeboten.
2. Der Creator verwendet das konfigurierte Veröffentlichungsziel oder lässt zwischen mehreren Endpunkten wählen. Fehlende Konten oder Zuordnungen bieten Konfigurationslinks.
3. Ausgangspunkt sind aktueller Branch und Patch-Vorschlag. Version, Zielbranch/Tag/Commit, optionale Notes-Ausgangsrevision, Markdown-Notes und KI-Optionen anpassen; Dateien vor dem Veröffentlichen auswählen.
4. **Release erstellen** prüft den Endpunkt. Bei fehlenden Commits **Push und Release erstellen**, **Ohne Push erstellen** (soweit verfügbar) oder Abbrechen wählen. Der bestätigte Push überträgt ausschließlich den erfassten Release-Branch an diesen Endpunkt, auch wenn ein anderer Branch ausgecheckt ist. Backup-Ziele und Upstream bleiben erhalten; vor dem Release wird erneut geprüft.
5. Draft, Prerelease und Dateianhänge erscheinen nur bei Unterstützung. Nach Upload-Fehlern bleiben hochgeladene und ausstehende Dateien sichtbar; Wiederholung sendet nur ausstehende Dateien.
6. Der Abschluss erstellt das lokale Tag am geprüften veröffentlichten Commit, aktualisiert die Release-Historie und öffnet einen frischen Entwurf mit nächster Patch-Version. Notes, ausgewählte Dateien und Veröffentlichungsflags werden zurückgesetzt; Notes-Voreinstellungen bleiben. Bestehende lokale Tags bleiben erhalten. Eine gescheiterte lokale Tag-Einrichtung kann nach Beheben der Sperre/des Konflikts wiederholt werden, ohne den Release erneut zu veröffentlichen.
7. Auf Bitbucket Cloud Tags und separate Downloads verwenden; auf Data Center Tags sowie kopierte/gespeicherte lokale Notes. Alle Anbieter teilen Creator und KI-Optionen.

### Recovery Flow

1. Recovery Center im Graph-Bereich oeffnen.
2. Reflog-Eintraege filtern.
3. Recovery-Branch aus relevantem Eintrag erstellen.
4. Detached Checkout oder Hard Reset nur verwenden, wenn du sicher bist.

### Agenten-Planning-Workflow

1. Open-Git-Control starten.
2. Einstellungen → KI & API öffnen, **URLs und Zugriff** aufklappen und MCP-URL plus Token kopieren.
3. Externen Agenten mit MCP-URL oder REST-Endpunkten konfigurieren.
4. Agent nach `get_next_todos` oder `GET /api/agent/next` fragen.
5. Agent Planungseintraege erstellen oder verschieben lassen.
6. Git- und Hosting-Arbeit in der Desktop-App behalten.

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

Startdialog und **Einstellungen → App & Diagnose → Werkzeuge** bieten offizielle Downloads und, soweit unterstützt, Installation über einen vorhandenen Paketmanager. Nach der Installation **Erneut prüfen** wählen; Git-abhängige Arbeit wird bei nutzbarem Werkzeug fortgesetzt. Die manuellen Möglichkeiten unten bleiben verfügbar. Siehe [Werkzeugerkennung und Installation](Docs/SYSTEM_TOOLS.md).

### Windows

1. Git von [git-scm.com/downloads](https://git-scm.com/downloads) herunterladen.
2. Windows Installer ausfuehren.
3. "Git from the command line" aktiviert lassen.
4. In der App **Erneut prüfen** wählen. Die App nur neu starten, wenn die Installation weiterhin nicht erkannt wird.

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
```

Name und E-Mail unter **Einstellungen → Allgemein → Git-Commit-Identität** mit Repository- oder globalem Geltungsbereich setzen. Die entsprechenden globalen Git-Befehle sind:

```bash
git config --global user.name "Dein Name"
git config --global user.email "dein@email.de"
```

## Repository-Run-Kommandos

Das **Run**-Menue in der Topbar startet repository-spezifische **Run**-, **Test**-, **Format**-, **Start**- und **Build**-Befehle. Die Konfiguration wird versioniert in `.Open-Git-Control/run.json` abgelegt; Befehle laufen nur nach einem expliziten Klick und immer mit dem Repository-Root als Arbeitsverzeichnis. Da die Datei per Git geteilt wird, zeigt die App die exakten Befehle einer Aktion vor der ersten Ausführung und nach jeder Änderung (z. B. nach einem Pull) in einem Bestätigungsdialog an.

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

Dateiverweise in Konsole, aufgeklappten technischen Details und **Probleme** öffnen die aktuelle Arbeitsdatei im App-Editor an der gemeldeten Zeile und Spalte. Relative Pfade werden vom Run-Arbeitsverzeichnis aus aufgelöst; absolute Pfade und lokale Datei-URLs müssen zum selben Repository gehören. Der Run läuft beim Öffnen weiter; der vorhandene Schutz ungespeicherter Editoränderungen greift.

Die **Run-Konsole** zeigt standardmäßig ein strukturiertes Protokoll: Terminal-Farb-/Cursorsteuerung und OSC-Sequenzen werden entfernt, wiederholte Warnungen sowie Watcher-/Fortschrittsmeldungen gruppiert. Stacktraces und Folgefehler von Paketmanagern bleiben als Details aufklappbar. Der Inhalt bestimmt die Schwere, normale stderr-Informationen werden deshalb nicht als Fehler dargestellt. **Klartext** und **Ausgabe kopieren** erhalten das vollständige bereinigte Protokoll innerhalb der bestehenden 4.000-Zeilen-/2-MiB-Grenzen. Filter, Zeilenumbruch und automatisches Folgen bleiben verfügbar; Hochscrollen pausiert das Folgen. Bekannte npm-/pnpm-, Node.js-, Vite- und Cargo-Probleme werden auch ohne eigenen Parser erkannt. Portkonflikte, nicht unterstützte Node.js-Versionen, fehlende Befehle und Dependencies bieten nächste Schritte. PowerShell nutzt explizit UTF-8-Ausgabe; Projektbefehle werden nicht automatisch geändert oder neu gestartet.

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
- Repository-Planung, Run-Konfiguration und Secret-Scan-Allowlists liegen in `.Open-Git-Control/planning.json`, `run.json` und `secret-scan-allowlist.txt`; durch Committen lassen sie sich im Team teilen. Zukünftige Planungsprojekte bleiben in den App-Daten.
- Analytics-Caches liegen ausschließlich in App-Daten und speichern Metadaten, Zahlen und Aggregate statt vollständiger Datei-/Patch-Inhalte. Die Analyse führt keinen Checkout durch und ändert den Index nicht.
- Wiederaufnahmedaten der Repository-Veröffentlichung werden lokal ohne Zugangsdaten gespeichert.
- Die Planning API bindet an `127.0.0.1`.
- Token-geschuetzte Planning-API-Endpunkte sind fuer lokale Prozesse auf derselben Maschine gedacht.
- Hosting-Zugangsdaten, KI-Schlüssel und persistente Planning-API-Token werden mit OS-gestuetzter Verschluesselung ueber Electron `safeStorage` gespeichert, wenn verfuegbar.
- Wenn OS-Verschluesselung nicht verfuegbar ist, werden Secrets nicht persistent gespeichert.
- Die lokale API stellt nur Planungsdaten bereit; sie exportiert keine Git- oder Hosting-Aktionen.

## Troubleshooting

### `git` nicht gefunden

- Warnsymbol oder **Einstellungen → App & Diagnose → Werkzeuge** öffnen. Fehlgeschlagene Prüfung ansehen, Git installieren oder offiziellen Download verwenden, dann **Erneut prüfen** wählen.
- Gespeicherte Repositories bleiben erhalten; nach erfolgreicher Prüfung wird die Wiederherstellung fortgesetzt. Die App nur neu starten, wenn die Installation durch erneute Prüfung nicht erkannt wird.
- Dieselbe Werkzeugseite verwaltet optionales LFS und GitHub CLI; `git --version` hilft bei manueller Prüfung.

### Commit-Name oder E-Mail fehlt

- Die **Git-Commit-Identität** im angebotenen Dialog einrichten oder **Einstellungen → Allgemein → Git-Commit-Identität** öffnen. Repository- oder globalen Geltungsbereich wählen und wirksame Werte prüfen.
- Hosting-Anmeldedaten ersetzen die Git-Autor-/Committer-Identität nicht.

### Repository wurde verschoben

- Beim nicht verfügbaren Repository **Neuen Speicherort auswählen** und den neuen Ordner wählen; **Erneut prüfen** nutzen, wenn der bisherige Speicherort wieder verfügbar ist.
- Neu zuordnen erhält Einstellungen und Planungszuordnung; Entfernen ist nicht erforderlich.

### GitHub-CLI-Anmeldung lässt sich nicht importieren

- GitHub CLI von [cli.github.com](https://cli.github.com/) installieren.
- Mit `gh --version` pruefen.
- Prüfen, ob die CLI am konfigurierten Host angemeldet ist; den angebotenen Nutzernamen vor dem Import prüfen.
- Token oder Device Flow nutzen, wenn GitHub CLI nicht verwendet werden soll.

### Device Flow funktioniert nicht

- GitHub-Verbindung unter Hosting → Konten & Server bearbeiten und ihre OAuth Client ID eintragen.
- Device Flow für diese OAuth-Anwendung aktivieren und den angezeigten Code vor Ablauf im Browser bestätigen.

### Keine Pull / Merge Requests sichtbar

- Beim passenden Anbieter-Konto anmelden und Repository-/Request-Berechtigungen prüfen.
- Gewünschtes Hosting-Repository und Konto unter Remote-Konfiguration auswählen; SSH-Aliase über die Repository-Web-URL zuordnen.
- Repository und PR-/MR-Ansicht aktualisieren. Der Git-Remote darf beliebig heißen.

### Commit oder Push wird vom Secret-Scan blockiert

- Gemeldete Datei und Zeile pruefen.
- Secret entfernen oder rotieren, falls es versehentlich committed wurde.
- Die Allowlist-Aktion im Dialog nur fuer beabsichtigte Test- oder Beispielwerte verwenden; sie erlaubt den betroffenen Dateipfad bei künftigen Scans.
- Ausnahmen liegen in `.Open-Git-Control/secret-scan-allowlist.txt` des aktuellen Repositorys. Die Datei committen, um sie zu teilen. Bei externen Änderungen den Editor neu laden, erhaltenen Entwurf prüfen und erneut speichern.
- Allowlist nur eng fuer absichtliche Dummy-/Beispielwerte setzen.

### Auto-Update nicht verfuegbar

- Auto-Update funktioniert nur in installierten Production Builds.
- `npm run dev` und lokale unverpackte Builds nutzen den Updater nicht.

### Planning API laeuft nicht auf Port `2990`

- Eventuell nutzt ein anderer lokaler Prozess den Port.
- In Einstellungen → KI & API steht der tatsächliche Port.
- `OPEN_GIT_CONTROL_API_PORT=<PORT>` vor dem App-Start setzen, wenn ein anderer bevorzugter Port gewuenscht ist.

### KI-Funktionen reagieren nicht

- Fuer Ollama Server-URL und Modellnamen pruefen.
- Fuer Gemini gueltigen API Key speichern und passendes Modell auswaehlen.
- "Test connection" und "Load models" unter Einstellungen → KI & API nutzen.

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
