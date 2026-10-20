# Open Git Control repository data

This directory contains repository-local data created by [Open Git Control](https://github.com/timbornemann/Open-Git-Control):

- `run.json` is the repository-local workflow configuration for optional command workflows in the **Run** menu.
- `planning.json` contains this repository's project plan and todos.
- `secret-scan-allowlist.txt` contains shared secret-scan exceptions. Saved working-tree rules apply immediately; commit the file to share them with your team.
- `notes-to-user/` in the official Open-Git-Control repository contains messages for app users (see below).

Commit this directory when you want to share and version these workflows and planning data with your team. These files are optional and are only created when their respective feature is used.

## Publishing user notices

Only the official `timbornemann/Open-Git-Control` repository supplies app-wide notices. Publish changes on its default branch; no app release or GitHub sign-in is required. The app checks at startup and every four hours when automatic notice checks are enabled.

Place one Markdown file directly in `notes-to-user/` for each notice. Files are displayed as pages, sorted by filename in descending order. Use names such as `2026-10-20-service-information.md` to put recent notices first. The first level-one heading (`# Title`) supplies the page title; otherwise the filename is used. Text is shown in its authored language.

Use normal Markdown for headings, lists, tables, checkboxes, code blocks and HTTPS links. Put PNG, JPEG, GIF, WebP, AVIF or BMP images in this folder or its subfolders and reference them relatively, for example `![Service status](assets/status.png)`. External images, scripts, embedded players and frames are not loaded. Other content can be linked with HTTPS. Keep Markdown files below 256 KiB and individual images below 4 MiB; the app also enforces its preview and storage budgets.

Users can browse pages and acknowledge all displayed revisions together. Editing a notice or one of its referenced images makes it unread again. Acknowledged notices remain in **Settings → App & diagnostics → User notices**, including offline. Deleting a notice from GitHub removes its saved copy after the next successful complete synchronization; unused image data is removed at the same time. Failed checks preserve the previous saved content.

Automatic notice checks and automatic update checks have separate switches. Disabling both prevents these automatic GitHub requests; cached notices remain readable. Manually initiated checks and Git/GitHub actions are still available.

## Created with Open Git Control

[Open Git Control](https://github.com/timbornemann/Open-Git-Control) is a desktop app for working with local Git repositories. It brings together staging and commits, branches and remotes, a commit graph, GitHub tools, project planning, AI assistance, and configurable repository workflows.

- [Open the Open Git Control repository](https://github.com/timbornemann/Open-Git-Control)
- [View Open Git Control releases](https://github.com/timbornemann/Open-Git-Control/releases)
