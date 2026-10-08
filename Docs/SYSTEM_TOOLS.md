# Git and optional system tools

Open-Git-Control checks **Git**, **Git LFS** and **GitHub CLI** at startup. Git is required for local Git operations; LFS and the CLI are optional. All three can be managed under **Settings → App & diagnostics → System tools**. Search for `Git`, `LFS`, `CLI` or `installation` to find this section.

If Git cannot run, the app explains the requirement once per session and keeps a warning triangle beside the update indicator. Saved repositories and their selected repository are preserved. Checks run again on focus, manually, after an installation, and every 30 seconds while Git is unavailable and the app is visible. Repository restoration resumes after a successful check. Checking versions does not change Git configuration, LFS filters or hooks.

## Commit identity

Git installation and hosting sign-in do not configure the name and email recorded in commits. Before a manual commit, AI auto-commit or initial-commit recovery, Open-Git-Control checks Git's effective author and committer identity. Missing or invalid details open a dedicated dialog; cancelling preserves the commit draft and index. Valid existing configuration is retained, and an operating-system fallback is not treated as an explicitly configured identity.

Use **Settings → General → Git commit identity** to edit the values later. Choose **This repository** to save `user.name` and `user.email` in its local Git configuration, or **Globally on this computer** for the user's global Git configuration. Local settings and explicit author/committer overrides take precedence. Global values remain editable when no repository is selected. Saving never rewrites existing commits or derives an email from the hosting account. Git configuration is rechecked before continuing a pending commit; concurrent changes require reloading rather than overwriting stale values.

## Installation

Installation always requires a click and a review of the tool, package source and command. The app uses an **existing** package manager and existing package sources; it does not install a package manager, add package sources, or install optional tools automatically.

| System           | Manager                                              | Git       | Git LFS         | GitHub CLI   |
| ---------------- | ---------------------------------------------------- | --------- | --------------- | ------------ |
| Windows          | WinGet, exact package from `winget`                  | `Git.Git` | `GitHub.GitLFS` | `GitHub.cli` |
| macOS            | Homebrew, current user                               | `git`     | `git-lfs`       | `gh`         |
| Debian/Ubuntu    | apt-get, existing sources                            | `git`     | `git-lfs`       | `gh`         |
| Fedora/RHEL      | dnf, cached package information and existing sources | `git`     | `git-lfs`       | `gh`         |
| Arch derivatives | pacman, existing sources                             | `git`     | `git-lfs`       | `github-cli` |
| openSUSE/SLES    | zypper, existing sources                             | `git`     | `git-lfs`       | `gh`         |

Windows installers request UAC rights when needed. Linux uses `pkexec` with the graphical Polkit agent; no password is entered in the app and the internal terminal agent is disabled. Without a suitable manager, package candidate or elevation service, use the official instructions and copyable command. Known broken Linux CLI packages (2.45.x/2.46.x) are excluded. WinGet agreement requests are displayed and must be explicitly accepted before retrying. Closing a dialog does not terminate an installation. Notifications show phases without estimated percentages; success requires a fresh version check.

Git for Windows normally includes LFS, but its installer allows deselecting it. After installing Git, the app checks LFS again before offering a separate installation. macOS/Linux commonly install LFS separately.

The resolver searches absolute PATH entries, standard installation directories, Homebrew locations and Windows installation/PATH registry values. It does not search the selected repository. macOS checks developer-tool availability before executing Apple's `/usr/bin/git` placeholder, avoiding an unexpected developer-tool installation prompt. Tools installed after launch can therefore become usable without restarting the app. A restart is suggested only when the installer finishes but verification still fails.

## Official downloads and references

- [Git installation](https://git-scm.com/install/)
- [Git LFS](https://git-lfs.com/)
- [GitHub CLI](https://cli.github.com/)
- [Git for Windows installer components](https://github.com/git-for-windows/build-extra/blob/main/installer/install.iss)
- [GitHub CLI installation by platform](https://github.com/cli/cli/tree/trunk/docs)
- [Polkit authentication and pkexec](https://polkit.pages.freedesktop.org/polkit/pkexec.1.html)

The tool status is included in diagnostics. Installation IPC accepts only predefined tool IDs from the trusted app main frame. The local Planning API has no installation privileges. Automated tests inject process runners; developer machines and CI never install system software as part of testing.

## Deutsche Kurzanleitung

Unter **Einstellungen → App & Diagnose → Werkzeuge** stehen Status, Version, offizieller Download und automatische Installation für Git sowie optional Git LFS und GitHub CLI bereit. Fehlt Git, erscheint nach abgeschlossener Prüfung einmal pro Sitzung ein Hinweis. Das Warndreieck bleibt bis zur erfolgreichen Prüfung sichtbar. Repositorys und ihre gespeicherte Auswahl bleiben erhalten; nach einer Installation oder einer erneuten Prüfung werden die Git-Funktionen wieder verfügbar.

Die Installation startet ausschließlich nach deiner Auswahl und zeigt Paketquelle und Befehl. Rechte bestätigt das Betriebssystem. Paketmanager und zusätzliche Paketquellen werden nicht eingerichtet. Falls die automatische Installation nicht möglich ist, nutze den offiziellen Download beziehungsweise die Anleitung und den kopierbaren Befehl. LFS-Filter und Hooks werden weiterhin nur durch den bestehenden repositorylokalen LFS-Ablauf eingerichtet.

Unter **Einstellungen → Allgemein → Git-Commit-Identität** kannst du Git-Name und E-Mail nachträglich für das aktuelle Repository oder global auf diesem Computer ändern. Vor einem Commit werden fehlende Angaben im selben Formular eingerichtet. Die Hosting-Anmeldung ersetzt diese Angaben nicht. Repository-Einstellungen haben Vorrang; bereits erstellte Commits bleiben unverändert.
