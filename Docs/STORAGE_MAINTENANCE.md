# Storage and automatic data maintenance

**Settings → App & Diagnostics → Storage & cleanup** displays actual file sizes, budgets, reclaimable data and reasons for preserving or deferring data. Automatic maintenance is enabled by default. The first pass starts 30 seconds after startup, then every six hours and after repository removal or relocation. Background requests are coalesced and active cache writers are protected.

**Check now** inventories storage and checks repositories. **Run due cleanup** applies retention periods and budgets. **Clear rebuildable caches** removes supported cache contents. Completed recovery operations have a separate selection and confirmation.

## Storage catalogue

The shared Electron `userData` directory normally resides at `%APPDATA%\Open-Git-Control` on Windows. Development and installed builds share repository registration, settings and logins.

Known per-repository UI preferences live in `repository-ui-state.json`. Supported legacy sidebar preferences are migrated from `localStorage` once, and the old copy is removed only after a successful save. These associations share the 30-day return period used for remote preferences.

| Area                                                           | Purpose and retention                                                                                                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos.json`                                                   | Versioned repository list, activation, pins and sorting. Removal requires 90 days of confirmed absence, checks on at least three distinct days and another probe immediately before removal. |
| Remote preferences, run approvals, manual logo selection       | Unneeded associations are kept for 30 days after removal. Reopening cancels expiry. Required references and unresolved operations prevent pruning.                                           |
| `preview-cache-v1`                                             | Provisional previews; 128 MiB. Consuming a preview refreshes its current source.                                                                                                             |
| `repository-analytics/v1`                                      | Recomputable analytics; 512 MiB total and at most 256 MiB per repository. Git and analysis fingerprints identify cache contexts.                                                             |
| `commit-stats-v1.jsonl`                                        | Recomputable commit statistics; 25 MiB. Supported invalid and duplicate entries are removed by compaction.                                                                                   |
| `Cache/Cache_Data`                                             | Chromium HTTP responses and cache indexes; 128 MiB. File modification dates do not establish whether entries are unused.                                                                     |
| `Code Cache`, `development-code-cache`                         | Separate installed and development code caches; 128 MiB combined.                                                                                                                            |
| Hosting catalogues, generated logos, supported graphics caches | 64 MiB. Manual logo preferences survive clearing generated images. Graphics caches use Electron operations only.                                                                             |
| Publication and allowlist migration journals                   | Open and ambiguous operations are preserved. Completed metadata is pruned only when its repository association is unnecessary and the return period has expired.                             |
| `storage-maintenance-v1.json`                                  | Observation periods, actual usage, recovery ownership, return tickets and reports. At most 30 reports totalling 1 MiB.                                                                       |
| Settings, encrypted credentials, Chromium login storage        | Protected; clearing caches preserves logins and UI settings.                                                                                                                                 |
| Update installers                                              | Listed separately; maintenance does not remove them.                                                                                                                                         |

Previews, analytics and catalogues expire after **30 days without actual use**. Budget pressure evicts the least recently used supported data first. Inventory reads do not count as use. Existing files receive new observation periods on first inventory; their previous file ages are not deletion evidence.

The approximately 1 GiB cache budget is **not an AppData directory limit**. Required settings, logins, active work files, recovery data and unknown contents are separate. Analytics calculations continue when the cache is full; additional results remain in memory until persistence becomes possible.

## Repository integrity

Unavailable drives, access errors, timeouts, missing Git and invalid Git structures reset the missing period. Bounded probes execute outside the Electron main process. Active repositories and running operations cannot be automatically removed.

The renderer sends targeted mutations instead of rewriting complete snapshots. The main process publishes revisioned changes, preventing stale windows from restoring removed entries. Unreadable or future registry formats never become an empty replacement list. Inventory remains available with cleanup blocked when administrative files cannot be read.

The existing **Choose new location** flow transfers owner associations and preferences. Path-dependent caches are invalidated. Command approvals are not transferred to another path. Maintenance never changes repository files or local planning content.

## Browser caches and temporary workspaces

Development disables the HTTP disk cache before Electron startup and uses its own code-cache path. Browser caches are reset through `clearCache`, `clearCodeCaches` and Electron's supported shader-cache operation after 30 days or detected budget pressure. Chromium index files are never deleted individually based on age. A dedicated maintenance context opens inactive code caches without using normal-session logins.

During development, the existing installed HTTP cache is temporarily handed to a dedicated maintenance profile as one complete directory. A short-lived Electron process clears it through the Session API before the directory is returned. Ownership markers and atomic directory handoffs allow retries after interrupted processes; conflicting or unknown backends are preserved. The shared login profile is not opened a second time. Browser cache writes trigger coalesced budget checks, and cache operations are deferred while pages are loading.

Existing owned crash leftovers receive a new seven-day observation period at their first inventory. Large JSONL files use bounded read buffers. Unknown or oversized individual records are retained and prevent overwriting the affected cache.

New private workspaces use `%TEMP%/open-git-control-workspaces` and an ownership marker. Normal completion removes them. Crash leftovers are removed only after seven days, verified ownership and proof that the owner process is inactive. Unmarked directories, symlinks and junctions are preserved. Legacy arbitrary `ogc-*` temp directories are not swept.

## Recovery and protected data

Repository files, `.git`, `.Open-Git-Control`, planning, credentials, recovery journals and Git backup references are excluded from automatic deletion. Previously observed common Git directories remain available for detecting unresolved operations after a linked worktree disappears.

Existing completed backups remain associated and visible after the repository return period expires. They can be explicitly cleaned through the previously verified common Git directory when it is available. Removing the final backup releases an otherwise unnecessary app association. A confirmed deleted Git directory is distinguished from an unavailable drive.

Completed commit-message operations can be selected separately. Confirmed cleanup rechecks journal ownership, supported format, completion state and the expected backup object ID. Reference removal uses a conditional Git transaction. Git failures or changed journals preserve recovery metadata. Repeated requests are harmless. Maintenance never runs **`git gc`**. Storage totals count journals and loose backup references; shared Git objects are not attributed to individual backups.

Unknown files, unsupported versions, damaged administrative files and redirected paths are preserved and reported. Deletion revalidates paths, ownership, current associations and usage. Cache writers and maintenance share usage tracking and write protection; replacements are atomic.

## Extending and testing

New persistence must be registered in `electron/main-process/storageCatalogue.ts` with classification, owner verification, supported formats, meaningful use, retention, budgets and safe cleanup. Registering a path alone does not authorize arbitrary deletion. Implement matching validation and tests; unregistered contents remain protected.

Focused tests cover controlled clocks, restarts, return periods, relocation, offline states, concurrent usage, corrupt files, future formats, junctions, recovery and bounded growth. `npm run test:storage:electron` exercises actual Electron cache operations using isolated temporary profiles and verifies preserved logins and settings. `npm run test:ci` runs all project checks.

Electron references: [Command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches), [Session API](https://www.electronjs.org/docs/latest/api/session).
