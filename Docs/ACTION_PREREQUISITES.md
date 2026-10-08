# Explaining unavailable actions

Persistent prerequisites appear next to the disabled action, using the shared `ActionRequirement` UI component. The explanation is associated with the button for assistive technology and is also its tooltip. A separate, enabled action opens the relevant configuration or focuses the missing field. These hints are guidance, not error notifications.

The pattern is used for browser OAuth setup, unavailable GitHub CLI, hosting account and repository creation requirements, release clone selection, release-note context, commits, disabled AI auto-commit, remote profiles and upstream configuration, and unavailable tool installers. Loading, running operations, missing configuration and unsupported installation paths have distinct explanations where applicable. Resolving a prerequisite removes its hint; independent operation locks remain in place.

OAuth setup expands the existing connection settings and focuses the client ID, server address, callback URL or administrator callback approval. It does not save credentials or start authentication. AI auto-commit links to **Settings → AI & API → AI auto-commit** through the existing app navigation; opening this group does not enable the feature. Tool hints open the shared installation instructions; commands require the existing explicit installation flow.

No additional Git, hosting, installation or Planning API permissions are granted. Errors and results continue to use the central notification system.
