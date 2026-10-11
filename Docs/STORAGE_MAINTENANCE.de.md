# Speicher & automatische Datenpflege

Unter **Einstellungen → App & Diagnose → Speicher & Bereinigung** zeigt Open Git Control die bekannten Speicherbereiche, ihre tatsächlichen Dateigrößen, Budgets und die Gründe für eine Bereinigung oder Zurückstellung. Automatische Datenpflege ist standardmäßig aktiviert. Der erste Lauf beginnt 30 Sekunden nach dem Start; weitere Läufe folgen alle sechs Stunden sowie nach Änderungen an Repository-Standorten oder an der Liste. Aktive Cache-Schreibvorgänge werden geschützt und Hintergrundaufträge zusammengeführt.

**Jetzt prüfen** erstellt eine Bestandsaufnahme und prüft Repositories. **Fällige Bereinigung ausführen** wendet die Fristen und Budgets an. **Wiederherstellbare Caches leeren** entfernt nur unterstützte, wiederherstellbare Cache-Inhalte. Die separate Auswahl abgeschlossener Wiederherstellungsvorgänge benötigt eine eigene Bestätigung.

## Speicherbereiche und Fristen

Die App verwendet weiterhin das gemeinsame Electron-`userData`-Verzeichnis. Unter Windows liegt es normalerweise in `%APPDATA%\Open-Git-Control`. Entwicklung und installierte App teilen Repository-Liste, Einstellungen und Anmeldungen.

Bekannte Oberflächeneinstellungen je Repository liegen in `repository-ui-state.json`. Unterstützte frühere Sidebar-Einstellungen aus `localStorage` werden einmalig übernommen; die alte Kopie wird erst nach erfolgreicher Speicherung entfernt. Diese Zuordnungen haben dieselbe 30-Tage-Rückkehrfrist wie Remote-Einstellungen.

