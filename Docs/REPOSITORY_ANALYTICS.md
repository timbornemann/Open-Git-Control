# Repository statistics and analytics

Open **Statistics & analytics** from the local repository sidebar, a repository's context menu, repository actions or command palette. The dashboard runs offline from existing Git objects. The header and filters stay fixed; only report contents scroll. A saved report appears immediately on reopening, followed by a background refresh. Progress and cancellation use the app's notifications.

The compact toolbar selects history scope and project tree. **Filters** expands date, person and path options; active filters remain visible in its summary when collapsed. Summary figures appear as compact metric cards in **Overview**, while tabs open detailed reports. The cards wrap into multiple rows in narrower windows. The report timestamp and refresh action share the toolbar. Background refreshes retain the displayed report, selected tab, detail page and scroll position until updated results are ready.

Activity charts show commit counts above each bar and localized dates along the time axis, including inactive gaps. Date labels adapt to the chart width. Dense charts scroll horizontally to keep counts legible. Bars remain keyboard accessible and open the corresponding commit period; activity has no additional chart-data table.

Change hotspots use a heatmap in both Overview and the detailed report, including directory grouping. Each equal-sized tile represents one path; its number and color show change frequency, from cool low activity to warm high activity. The scale is relative to the most frequently changed path in the filtered report and stays consistent across detail pages. Hover or keyboard focus shows the full path, change count, contributors, line changes and last change. Clicking a file opens its captured historical version; **History** opens the path's commit history. Arrow keys navigate the map and Escape dismisses its tooltip. Overview previews the 48 most changed files; the detailed report keeps pagination. Frequency does not measure code complexity.

Languages and file types use a combined distribution strip and individual proportional bars, with file counts, line counts and localized percentages. Shares refer to text lines; binary files, LFS, symlinks and submodules appear separately as file counts. CSS bar widths use unformatted numeric ratios regardless of the display locale.

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
