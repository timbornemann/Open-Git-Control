# Daten vorladen und ohne Ladewechsel anzeigen

## Datenfluss

Pro Fenster verwaltet `src/data/queryClient.ts` einen TanStack Query v5 Client.
Die Renderer-Clients laufen durch `cachedClient`: gleiche Ressourcenschlüssel
teilen Daten und laufende Anfragen. Zustand und Komponenten behalten die
Bedienzustände und Entwürfe. Es wird keine zusätzliche Speicherung von Auswahl,
Filtern oder Scrollpositionen eingeführt.

`startDataRuntime()` startet vor React die asynchrone Wiederherstellung und das
Laden der Ansichtsmodule. Der Bootstrap liefert Einstellungen, Repository-Liste,
autorisierte GitHub-Daten und Vorschauen für das aktive sowie zwei zuletzt
verwendete andere Repositories. Er aktiviert kein Repository. Eine späte
Vorschau kann einen laufenden ersten Abruf überbrücken, aber keine neueren Daten
oder bestätigten Änderungen überschreiben.

Die Schlüssel enthalten Domain, kanonischen Repository-Pfad oder GitHub-Host und
Konto, Operation und Parameter. Commit-Inhalte enthalten ihre SHA. Erfolgreiche
leere Ergebnisse sind Daten. `useCachedResult` und `useResourceState` beobachten
den gemeinsamen Speicher, ohne weitere Abrufschleifen anzulegen. Vorhandene
Daten bleiben bei einer Aktualisierung und bei Fehlern erhalten.

Die Vorlade-Registry hält aufgelöste React-Komponenten. Bereits vorbereitete
Module werden direkt gerendert. Noch nicht vorbereitete Ansichten zeigen ruhige
Platzhalter im Seitenaufbau.

## Bereiche

| Bereich             | Vorbereitung und Nutzung                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub              | Ein gemeinsamer Katalog für Seite und Sidebar; Wiederherstellung unabhängig von der Anmeldung; lokale Origin-Zuordnungen gemeinsam lesen.                                                                              |
| To-dos              | Gemeinsame Planner-Daten, unmittelbar abgeleitete Projektauswahl, bestätigte Änderungen direkt übernehmen; Dateiänderungen invalidieren die Daten. Nach der Initialisierung asynchron lesen, ohne erneute Migrationen. |
| Repository          | Arbeitsbaum, Branches, Tags, Remotes, Submodule, Dateibaumwurzel, Run-Konfiguration und erste 100 Commits des regulär aktivierten Repositories.                                                                        |
| Graph               | Ein Worker pro Fenster; Ergebnisse nach Repository und Commit-/Ref-Inhalt wiederverwenden. Auch wiederhergestellte Commit-Vorschauen können ein Layout vorbereiten.                                                    |
| GitHub-Details      | Repository-Metadaten, erste PR- und Actions-Seite, gemeinsame Branch-/CI-Abfragen. Katalog und Branch-Listen geben nach jeder Seite ihren Warteschlangenplatz frei.                                                    |
| Dateien und Details | Commit-Übersicht, Diffs, Vorschauen, Historie, Blame-Seiten, Timeline und Reflog gemeinsam zwischenspeichern. Fokus lädt sofort vor, Zeigerkontakt nach 150 ms.                                                        |
| Einstellungen       | Einstellungen, App-Version, Update-Status, Release-Kontext und Run-Konfigurationen wiederverwenden. Umfangreiche Diagnosen und Logs bleiben bedarfsgesteuert.                                                          |

## Aktualisierung und Grenzen

- Reihenfolge: angeforderte Ansicht, aktive Repository-Übersichten, Startdaten,
  weitere Vorladearbeit. Höchstens zwei Hintergrundabrufe, davon einer zu GitHub.
  Angeforderte Ansichten können wartende Abrufe hochstufen.
- Verborgene Fenster starten keine neue spekulative Arbeit. Bereits laufende
  Abrufe behalten ihren Platz bis zum tatsächlichen Abschluss. Wiederaufnahme
  aktualisiert beobachtete Daten und setzt das Laden der Module fort. Nach einem
  Offline-Start werden fehlgeschlagene sichtbare Abrufe und die gespeicherte
  GitHub-Anmeldung bei wiederhergestellter Verbindung erneut versucht. Eine
  ausdrückliche Abmeldung bleibt wirksam.
- GitHub-Katalog und Repository-Metadaten: fünf Minuten; PR-Listen: eine Minute.
  Sichtbare Actions behalten ihren 45-Sekunden-Takt, der Arbeitsbaum fünf bzw.
  15 Sekunden. GitHub-Fehler werden begrenzt mit wachsendem Abstand wiederholt;
  Authentifizierungsfehler und Rate-Limits lösen keine sofortigen Wiederholungen aus.
- Bestätigte Änderungen invalidieren nur betroffene Ressourcen im jeweiligen
  Repository/Konto. Immutable Commit-Inhalte bleiben erhalten. `freshRead`
  erzwingt aktuelle Git-Daten für Prüfungen vor Schreibaktionen.