| Bereich                                                                | Verwendung und Aufbewahrung                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos.json`                                                           | Versionierte Repository-Liste, Aktivierung, Favoriten und Sortierung. Fehlende Einträge werden frühestens nach 90 Tagen entfernt, nach bestätigten Prüfungen an mindestens drei verschiedenen Tagen und einer erneuten Prüfung unmittelbar vor der Entfernung. |
| `repository-remotes.json`, `run-approvals.json`, manuelle Logo-Auswahl | Entbehrliche Zuordnungen bleiben nach dem Entfernen eines Repositories weitere 30 Tage erhalten. Wiederaufnahme innerhalb der Rückkehrfrist hebt die Bereinigung auf. Benötigte Verweise und offene Vorgänge verhindern sie.                                   |
| `preview-cache-v1`                                                     | Vorläufige Vorschauen; 128 MiB. Beim Verwenden wird aus der aktuellen Quelle nachgeladen.                                                                                                                                                                      |
| `repository-analytics/v1`                                              | Erneut berechenbare Analysen; 512 MiB insgesamt, höchstens 256 MiB je Repository. Git- und Analyse-Fingerprints bestimmen den Cache-Kontext.                                                                                                                   |
| `commit-stats-v1.jsonl`                                                | Erneut berechenbare Commit-Statistiken; 25 MiB. Unterstützte ungültige und doppelte Einträge werden bei der Kompaktierung entfernt.                                                                                                                            |
| `Cache\Cache_Data`                                                     | Chromium-HTTP-Cache; 128 MiB. Er enthält Antworten und Chromium-Verwaltungsdateien. Ein altes Dateidatum beweist nicht, dass der Inhalt unbenutzt ist.                                                                                                         |
| `Code Cache`, `development-code-cache`                                 | Getrennte Code-Caches für installierte App und Entwicklung; zusammen 128 MiB.                                                                                                                                                                                  |
| Hosting-Kataloge, erzeugte Logo-Daten, Grafik-Caches                   | 64 MiB. Manuelle Logo-Einstellungen bleiben bei der Entfernung erzeugter Bilddaten erhalten. Grafik-Caches werden ausschließlich über Electron behandelt.                                                                                                      |
| `repository-publications.json`, `secret-scan-allowlist-migration.json` | Offene oder unklare Vorgänge bleiben erhalten. Abgeschlossene Einträge werden nur bei entbehrlicher Repository-Zuordnung nach der Rückkehrfrist bereinigt.                                                                                                     |
| `storage-maintenance-v1.json`                                          | Beobachtungsfristen, Nutzungszeitpunkte, Zuordnungen für Wiederherstellungsdaten, Rückkehrangebote und Berichte. Höchstens 30 Berichte mit zusammen 1 MiB.                                                                                                     |
| Einstellungen, verschlüsselte Zugangsdaten und Chromium-Anmeldedaten   | Geschützt. Cache-Bereinigung löscht weder Anmeldungen noch Oberflächeneinstellungen.                                                                                                                                                                           |
| Update-Installationsdateien                                            | Separat ausgewiesen; keine automatische Löschung durch diesen Dienst.                                                                                                                                                                                          |

Vorschauen, Analysen und Kataloge laufen nach **30 Tagen ohne tatsächliche Nutzung** ab. Bei Platzbedarf werden zuerst die am längsten ungenutzten unterstützten Inhalte entfernt. Inventurlesen verlängert die Nutzung nicht. Bestandsdaten bekommen beim ersten Prüfzyklus neue Beobachtungsfristen; ihr bisheriges Dateialter wird nicht als Löschgrund verwendet.

Das gesamte Cache-Budget beträgt ungefähr 1 GiB und ist **keine Obergrenze für den AppData-Ordner**. Benötigte Einstellungen, Anmeldungen, aktive Arbeitsdateien, Wiederherstellungsdaten und unbekannte Inhalte werden separat ausgewiesen. Bei erschöpftem Analyse-Cache läuft die Berechnung weiter und zusätzliche Ergebnisse bleiben zunächst im Arbeitsspeicher.

## Fehlende, verschobene und nicht erreichbare Repositories

Nicht erreichbare Laufwerke, Zugriffsfehler, Zeitüberschreitungen, fehlendes Git und beschädigte Git-Strukturen gelten nicht als bestätigtes Fehlen und setzen die Fehlensfrist zurück. Die begrenzten Prüfungen laufen außerhalb des Electron-Hauptprozesses. Aktive Repositories und laufende Vorgänge werden nicht automatisch aus der Liste entfernt.

Die Oberfläche sendet gezielte Änderungen statt vollständiger alter Listen. Der Hauptprozess veröffentlicht Änderungen mit einer Revision. Ein veralteter Oberflächenstand kann dadurch entfernte Repositories nicht wiederherstellen. Beschädigte oder unbekannte Listenformate werden niemals als leere Liste zurückgeschrieben. Bei unlesbaren Verwaltungsdateien bleibt die Speicherübersicht verfügbar und die Bereinigung wird gesperrt.

**Neuen Standort auswählen** übernimmt die vorhandenen Besitzerzuordnungen und Einstellungen über den bestehenden Standortwechsel. Pfadabhängige Vorschauen und Analysen werden ungültig. Kommando-Freigaben bleiben am alten Pfad und werden nicht auf einen neuen Standort übertragen. Repository-Dateien und lokale Planung werden vom Wartungsdienst nicht verändert.

## Browser-Caches und temporäre Dateien

Entwicklung deaktiviert den HTTP-Disk-Cache vor Electron-Start und verwendet einen eigenen Code-Cache. Browser-Caches werden spätestens nach 30 Tagen oder bei erkanntem Budgetüberlauf über `clearCache`, `clearCodeCaches` und die unterstützte Shader-Cache-Operation zurückgesetzt. Einzelne Chromium-Indexdateien werden nicht anhand ihres Datums gelöscht. Eine eigene Wartungs-Session öffnet den inaktiven Code-Cache, ohne die Anmeldungen der normalen Session zu verwenden.

Der vorhandene HTTP-Cache einer installierten App wird während der Entwicklung als vollständiges Cache-Verzeichnis vorübergehend an ein eigenes Wartungsprofil übergeben. Ein kurzlebiger Electron-Prozess leert ihn über die Session-API; danach wird das Verzeichnis zurückgegeben. Eigentümermarkierung und atomarer Verzeichniswechsel sichern eine Wiederholung nach einem Prozessabbruch ab. Widersprüchliche oder unbekannte Bestände bleiben erhalten. Das gemeinsame Anmeldeprofil wird dabei nicht zusätzlich geöffnet. Nach Browser-Cache-Schreibvorgängen prüft eine zusammengeführte Größenprüfung die Budgets; während des Ladens werden Cache-Operationen verschoben.

Neue private Arbeitsverzeichnisse liegen unter `%TEMP%\open-git-control-workspaces` und besitzen eine Eigentümermarkierung. Normal werden sie nach Abschluss entfernt. Nach einem Absturz werden ausschließlich überprüfte eigene Verzeichnisse nach mindestens sieben Tagen und bei nachweislich inaktivem Besitzerprozess bereinigt. Verzeichnisse ohne passende Markierung sowie Symlinks und Junctions bleiben erhalten. Alte beliebige `ogc-*`-Verzeichnisse im Temp-Ordner werden nicht pauschal gelöscht.

Auch bereits vorhandene eigene Absturzreste erhalten bei der ersten Bestandsaufnahme eine neue Beobachtungsfrist von sieben Tagen. Große JSONL-Dateien werden mit begrenzten Lesepuffern verarbeitet. Unbekannte oder übergroße einzelne Datensätze bleiben erhalten und verhindern ein Überschreiben des betreffenden Caches.

## Wiederherstellung und geschützte Daten

Repository-Dateien, `.git`, `.Open-Git-Control`, Planungsinhalte, Zugangsdaten, Wiederherstellungsjournale und Git-Sicherungsreferenzen sind von automatischer Löschung ausgeschlossen. Bekannte gemeinsame Git-Verzeichnisse bleiben für die Prüfung offener Vorgänge auch nach dem Verschwinden eines Worktrees gespeichert.

Auch nach Ablauf der Rückkehrfrist bleiben vorhandene abgeschlossene Sicherungen zugeordnet und sichtbar. Sie können über das zuvor geprüfte gemeinsame Git-Verzeichnis manuell bereinigt werden, wenn dieses verfügbar ist. Nach ausdrücklicher Entfernung der letzten Sicherung wird eine nicht mehr benötigte App-Zuordnung aufgegeben. Ein bestätigt gelöschtes Git-Verzeichnis wird von einem nicht erreichbaren Laufwerk unterschieden.

Abgeschlossene Commit-Nachrichten-Vorgänge lassen sich separat auswählen. Vor der bestätigten Entfernung werden Journalformat, Zuordnung, Zustand und erwartete Objekt-ID der Sicherungsreferenz erneut geprüft. Git entfernt die Referenz mit einer bedingten Transaktion. Eine Änderung oder ein Git-Fehler erhält das Journal. Wiederholte Aufträge sind unschädlich. Der Wartungsdienst führt **kein `git gc`** aus. Die Übersicht zählt Journale und lose Sicherungsreferenzen; gemeinsam verwendete Git-Objekte werden nicht künstlich einzelnen Sicherungen zugerechnet.

Unbekannte Dateien, unbekannte Versionen, beschädigte Verwaltungsdateien und umgeleitete Pfade bleiben erhalten und werden als unklar angezeigt. Dateien werden vor der Entfernung erneut geprüft. Cache-Schreibvorgänge und Wartung teilen Nutzungs- und Schreibschutz; Speicheroperationen verwenden atomare Ersetzungen.

## Entwicklung und Prüfung

Neue Persistenz muss in `electron/main-process/storageCatalogue.ts` registriert werden: Kategorie, Eigentümer, unterstütztes Format, tatsächliche Nutzung, Budget, Frist und sichere Bereinigung. Der Katalog allein erlaubt keine beliebigen Löschungen. Passende Format- und Eigentümerprüfungen gehören in den jeweiligen Adapter und seine Tests. Nicht registrierte Inhalte bleiben geschützt.

Gezielte Tests prüfen kontrollierte Fristen, Neustarts, Rückkehr, Umzüge, Offline-Zustände, konkurrierende Nutzung, beschädigte Dateien, zukünftige Versionen, Junctions, Wiederherstellung und Wachstum. `npm run test:storage:electron` verwendet ausschließlich isolierte temporäre Profile für tatsächliche Electron-Cache-Operationen und prüft den Erhalt von Anmeldungen und Einstellungen. `npm run test:ci` führt die vollständigen Projektprüfungen aus.

Electron-Referenzen: [Command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches), [Session API](https://www.electronjs.org/docs/latest/api/session).
