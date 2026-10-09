# Repository statistics and analytics

Open **Statistics & analytics** from the local repository sidebar, repository actions or command palette. The dashboard runs offline from existing Git objects. The header and filters stay fixed; only report contents scroll. A saved report appears immediately on reopening, followed by a background refresh. Progress and cancellation use the app's notifications.

## Scope and definitions

The default history includes commits reachable from local and existing remote branches and an additional detached HEAD, once per object ID. Tags are version and comparison targets. Stashes, reflogs and internal app refs are excluded. Branch selection, author, path and local author-date filters control history reports; daily, weekly and monthly aggregation are available.

**Project tree** independently selects the committed version used for file counts, physical text lines and blame. Working files and staging never contribute. Text lines include comments and blank lines. Language/file type follows paths and extensions; unknown text formats remain visible. Binary files, LFS pointers, symlinks and submodules have separate file categories and do not contribute artificial text-line counts.

Merge commits count as activity, but merge diffs are not added to churn, change hotspots or coupling. **Change hotspots** measure how often paths change, not code complexity. **Last changed lines** uses standard blame without extra whitespace/copy detection and shows attribution coverage separately. Names and email addresses come from Git and the selected tree's `.mailmap`; matching names alone do not merge identities.

The selected tree's `.gitignore` rules additionally filter already tracked and historical paths for these reports. This differs from normal Git tracking behavior. Nested rules and negations follow Git's matching rules. Global ignores and `.git/info/exclude` do not change project analytics; total commit counts remain complete.

File coupling shows pairs changed together in at least three ordinary commits. Its percentage is shared commits divided by commits changing at least one path. Commits with more than 50 eligible files are omitted only from coupling and counted separately.

Release comparison displays newly reachable commits in `A..B` separately from the net tree diff `A → B`. Non-ancestor targets are explained. The default compares the newest reachable version tag with HEAD. Clicking a path opens its captured commit diff without checking it out; history, people and periods can be inspected directly.

## Local cache and incomplete results

The versioned `repository-analytics` cache lives in app data, outside the repository. It stores commit metadata, per-path counts, blob line counts, blame attribution and aggregates, never full file or patch contents. New commits receive new diff records; unchanged commit records are reused. Removed branches and rewritten history update membership without deleting reusable records. Blob identity reuses line counts. Linear changes rerun blame for touched paths, including changes later reverted; merges and rewrites require an appropriate blame snapshot or fresh attribution.

Ignore and mailmap changes reaggregate existing records. Git version, fixed diff options and relevant attributes determine cache validity. Snapshot publication is atomic; completed records survive interruption, and malformed records are skipped and recomputed. Cancelled calculations are not marked complete. Background Git reads yield to interactive operations and stop on repository changes.

No checkout, index changes, external diff programs, text conversion or lazy object downloads occur. Shallow clones explain their limited local history. Missing objects fail the affected calculation with technical details in the central notification; incomplete reports and blame coverage remain identifiable. No analytics operation adds Git or hosting write access to the local Planning API.
