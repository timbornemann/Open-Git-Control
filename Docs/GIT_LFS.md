# Git LFS in the Staging Area

Install [Git LFS](https://git-lfs.com/) alongside Git before converting files. Open-Git-Control detects the executable and offers its installation page when it is unavailable; it never installs system software automatically.

## Convert a file

Right-click a staged, unstaged or new file and choose **Store and stage with Git LFS**. In the staged section, this converts the exact index version, including a partially staged version. In the other sections, it converts and stages the current working content. The working file retains its complete content.

**Manage file type with Git LFS (\*.psd)** first explains the pattern and its repository-wide scope. Only the selected file is converted immediately. Matching files use the rule when next staged; existing nested exclusions still apply. An incompatible exclusion prevents conversion and points to the individual-file action.

Individual rules are literal filenames in the file's directory. File-type rules live at the repository root. The required `.gitattributes` rule is also staged. Existing unstaged edits to that attributes file are preserved separately, and unrelated index entries, file modes and partially staged changes are retained. Conversion starts with the next commit; historical commits are not rewritten.

## Recommendations

The small warning-colored exclamation mark after a filename explains the reason, size and context-menu action on hover. The centralized defaults in `electron/git/GitLfsRules.ts` are:

| File                                                           | Minimum size                |
| -------------------------------------------------------------- | --------------------------- |
| Known media, design, model, archive, document and font formats | 1 MiB                       |
| Other files detected as binary from a bounded content sample   | 10 MiB                      |
| Source, text configuration, small icons and empty files        | No automatic recommendation |

Document formats include PDF, Office documents and spreadsheets, OpenDocument files and EPUB. Already configured files and LFS pointers have no recommendation. Configured files whose index still contains ordinary content offer **Restage for Git LFS**. Deleted files, conflicts, symlinks, submodules and Git control files cannot be converted. Other regular files may be converted manually without a recommendation.

## Viewer, safety and transfers

Staged and commit previews, relative images and hashes use the corresponding local LFS object. The shared object store of linked worktrees and custom `lfs.storage` are respected. Missing objects are explained; unrelated working files never replace the selected version. Saving staged LFS text runs the clean filter again and puts a pointer in the index. Commit versions remain read-only.

Version checks and the Git index lock reject concurrent changes; failures restore the application's own attributes changes without overwriting competing edits. Existing hooks and custom hook directories are preserved. Filters are installed locally using the official [local/skip-repo installation options](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-install.adoc).

Push plans capture LFS object IDs and effective endpoints. Each destination receives its objects before its Git refs. A failed destination retains its own result and can be retried independently. Pull uses the selected source; normal clone checkout uses Git LFS. Native download exclusions, skip-smudge settings and SSH authentication remain effective. Background Git Fetch does not add an LFS download step.

Account credentials are restricted to the selected Git repository and its verified LFS endpoint. Separate external LFS servers require the existing system-credential mode. Endpoint discovery follows [Git LFS server discovery](https://github.com/git-lfs/git-lfs/blob/main/docs/api/server-discovery.md).

Secret checks inspect the actual LFS text using the existing scan rules. Missing objects, integrity failures and text exceeding the bounded scan limits prevent a successful scan approval. Binary content follows the existing binary-file scan policy. LFS locking, history migration and quota management are outside this integration.

Real Git/Git LFS tests require `git lfs version` to work. Run the complete verification with `npm run test:ci`.
