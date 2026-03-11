# Open-Git-Control

Modern desktop Git client built with Electron + React for fast local Git workflows, visual history navigation, and integrated GitHub actions.

## Table of Contents

- [Screenshots](#screenshots)
- [What You Can Do](#what-you-can-do)
- [How the App Works](#how-the-app-works)
- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Option 1: Install a Prebuilt Release](#option-1-install-a-prebuilt-release)
  - [Option 2: Run From Source (Development)](#option-2-run-from-source-development)
  - [Option 3: Build Installers Locally](#option-3-build-installers-locally)
- [Connect GitHub](#connect-github)
  - [Method 1: Personal Access Token (PAT)](#method-1-personal-access-token-pat)
  - [Method 2: OAuth Device Flow](#method-2-oauth-device-flow)
  - [Method 3: One-Click Login (GitHub CLI)](#method-3-one-click-login-github-cli)
- [Typical Workflows](#typical-workflows)
- [Settings and Customization](#settings-and-customization)
- [AI Auto-Commit](#ai-auto-commit)
- [Security and Local Data](#security-and-local-data)
- [Available Scripts](#available-scripts)
- [Troubleshooting](#troubleshooting)

## Screenshots

### App overview
![Open-Git-Control App Overview](Docs/App%20Overview.png)

### Diff and commit details view
![Open-Git-Control Diff View](Docs/View%20diff.png)

## What You Can Do

- Open existing local repositories and switch quickly between them.
- Initialize a folder as a new Git repository (`git init`) directly from the UI.
- View commit history in a visual commit graph (including branches and merges).
- Search commit history by hash, author, message, or refs.
- Inspect commit details with:
  - file list
  - per-file history
  - blame
  - full patch/diff view
- Work with diffs in:
  - unified mode
  - side-by-side mode
  - hunk navigation
- Manage working tree changes:
  - stage/unstage files
  - stage all / unstage all
  - discard changes
  - delete untracked files
  - stash / stash pop
  - add `.gitignore` rules from context menu
- Resolve conflicts and continue/abort merge or rebase flows.
- Run core sync actions: Fetch, Pull, Push.
- Manage branches:
  - create
  - checkout
  - rename
  - merge
  - delete
  - checkout remote-only branches
- Manage remotes:
  - add/remove remotes
  - refresh remote state
  - set upstream for current branch
  - monitor ahead/behind/diverged states
- Manage tags:
  - create lightweight or annotated tags
  - delete tags
  - push tags
- Connect to GitHub, then:
  - list repositories
  - clone repositories
  - create a remote repository from your current local repo and connect it
  - list pull requests
  - open/copy/check out PR branches
  - create pull requests
- Enable AI-assisted auto-commit workflows (Ollama or Gemini).
- Check, download, and install app updates in production builds.

## How the App Works

### 1) Sidebar: repository and Git controls
- **Repositories**: open, search, pin, switch, and close local repos.
- **Branches**: local/remote lists, quick creation, context menu actions.
- **Tags**: quick create/push/delete.
- **Remotes**: health/status card, quick fetch, upstream setup, checkout remote-only branches.

### 2) Main center pane
- **Commit Graph** view with branch topology and searchable history.
- Context menu on commits for operations like checkout, branch/tag creation, cherry-pick, revert, and reset modes.

### 3) Right pane
- **Working Directory** when no commit is selected (staging and commit tools).
- **Commit Inspector** when a commit is selected (file-level history/blame/patch workflow).

### 4) Diff viewer
- Opened from staging area or commit inspector.
- Supports unified and side-by-side rendering.
- Handles large diffs safely (truncation for performance) and detects binary files.

### 5) GitHub tab
- Authentication options (PAT, Device Flow, GitHub CLI one-click).
- Repository cloning and pull request workflows in-app.

### 6) Settings tab
- Theme and language.
- Auto-fetch interval.
- Default branch and commit defaults.
- AI provider/model configuration.
- App update controls and job center.

## Installation

### Prerequisites

- [Git](https://git-scm.com/downloads) installed and available in your `PATH`.
- [Node.js](https://nodejs.org/) and npm (for source/dev builds).
- Optional:
  - [GitHub CLI (`gh`)](https://cli.github.com/) for one-click GitHub login.
  - [Ollama](https://ollama.com/) if you want local AI auto-commit with Ollama.

### Option 1: Install a Prebuilt Release

1. Go to [GitHub Releases](https://github.com/timbornemann/Git-Organizer/releases).
2. Download the build for your OS/architecture.
3. Install and launch the app.

### Option 2: Run From Source (Development)

```bash
npm install
npm run dev
```

This starts Vite and Electron together for local development.

### Option 3: Build Installers Locally

Build everything:

```bash
npm run build
```

Create platform packages:

```bash
npm run dist       # default packaging
npm run dist:win   # Windows (NSIS, x64)
npm run dist:linux # Linux (AppImage + deb, x64)
npm run dist:mac   # macOS (dmg + zip, x64)
```

Packaged artifacts are generated in the `release/` directory.

## Connect GitHub

The app supports 3 authentication methods.

### Method 1: Personal Access Token (PAT)

1. Open the **GitHub** tab.
2. Choose **Method 1: PAT**.
3. Create a token (the app links to GitHub's token creation page).
4. Paste token and connect.

Recommended scopes: `repo`, `read:user`.

### Method 2: OAuth Device Flow

1. Set a GitHub OAuth Client ID:
   - in **Settings > GitHub OAuth Client ID**, or
   - with `GITHUB_OAUTH_CLIENT_ID` environment variable.
2. In the **GitHub** tab, start **Device Flow**.
3. Enter the shown one-time code in browser.
4. Wait for automatic completion in the app.

### Method 3: One-Click Login (GitHub CLI)

1. Install [GitHub CLI](https://cli.github.com/).
2. In **GitHub** tab, click **Sign in with GitHub** (one-click method).
3. Browser auth opens via `gh auth login`.
4. On success, the app uses the CLI token automatically.

## Typical Workflows

### Open or initialize a repo
1. Click **Open repository**.
2. Select a folder.
3. If it is not a Git repo, initialize it from the prompt.

### Clone from GitHub
1. Connect GitHub.
2. In the GitHub repo list, click clone.
3. Pick target directory.
4. Follow clone progress in the modal/job center.

### Create and connect a remote GitHub repo from local code
1. Open a local repo without `origin`.
2. Use **Create & connect GitHub repo** in the repositories panel.
3. The app creates the GitHub repo, adds `origin`, and pushes with upstream.

### Stage and commit
1. Review unstaged/untracked files.
2. Stage selected files (or stage all).
3. Enter commit title (and optional description).
4. Optional flags: **Amend** and **Signoff**.
5. Commit with button or `Ctrl+Enter`.

### Pull request workflow
1. Ensure your `origin` points to GitHub and GitHub auth is active.
2. Open **GitHub** tab and review PR list.
3. Create PR by title/body/head/base.
4. Open/copy/check out PR branches directly from the list.

## Settings and Customization

- Theme presets: `Copper Night`, `Midnight Teal`, `Graphite Blue`, `Forest Copper`, `Porcelain Light`
- Language: German or English
- Auto-fetch interval
- Default branch
- Dangerous operation confirmations
- Show/hide secondary history in commit graph
- Default commit signoff
- Commit message template
- GitHub OAuth Client ID configuration
- Updater controls + release notes + job center

## AI Auto-Commit

Supports two providers:
- **Ollama** (local model)
- **Google Gemini**

You can:
- enable/disable AI auto-commit
- select provider and model
- test provider connection
- fetch available models
- store/remove Gemini API key securely from settings

When enabled, AI auto-commit can analyze current changes, stage files, and create logical commit groups automatically.

## Security and Local Data

- Git commands run locally against your selected repository.
- GitHub token and Gemini API key are stored using Electron `safeStorage` (OS-backed encryption), when available.
- Repository list and app settings are stored in app user data.
- If OS secure storage is unavailable, secrets are not persisted.

## Available Scripts

- `npm run dev` - start Vite + Electron in development
- `npm run build` - build frontend + Electron main process
- `npm run dist` - build and package app
- `npm run dist:win` - build Windows installer
- `npm run dist:linux` - build Linux packages
- `npm run dist:mac` - build macOS packages
- `npm run test` - run unit tests
- `npm run test:coverage` - run tests with coverage
- `npm run test:ci` - CI test/build pipeline

## Troubleshooting

- **"git not found"**
  - Install Git and make sure it is available in `PATH`.
- **GitHub one-click login fails**
  - Install GitHub CLI and verify `gh --version` works.
- **Device Flow unavailable**
  - Provide a GitHub OAuth Client ID in settings or `GITHUB_OAUTH_CLIENT_ID`.
- **No pull requests shown**
  - Ensure `origin` points to a GitHub remote and you are authenticated.
- **Auto updates disabled**
  - Update features are only active in installed production builds, not in dev mode.
