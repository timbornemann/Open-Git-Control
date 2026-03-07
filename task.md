# Git-Organizer - Task Tracker

## 1. Projektplanung & Setup (PLANNING)
- [/] Anforderungsanalyse und Tech-Stack Definition
- [ ] Freigabe des Implementation Plans durch den User

## 2. Grundgerüst & Architektur (EXECUTION)
- [ ] Initialisierung des Projekts (Electron + Vite + React + TS)
- [ ] Setup der IPC-Kommunikation (Frontend <-> Node Backend)
- [ ] Basis-Design-System implementieren (CSS Variables, Dark Theme, Layout-Shell)

## 3. Core Git Integration
- [ ] Node.js Service für Git-Kommandozeilen-Befehle (`git status`, `git log`, etc.)
- [ ] Parsen der Git-Outputs in JSON/Objekte für das Frontend
- [ ] Lokale Repositories Scanner (Ordner auswählen und als Repo erkennen)

## 4. Visuelle Oberfläche (UI/UX)
- [ ] Sidebar für Repositories und Branches
- [ ] Hauptansicht: Commit History Graph (Visuelle Node-Verknüpfungen)
- [ ] Staging Area UI (Changes, Diff-Viewer, Stage/Unstage)
- [ ] Action Bar (Commit, Push, Pull, Fetch)

## 5. GitHub Integration
- [ ] OAuth Authentication Flow implementieren
- [ ] API-Anbindung via Octokit (Public/Private Repos anzeigen)
- [ ] Klonen von Remote Repositories über die UI

## 6. Verifikation & Feinschliff (VERIFICATION)
- [ ] App ausführlich lokal testen (Commits, Push/Pull)
- [ ] UI-Polish (Micro-Animations, Glassmorphism, Window Controls)
