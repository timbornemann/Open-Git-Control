# Moved or unavailable repositories

When a saved repository becomes unavailable, the recovery dialog offers:

- **Choose new location**: Select the relocated project folder. Open-Git-Control validates the Git repository and updates the existing saved entry. Pins, ordering metadata, remote profiles, hosting accounts and the chosen logo are retained. A repository already in the list cannot replace another entry.
- **Recheck**: Retry the saved location, for example after reconnecting an external drive. The repository opens again without changing its settings.
- **Remove repository…**: Open the existing removal confirmation. Removal also cleans up the associated planning data as described in that confirmation.
- **Cancel**: Leave the saved entry unchanged.

Selecting a new location does not move files or initialize Git. The project folder must have been moved together with its `.git` metadata and `.Open-Git-Control` directory. Repository-local planning files, run configurations and secret-scan allowlists remain untouched; their project and task identifiers stay the same. Legacy planning records stored in app data are reassociated with the new path.

A cancelled picker, invalid folder, changed repository context or settings write failure retains the existing entry. Operational errors use the app's notification system. Recovery does not start a Git transfer or change remotes, tracking or commits.
