# Sicherheitsrichtlinie

Sprache: **Deutsch** | English version: [SECURITY.md](../../../SECURITY.md)

Open-Git-Control arbeitet mit lokalen Repositories, GitHub-Authentifizierung, optionalen KI-Provider-Keys, Release-Publishing-Ablaeufen und lokalen Planning-API-Tokens. Bitte melde Sicherheitsprobleme privat.

## Unterstuetzte Versionen

Security-Fixes zielen auf das neueste stabile Release und den Default Branch. Aeltere Releases erhalten nur dann Fixes, wenn das Problem schwerwiegend ist und der Fix sicher zurueckportiert werden kann.

## Sicherheitsluecke melden

Oeffne kein oeffentliches GitHub-Issue fuer Sicherheitsluecken, geleakte Secrets, Probleme mit Token-Verarbeitung, Umgehungen der lokalen API, unsichere Git-Command-Ausfuehrung oder aehnliche Themen.

Nutze GitHub private vulnerability reporting:

[Sicherheitsluecke privat melden](https://github.com/timbornemann/Open-Git-Control/security/advisories/new)

Falls diese Seite nicht verfuegbar ist, nutze den Security-Tab des Repositories und waehle den privaten Vulnerability-Reporting-Flow.

## Was enthalten sein sollte

Bitte gib an:

- betroffene Open-Git-Control-Version oder betroffener Commit
- Betriebssystem
- klare Reproduktionsschritte
- erwartete und tatsaechliche Auswirkung
- ob Zugangsdaten, lokale Dateien, Repositories oder GitHub-Daten betroffen sein koennten
- relevante Screenshots, Logs oder Proof-of-Concept-Details

Fuege keine echten Tokens, privaten Repository-Inhalte oder Secrets Dritter in den Bericht ein.

## Offenlegung

Maintainer pruefen den Bericht, stellen bei Bedarf Rueckfragen und koordinieren einen Fix vor oeffentlicher Offenlegung. Bitte gib dem Projekt angemessen Zeit fuer Untersuchung und Release eines Fixes, bevor Details oeffentlich geteilt werden.
