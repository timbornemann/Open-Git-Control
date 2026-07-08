# Zu Open-Git-Control beitragen

Sprache: **Deutsch** | English version: [CONTRIBUTING.md](CONTRIBUTING.md)

Danke, dass du Open-Git-Control verbessern moechtest. Das Projekt freut sich ueber Bug Reports, Feature Requests, Fragen, Dokumentationsverbesserungen, Tests und fokussierte Code-Aenderungen.

## Wie du beitragen kannst

- Nutze die strukturierten GitHub-Formulare fuer Bugs, Feature Requests, Fragen und Dokumentationsmeldungen.
- Suche vor dem Erstellen eines neuen Issues nach bestehenden Issues.
- Halte Pull Requests auf ein Problem oder ein Feature fokussiert.
- Melde Sicherheitsluecken nicht in oeffentlichen Issues. Nutze stattdessen GitHub private vulnerability reporting.

## Entwicklungsumgebung

Voraussetzungen:

- Git ist installiert und im `PATH` verfuegbar
- Node.js 20 und npm
- GitHub CLI (`gh`) nur, wenn du den One-click-GitHub-Login testen willst
- Ollama oder ein Gemini API Key nur, wenn du KI-Funktionen testen willst

Dependencies installieren:

```bash
npm install
```

App im Entwicklungsmodus starten:

```bash
npm run dev
```

Nuetzliche Scripts:

| Script | Zweck |
| --- | --- |
| `npm run build:electron` | Electron Main/Preload-Prozess kompilieren |
| `npm run build` | TypeScript, Vite Build und Electron Build ausfuehren |
| `npm run test` | Unit Tests ausfuehren |
| `npm run test:coverage` | Tests mit Coverage-Gates ausfuehren |
| `npm run test:ci` | CI-aehnlichen Compile-, Coverage- und Build-Flow ausfuehren |
| `npm run dist` | Lokales Paket fuer die aktuelle Plattform bauen |

## Projektstruktur

- `src/` enthaelt React Renderer, UI-Komponenten, Hooks, Utilities und Renderer-Tests.
- `electron/` enthaelt Electron Main Process, Preload Bridge, Git-/GitHub-Services, Sicherheitslogik und Main-Process-Tests.
- `scripts/` enthaelt Release-, README- und Test-Helfer.
- `.github/workflows/` enthaelt CI- und Release-Automation.
- `Docs/` enthaelt Screenshots fuer die READMEs.

## Pull-Request-Ablauf

1. Erstelle einen Branch vom Default Branch.
2. Mache die kleinste sinnvolle Aenderung.
3. Fuege Tests hinzu oder passe sie an, wenn sich Verhalten aendert.
4. Aktualisiere englische und deutsche Dokumentation, wenn sich nutzerseitiges Verhalten oder Setup aendert.
5. Fuehre die passenden Checks lokal aus.
6. Oeffne einen Pull Request und fuelle das Template aus.

Commit Messages sollten zum bestehenden Stil im Repository passen, zum Beispiel:

- `feat(scope): add new behavior`
- `fix(scope): correct broken behavior`
- `docs(scope): update documentation`
- `test(scope): cover behavior`
- `chore(scope): maintain project setup`

## Test-Erwartungen

- Fuer App-Verhaltensaenderungen mindestens `npm run test` und passende fokussierte Tests ausfuehren.
- Fuer Aenderungen an gemeinsam genutzter Electron-, Git-, GitHub-, Security-, Parsing- oder Settings-Logik nach Moeglichkeit `npm run test:coverage` oder `npm run test:ci` ausfuehren.
- Fuer reine Dokumentations- oder GitHub-Template-Aenderungen sind App-Tests nicht noetig, aber Links und YAML-Syntax sollten geprueft werden.
- Falls ein relevanter Check nicht ausgefuehrt werden konnte, erklaere das im Pull Request.

## UI- und Dokumentationsaenderungen

- Halte dich an den bestehenden UI-Stil und die vorhandenen Interaktionsmuster.
- Fuege Screenshots oder kurze Screen Recordings fuer sichtbare UI-Aenderungen hinzu.
- Halte englische und deutsche Dokumentation fuer nutzerseitige Aenderungen synchron.
- Bearbeite generierte Release-Download-Links nicht von Hand, ausser du aktualisierst bewusst Release-Dokumentation. Der Release-Workflow aktualisiert sie automatisch.

## Sicherheit

Oeffne keine oeffentlichen Issues fuer Sicherheitsluecken, geleakte Secrets oder Umgehungen sicherheitsrelevanter Ablaeufe. Nutze GitHub private vulnerability reporting wie in [SECURITY.de.md](SECURITY.de.md) beschrieben.

## Lizenz

Mit deinem Beitrag stimmst du zu, dass er unter derselben Lizenz wie das Projekt steht: GNU General Public License v3.0.
