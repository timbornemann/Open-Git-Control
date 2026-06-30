# Open-Git-Control

Open-Git-Control is a free, open-source desktop Git client for Windows, macOS, and Linux.

It brings a visual commit graph, staging, diff tools, conflict resolution, GitHub PR and release workflows, secret scanning, recovery tools, and optional AI-assisted commits/release notes into one local-first app - without putting core Git workflows behind a subscription.

Language: **English (main)** | Deutsche Version: [README.de.md](README.de.md)

![Open-Git-Control App Overview](Docs/App%20Overview.png)

## Why Open-Git-Control?

Try it if you want more than a minimal Git GUI, but still want a local-first, open-source alternative to commercial desktop clients.

- Free and open source
- Local-first desktop app for everyday Git work
- Visual commit graph with branch, tag, merge, and recovery actions
- Integrated staging, hunk-based diff viewer, stash tools, and conflict resolver
- GitHub authentication, repositories, pull requests, CI status, workflows, and releases
- Secret scanning before pushes and safety prompts for destructive operations
- Optional AI support through Ollama or Gemini
- Local Planning API and MCP-style tools for agent-assisted project work

## Install

Download the latest release:

[github.com/timbornemann/Open-Git-Control/releases/latest](https://github.com/timbornemann/Open-Git-Control/releases/latest)

Git must be installed and available in your `PATH`. See [Install Git](#install-git-where-and-how) if you need setup instructions.

For development from source:

```bash
npm install
npm run dev
```

## Screenshots

### Diff Viewer
![Open-Git-Control Diff View](Docs/View%20diff.png)

### Conflict Resolver
![Open-Git-Control Conflict Resolver](Docs/Conflict%20Resolver.png)

## Quick Overview

Open-Git-Control helps you:

- open, initialize, and switch local repositories quickly
- manage branches, remotes, tags, and submodules from one sidebar
- understand history through a visual commit graph with searchable refs, authors, hashes, and subjects
- inspect changes with staged/unstaged/commit diffs and hunk actions
- resolve merge and rebase conflicts without leaving the app
- recover from mistakes through reflog-based tools and guarded destructive actions
- clone, fork, connect, and publish GitHub repositories
- create and merge GitHub PRs, inspect CI status, and publish releases
- generate optional AI commit messages and release notes with Ollama or Gemini
- run automatic secret scans before pushing
- expose local planning data to agents through a local API and MCP-style tools

## Table of Contents

- [Why Open-Git-Control?](#why-open-git-control)
- [Install](#install)
- [Screenshots](#screenshots)
- [Quick Overview](#quick-overview)
- [Features in Detail](#features-in-detail)
  - [1) Repository and Workspace Management](#1-repository-and-workspace-management)
  - [2) Branches, Remotes, Tags, Submodules](#2-branches-remotes-tags-submodules)
  - [3) Commit Graph and History](#3-commit-graph-and-history)
  - [4) Forensic Search and Recovery](#4-forensic-search-and-recovery)
  - [5) Staging Area, Stash, Commits](#5-staging-area-stash-commits)
  - [6) Conflict Resolver](#6-conflict-resolver)
  - [7) Diff Viewer](#7-diff-viewer)
  - [8) GitHub Integration](#8-github-integration)
  - [9) Pull Requests, CI, and Workflows](#9-pull-requests-ci-and-workflows)
  - [10) Releases](#10-releases)
  - [11) AI (Ollama / Gemini)](#11-ai-ollama--gemini)
  - [12) Security and Safety](#12-security-and-safety)
  - [13) System, Updates, Job Center](#13-system-updates-job-center)
  - [14) Shortcuts and Productivity](#14-shortcuts-and-productivity)
  - [15) Local Planning API and MCP Tools](#15-local-planning-api-and-mcp-tools)
- [Install Git (where and how)](#install-git-where-and-how)
- [Development and Local Builds](#development-and-local-builds)
- [Typical Workflows](#typical-workflows)
- [Settings (Overview)](#settings-overview)
- [Data Storage and Security](#data-storage-and-security)
- [Available npm Scripts](#available-npm-scripts)
- [Troubleshooting](#troubleshooting)

## Features in Detail

### 1) Repository and Workspace Management

- Open local repositories and set them as the active working session
- If a folder is not yet a repo: run `git init` directly from the app
- Repository list with:
  - search
  - sorting (last opened, name, created time)
  - favorites (pin)
  - close repository
- Persistent workspace:
  - recently active repositories
  - sorting
  - favorites
- Project planning:
  - repository-specific todos, bugs, features, and notes
  - status, priority, description, and free-form tags
  - dedicated tabs/statuses: idea, bug, planned, in-progress, blocked, done
  - future projects that do not have a Git repository yet
  - create a project folder, run `git init`, and keep all planning items assigned automatically
- Resizable layout:
  - sidebar width
  - width between graph and inspector
  - collapse state per repo for branch/tag/remote/submodule panels

### 2) Branches, Remotes, Tags, Submodules

- Branches:
  - local + remote branch list
  - create branch
  - checkout
  - context menu with merge options
  - rename
  - delete (including force-delete fallback)
- Remotes:
  - add, remove, rename remote, change URL
  - set upstream for the current branch
  - detect remote-only branches, checkout or merge directly
  - remote health indicator (ahead/behind/diverged/no-upstream/error)
  - auto-fetch on configurable interval
- Tags:
  - create lightweight or annotated tags
  - delete tags
  - push tags
  - tag search
- Submodules:
  - recursive status view
  - `submodule update --init --recursive`
  - `submodule sync --recursive`
  - open submodule in the file system

### 3) Commit Graph and History

- Visual commit graph with branch/merge topology
- Commit search mode for:
  - all
  - subject
  - author
  - hash
  - refs
- Match navigation (previous/next)
- Working tree row directly above history (staged/unstaged/untracked)
- Commit context menu with advanced actions:
  - checkout as new branch
  - detached checkout
  - create branch
  - create tag
  - cherry-pick
  - revert (for merge commits also `revert -m 1`)
  - reset `--soft`, `--mixed`, `--hard`
  - interactive rebase (editable todo list)
  - copy commit hash
- Merge panel directly in commit context menu:
  - merge commit/ref/branch into current branch

### 4) Forensic Search and Recovery

- Forensic history directly in the graph:
  - string search (`git log -S`)
  - regex search (`git log -G`)
  - line range (`git log -L`)
- Path suggestions from working tree + history
- Results as commit list with direct jump into diff
- Recovery Center (reflog-based):
  - filter and inspect reflog
  - create recovery branch from reflog entry
  - detached checkout
  - hard reset with safety confirmation

### 5) Staging Area, Stash, Commits

- Sections for:
  - conflicts
  - staged
  - unstaged
  - untracked
- File actions:
  - stage/unstage
  - stage all/unstage all
  - discard file/all
  - delete untracked
  - stage all untracked
- Diff statistics for staged/unstaged
- Stash functions:
  - stash with optional message
  - apply / pop / drop
- Commit form:
  - title + description
  - `--amend`
  - `--signoff`
  - `Ctrl+Enter` for commit

### 6) Conflict Resolver

- Dedicated conflict view with file and block navigation
- Block-based conflict resolution:
  - current/incoming side-by-side
  - per block: accept ours/theirs/both
  - for all blocks: accept ours/theirs
- Manual conflict editor with marker/line-gutter feedback
- Save, Save+Resolved, Reload, Discard
- `merge --continue` / `merge --abort`
- `rebase --continue` / `rebase --abort`
- Automatic opening when merge/rebase conflicts are detected

### 7) Diff Viewer

- Sources:
  - staged
  - unstaged
  - commit-specific
- Views:
  - unified
  - side-by-side
- Hunk navigation
- Hunk operations:
  - stage hunk
  - unstage hunk
  - discard hunk
- Protection for large diffs (truncation + full copy)
- Binary file detection

### 8) GitHub Integration

- Auth methods:
  - PAT
  - OAuth Device Flow
  - one-click login via GitHub CLI (`gh`)
- Saved login session with auto-reconnect
- GitHub repo list with search, pagination, and refresh
- Clone workflow with progress modal
- Clone any remote repository via HTTP/HTTPS/SSH URL
- Fork any GitHub repository by URL (and clone the fork locally)
- Detection whether a GitHub repo already exists locally
- Create and connect a new GitHub repository directly from a local repo without `origin`

### 9) Pull Requests, CI, and Workflows

- PR list for active repo (open/closed/all)
- Create PR (title/body/head/base)
- PR actions:
  - open in browser
  - copy URL
  - checkout PR branch locally
  - merge methods: merge, squash, rebase
- CI/check evaluation per PR:
  - badge success/failure/pending/unknown
  - workflow runs + status checks
- Actions workflow panel with filter and direct link

### 10) Releases

- Release Creator with dedicated view
- Release context:
  - existing tags
  - latest release tag
  - commits since latest release
- Suggested next version tag
- Create release with:
  - tag
  - name
  - target commitish
  - body
  - draft/prerelease
- AI-generated release notes (German/English)

### 11) AI (Ollama / Gemini)

- AI Auto-Commit:
  - analyze changes
  - group files logically
  - generate commit messages
  - phase-based progress (snapshot/grouping/committing/retry/fallback)
  - cancel running job
- AI release notes from commit history
- In settings:
  - switch provider
  - load models
  - test connection
  - securely store/delete Gemini API key

### 12) Security and Safety

- Optional confirmations for dangerous Git operations
- Secret scan before push:
  - scans staged + to-push diffs
  - strictness level low/medium/high
  - allowlist by text/path/regex
  - warning/confirmation dialog for findings
- Context menu actions for `.gitignore`:
  - file
  - folder
  - top-level folder
  - file type pattern

### 13) System, Updates, Job Center

- App updater (only in installed production builds):
  - check
  - one-click check+download
  - install downloaded updates
  - release notes view
- Job Center with history for running/completed jobs:
  - clone
  - fetch/pull/push
  - secret scan
  - AI auto-commit

### 14) Shortcuts and Productivity

- `Ctrl+1..4`: switch tabs (Local Repos, Repo, GitHub, Settings)
- `Ctrl+Shift+F`: fetch
- `Ctrl+Shift+P`: command palette
- `Ctrl+Enter`: execute commit (in commit fields)

### 15) Local Planning API and MCP Tools

- Local HTTP API for project planning, bound to `127.0.0.1`
- Preferred port: `2990`; if it is occupied, the app tries the next available local port
- API documentation is served at `http://127.0.0.1:2990/api/`
- Machine-readable API description at `/api/openapi.json`
- All data and MCP endpoints require an API token
  - Token and header name are shown in Settings under `API/MCP`
  - Send the token as `x-open-git-control-token: <TOKEN>` or `Authorization: Bearer <TOKEN>`
  - Users can generate a persistent token for 1 day, 1 month, 1 year, or forever
  - Persistent API tokens are stored OS-encrypted via Electron `safeStorage`; expired tokens are removed automatically
  - Without a persistent token, the app uses a temporary token for the current app process
- Planner endpoints for:
  - listing projects, repositories, tabs, and todos
  - retrieving the next open todos ordered by urgency
  - returning flat project context on every todo (`projectName`, `projectKind`, `projectRepoPath`) for agent-friendly association
  - creating, updating, moving, and deleting todos
  - creating planned projects
  - ensuring a planner project exists for a repository path
- Git and GitHub operations are deliberately not exposed through the local API or MCP tools
- Tab-specific endpoints such as `/api/tabs/bug/todos` and `/api/tabs/working/todos`
  - `working` is accepted as an alias for `in-progress`
- Agent shortcuts:
  - `GET /api/agent/next`
  - `GET /api/mcp/tools`
  - `POST /api/mcp/tools/call`
- MCP-style JSON-RPC endpoint at `/mcp`
  - supports `initialize`, `tools/list`, and `tools/call`
  - exposes planning tools such as `get_next_todos`, `list_todos`, `create_todo`, `move_todo`, and `delete_todo`
- Runtime controls:
  - `OPEN_GIT_CONTROL_API_PORT=2990` to choose the preferred port
  - `OPEN_GIT_CONTROL_API_DISABLED=true` to disable the local API server
  - `OPEN_GIT_CONTROL_API_TOKEN=<TOKEN>` to force a fixed API token and override saved/generated tokens

## Install Git (where and how)

Git must be installed and available in your `PATH`.

### Windows

1. Official download page: [git-scm.com/downloads](https://git-scm.com/downloads)
2. Download and run the Windows installer.
3. The default options are usually correct (including "Git from the command line").
4. Restart your terminal.

### macOS

Option A (recommended with Homebrew):

```bash
brew install git
```

Option B (Apple Command Line Tools):

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

### Verify Installation

```bash
git --version
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

## Development and Local Builds

### Run from Source

Prerequisites:

- Node.js (current LTS)
- npm
- Git

```bash
npm install
npm run dev
```

### Create Local Build Artifacts

```bash
npm run build
npm run dist
```

Platform-specific:

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Output is in `release/`.

## Typical Workflows

### 1) Open first repository or initialize a new one

1. `Local Repositories` -> `Open Repository`.
2. Select a folder.
3. If no repository exists yet: confirm initialization.
4. Then switch to the `Repository` tab.

### 2) Standard local workflow

1. Fetch/Pull from the top bar.
2. Create or switch branch.
3. Work with files in the staging area (stage/unstage/discard).
4. Create commit (optional amend/signoff).
5. Push (optional set upstream or force-with-lease).

### 3) Resolve conflicts

1. When merge/rebase conflicts occur, the conflict resolver opens.
2. For each block choose `Current`, `Incoming`, or `Both`.
3. Save and mark as resolved.
4. Continue merge/rebase.

### 4) GitHub PR flow

1. Connect GitHub (PAT/Device/one-click).
2. Create PR in the repo panel.
3. Check CI status in the PR entry.
4. Merge PR (merge/squash/rebase) or checkout locally.

### 5) Release flow

1. Open `Release` from top bar.
2. Refresh release context.
3. Set tag and release name.
4. Optionally generate AI release notes.
5. Create release.

### 6) Recovery flow

1. Switch to `Recovery Center` in the commit graph.
2. Select a reflog entry.
3. Create a recovery branch or (carefully) hard reset.

### 7) Agent planning API flow

1. Start Open-Git-Control.
2. Open `http://127.0.0.1:2990/api/` for the local API documentation.
3. Ask an external agent to call `GET /api/agent/next?repoPath=...` to find open work for a repository.
4. Let the agent create or move planning items through `/api/todos` or `/mcp` tool calls.
5. Git and GitHub work stays inside the desktop app and is not available through the local API or MCP surface.

## Settings (Overview)

- `General`:
  - theme
  - language (DE/EN)
  - default branch
  - secondary history
  - commit template
  - auto-fetch interval
- `Integrations`:
  - AI provider/models
  - Gemini API key
  - GitHub OAuth Client ID
- `Security`:
  - confirm dangerous ops
  - secret scan before push
  - secret scan strictness + allowlist
- `System`:
  - update status
  - one-click update
  - install update
  - job center

## Data Storage and Security

- Git operations run locally against your selected repository.
- Repositories/settings are stored in the app user-data directory.
- Planning projects and todos are stored locally in the app user-data directory.
- The local planning API binds to `127.0.0.1` and exposes planning data to local processes on your machine.
- GitHub token, Gemini key, and persistent Planning API token are stored OS-encrypted via Electron `safeStorage` when available.
- If OS encryption is unavailable, secrets are not stored persistently.

## Available npm Scripts

- `npm run dev` - Vite + Electron development
- `npm run build` - frontend + Electron build
- `npm run dist` - packaging for current platform
- `npm run dist:win` - Windows package
- `npm run dist:linux` - Linux package
- `npm run dist:mac` - macOS package
- `npm run test` - run tests
- `npm run test:coverage` - run tests with coverage
- `npm run test:ci` - CI-ready test/build chain

## Troubleshooting

- `git not found`
  - Install Git and restart terminal/PC.
  - Verify with `git --version`.
- One-click GitHub login does not work
  - Install GitHub CLI and verify with `gh --version`.
- Device flow does not work
  - Set GitHub OAuth Client ID in settings (or `GITHUB_OAUTH_CLIENT_ID`).
- No PRs visible
  - `origin` must point to GitHub and auth must be active.
- Auto-update not available
  - Update features are only active in installed production builds, not in `npm run dev`.
- Planning API not available on port `2990`
  - Another process may already use the port; check the app log for the actual local API URL.
  - Set `OPEN_GIT_CONTROL_API_PORT` before starting the app to choose another preferred port.
