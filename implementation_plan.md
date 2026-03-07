# Implementation Plan: Git-Organizer

Das Ziel ist die Entwicklung eines modernen, schnellen und visuellen Git-Clients (ähnlich GitKraken/Sourcetree), der auf Windows, macOS und Linux lauffähig ist und eine direkte GitHub-Kopplung bietet.

## User Review Required
> [!IMPORTANT]
> **Technologie-Entscheidung:** Um eine moderne UI mit plattformübergreifender Desktop-Kompatibilität zu erreichen, schlage ich folgenden Stack vor:
> 
> *   **Desktop-Umgebung:** **Electron**. Bietet uneingeschränkten Zugriff auf das lokale Dateisystem und OS-Prozesse (um die lokale Git-CLI direkt zu steuern) und ist der Industrie-Standard für solche Anwendungen (VSCode, GitKraken, GitHub Desktop nutzen alle Electron).
> *   **Frontend:** **React + Vite + TypeScript**. Sehr schnell, komponenten-basiert und ideal für komplexe interaktive UIs (wie Git-Graphen und Diff-Viewer).
> *   **Styling:** **Vanilla CSS** (Custom Properties, CSS Grid/Flexbox). Fokus auf ein extrem hochwertiges, flüssiges "Dark Mode"-Design mit modernen Effekten (Glassmorphismus, softe Farbverläufe) und butterweichen Mikro-Animationen für ein Premium-Gefühl. 
> *   **Git-Anbindung:** Direkte Steuerung der lokalen `git` CLI über Node.js `child_process`. Das garantiert zuverlässig 100%ige Kompatibilität mit allen bestehenden Git-Features.
> *   **GitHub-Anbindung:** `octokit`-Bibliothek für die GitHub API (OAuth Flow, Repositories auflisten und als Klon-Quelle anbieten).
> 
> *Alternativ:* Möchten Sie für eine geringere Dateigröße und theoretisch bessere Backend-Performance auf **Tauri** (Rust) setzen? Electron ermöglicht eine rein JavaScript/TypeScript-basierte Entwicklung, was in der Regel einen schnelleren Projektfortschritt beim Erstellen von reinen Visualisierungstools gewährleistet.

## Proposed Changes

### 1. Projekt-Setup (Electron + Vite)
- Erstellen eines lokalen Projekts (`Git-Organizer`) mit Vite (React) und Electron-Integration in `d:\Projects\Software\Git-Organizer`.
- IPC Setup: Eine sichere Brücke (Preload-Skript) etablieren, damit React auf OS-Features (z. B. Ordner auswählen, Git ausführen) zugreifen kann.

### 2. Design System & Basis-UI
- Erstellung moderner, dunkler Farbpaletten und UI-Komponenten.
- Modulares Layout-System: Links eine Sidebar (Favorisierte Repositories), Mittig der dynamische Content (Commit-Liste/Graph) und rechts/unten Detailpanels (Commit-Ansicht, Staging/Changes).

### 3. Git Core Service
- Node.js Layer zum asynchronen Ausführen von Befehlen wie `git status`, `git branch -a`, und `git log --pretty=format...`.
- Parsen der Resultate in saubere JSON-Strukturen für das React-Frontend.

### 4. Visueller Commit-Graph
- Implementierung einer leistungsstarken Canvas-basierten Render-Logic, die das Git-Baum-Muster (Branches und Merges) als interaktive farbige Linien darstellt.

### 5. GitHub Integration Backend
- Starten eines kleinen lokalen Servers während des Login-Vorgangs, um den GitHub OAuth Callback abzufangen.
- Authentifizierter Abruf der Benutzer-Repositories zum einfachen Klonen.

## Verification Plan
### Automated Tests
- Skripte für Backend-Kommunikation validieren (Parsen von Git Log Ausgaben in verschiedenen Szenarien testen).
### Manual Verification
- Applikation über `npm run dev` in Electron starten.
- Über die Nutzeroberfläche ein Test-Repository anlegen lassen.
- Dateien verändern und visualisieren, ob Changes korrekt gruppiert und in der Staging Area angezeigt werden.
- Commit absetzen und das resultierende Update im Commit-Graphen prüfen.
