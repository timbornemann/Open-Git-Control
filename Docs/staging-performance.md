# Staging: Messung und Prüfungen

Gemessen am 03.11.2026 unter Windows. Vorher-Basis ist der Build von
`47e8314f`, nachher die Status-first-Implementierung. Das Messskript verwendet
isolierte temporäre Repositories mit 10.000 versionierten kleinen Textdateien.
Jeweils 400 oder 10.000 Dateien werden geändert beziehungsweise zusätzlich
angelegt. Pro Fall gibt es einen Aufwärmlauf und sieben Messläufe.

Die folgenden Mediane erfassen Mutation einschließlich Pfadprüfung und die
anschließende bestätigte Dateiliste. Der vollständige Snapshot wird separat
gemessen. Renderer-Zeiten und LFS-Vorschauen sind nicht in dieser Tabelle
enthalten. Persönliche Repositories und globale Git-Einstellungen werden nicht
verändert.

| Anzahl | Dateien  | Aktion                |  Vorher | Nachher | Zeitersparnis |
| -----: | -------- | --------------------- | ------: | ------: | ------------: |
|    400 | geändert | Einzeldatei           |  0,49 s |  0,19 s |          61 % |
|    400 | geändert | Auswahl bis 400       |  0,85 s |  0,52 s |          39 % |
|    400 | geändert | vollständiger Bereich |  0,84 s |  0,50 s |          41 % |
|    400 | geändert | gesamtes Repository   |  1,50 s |  0,70 s |          53 % |
|    400 | neu      | Einzeldatei           |  0,43 s |  0,19 s |          55 % |
|    400 | neu      | Auswahl bis 400       |  0,77 s |  0,48 s |          37 % |
|    400 | neu      | vollständiger Bereich |  0,81 s |  0,49 s |          39 % |
|    400 | neu      | gesamtes Repository   |  1,81 s |  0,73 s |          60 % |
| 10.000 | geändert | Einzeldatei           |  5,35 s |  0,21 s |          96 % |
| 10.000 | geändert | Auswahl bis 400       |  5,73 s |  0,52 s |          91 % |
| 10.000 | geändert | vollständiger Bereich | 13,25 s |  6,57 s |          50 % |
| 10.000 | geändert | gesamtes Repository   | 10,95 s |  5,16 s |          53 % |
| 10.000 | neu      | Einzeldatei           |  4,73 s |  0,26 s |          95 % |
| 10.000 | neu      | Auswahl bis 400       |  5,00 s |  0,55 s |          89 % |
| 10.000 | neu      | vollständiger Bereich | 15,00 s |  8,26 s |          45 % |
| 10.000 | neu      | gesamtes Repository   | 12,65 s |  5,19 s |          59 % |

Bei 10.000 Änderungen sinkt die vollständige Snapshot-Prüfung von etwa
5,2–5,4 s auf 2,2–2,3 s. Beide Status- und Metadatenvergleiche bleiben erhalten.
Die gebündelte Indexlesung ersetzt viele Git-Prozessstarts; die schnelle
Dateiliste wartet nicht auf diese Prüfung.

Das 70-Prozent-Ziel wird bei Einzeldateien und der 400-Dateien-Auswahl im großen
Arbeitsbaum überschritten. Für das gesamte Repository wird das 30-Prozent-Ziel
überschritten. Ein kompletter Bereich mit 10.000 Dateien erreicht 45–50 Prozent:
Hier benötigt Git selbst nachher noch rund 5,8 s für geänderte beziehungsweise
7,6 s für neue Dateien. Dieser Fall erreicht keine 70 Prozent. Der entsprechende
App-Aufwand oberhalb der direkten Git-Ausführung liegt nachher bei etwa
0,6–0,8 s. Die restliche Git-Arbeit wird nicht durch schwächere Prüfungen oder
eine andere Auswahlsemantik ersetzt.

## Native Oberfläche und Zuverlässigkeit

`test:staging:electron` verwendet ein eigenes Electron-Profil und ein echtes
400-Dateien-Repository. Der vollständige Snapshot wird absichtlich angehalten.
Einzeldatei, gefilterte Abschnittsaktion und gesamtes Repository müssen trotzdem
den frischen Status anzeigen und wieder bedienbar werden. Der Test misst Klick
bis zum aktualisierten Frame und vergleicht den tatsächlichen Index mit der
erwarteten Auswahl. Ausgeblendete Dateien dürfen beim gefilterten Staging nicht
hinzukommen.

Weitere Regressionstests decken serialisierte Schreibaktionen, Abbruch während
des Vorladens, mehrere Snapshot-Verbraucher, Statusfehler nach erfolgreichem Git,
veraltete Antworten, Repository-Wechsel und Pfadschutz ab. Vorschauen werden
abbrechbar nachgeladen und können Schreibaktionen weichen; LFS-Schreibprüfungen
verwenden weiterhin frische Versionsprüfungen.

## Wiederholen

```sh
npm run build
npm run measure:staging -- --label=after
npm run test:staging:electron
```

`build/staging-before.json` und `build/staging-after.json` enthalten alle Rohwerte,
Mediane, Maxima, direkte Git-Zeiten und vollständige Snapshot-Dauern.
`build/staging-ui.json` enthält die nativen Frame-Messungen. Messzeiten hängen von
Dateisystem, Rechner und Dateiinhalten ab; CI prüft die Abläufe deterministisch
und erzwingt keine instabilen Zeitgrenzen.