- RAM-Budget: 64 MiB, einschließlich Schlüssel und konservativer UTF-16-Größe.
  Unbenutzte Einträge werden zuerst entfernt. Beobachtete und laufende Ressourcen
  bleiben verfügbar und können das Budget vorübergehend überschreiten.
- Festplattenbudget: 128 MiB, höchstens 4 MiB je Vorschau. Gespeichert werden nur
  freigegebene Übersichten und Metadaten, keine Dateiinhalte, Editor-Entwürfe oder
  vollständigen Logs. Formatversion, Zeit, Quellrevision, Vollständigkeit und DTOs
  werden im Hauptprozess geprüft. Defekte oder inkompatible Dateien werden entfernt.
- GitHub-Vorschauen werden mit der vorhandenen Betriebssystemverschlüsselung
  gespeichert. Ohne diese Verschlüsselung entstehen keine neuen dauerhaften
  privaten Vorschauen. Der bestehende GitHub-Katalog bleibt lesbar; unvollständige
  Kataloge werden im Hintergrund erneuert.

## Einen weiteren Datenadapter ergänzen

1. Leseoperation und Aktualität in `clientPolicies.ts` eintragen; bei Bedarf den
   Repository-Parameter für `resourceKey` angeben.
2. Die vorhandene Ansicht über `useCachedResult` oder `useResourceState` anbinden.
   Vorhandene Daten beim Mounten nicht löschen. Die bestehende Aktualisierung
   durch den gemeinsamen Adapter führen, statt eine zweite Schleife anzulegen.
3. Vorladen in `preloading.ts` oder über `usePreloadIntent` registrieren.
4. Schreibauswirkungen in `mutationEffects.ts` abbilden. Bekannte bestätigte
   Ergebnisse mit `updateResource` übernehmen, damit alte Antworten sie nicht
   zurücknehmen können.
5. Für dauerhafte Vorschauen sowohl die gemeinsame Allowlist als auch den
   DTO-Prüfer im Hauptprozess ergänzen. Große Inhalte bleiben im Sitzungsspeicher.

## Prüfung und Messung

Automatisierte Tests decken gemeinsame Anfragen, erfolgreiche leere Listen,
Wiederherstellung während langsamer Abrufe, Mutation-/Repository-/Konto-Rennen,
beschädigte und unvollständige Vorschauen, Verschlüsselung, LRU-Grenzen,
Priorisierung, seitenweises Laden, Rate-Limits, verspätete Graphlayouts und
IPC-Abbruch nach Fenster ab.
Die vorhandenen Workflow- und Integrationstests prüfen weiterhin Git-Aktionen,
Planner-Änderungen, Dateiüberwachung und Repository-Bindung.

Die Produktionstests lassen sich reproduzieren:

```sh
npm run build
node scripts/measure-prepared-navigation.cjs
```

Das Skript startet die gebaute Electron-Oberfläche unsichtbar mit einem isolierten
Testprofil und synthetischen IPC-Antworten: 100 Repositories, 80 To-dos und drei
Sekunden Verzögerung je Daten-/Anmeldeabruf. Es misst Klick bis zum nächsten Frame
mit Inhalt, prüft 25 vorbereitete Wechsel je Szenario und schlägt bei mindestens
100 ms, Platzhalterframes oder einem unerwarteten Loginformular fehl. Es berührt
keine echten Konten oder Repositories.

Messung unter Windows am 28.09.2026, Produktionsbuild:

| Szenario                     |  Median |     P95 | Maximum | Platzhalter bei vorbereiteten Wechseln |
| ---------------------------- | ------: | ------: | ------: | -------------------------------------: |
| Start mit Cache              | 14,4 ms | 19,9 ms | 22,8 ms |                                      0 |
| Offline-Start mit Cache      | 15,4 ms | 20,1 ms | 25,6 ms |                                      0 |
| Erststart, nach Vorbereitung | 15,1 ms | 23,6 ms | 26,1 ms |                                      0 |

Der allererste Abruf ohne Cache benötigt weiterhin die künstliche Netzwerklatenz;
währenddessen ist der Seitenaufbau sichtbar. Diese Messung prüft den Renderer mit
Fixtures, nicht die Geschwindigkeit realer GitHub-Server oder beliebig großer
Repositories. Die lokalen Diagnosen enthalten zusätzlich Cache-Treffer,
Anfragedauer, Warteschlangenlänge und die letzten Navigationszeiten.

Abschlussprüfung: `npm run test:ci` führt die vollständige Testsuite mit den
bestehenden Mindestwerten für Testabdeckung, Linting und Architekturprüfung,
Formatprüfung, Lizenzprüfung, TypeScript-Prüfung und Produktionsbuild aus.

Ergebnis des Abschlusslaufs: 1.108 Tests in 215 Testdateien bestanden; sämtliche
CI-Prüfungen einschließlich der unveränderten Abdeckungsgrenzen erfolgreich.
